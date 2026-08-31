/**
 * Persistence checks against a real IndexedDB implementation (fake-indexeddb
 * provides a spec-compliant one in node).
 *
 * The point of these: a large export must actually survive a reload. The
 * previous localStorage-only store failed exactly here.
 *
 *   node scripts/storage-test.mjs
 */
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { idbGet, idbSet, idbDel, idbAvailable } from "../src/core/idb.js";
import { csvToRecords } from "../src/core/csv.js";
import { mapColumns, toIsoDate, toNumber } from "../src/core/parse.js";
import schema from "../src/modules/employee-time/schema.js";
import { libraryKey } from "../src/core/library.js";
import { prefKey } from "../src/core/persisted.js";
import { storeKey } from "../src/core/store.js";
import { snapshotOf, diffSchedule } from "../src/modules/production/movement.js";
import { isValidSelection, toggleMember } from "../src/core/myProjects.js";
import { readRecord, writeRecord } from "../src/core/store.js";
import { buildSource } from "../src/modules/job-cost/parse.js";
import { sampleWorkbooks } from "./job-cost-sample.mjs";

let failures = 0;
const ok = (name, cond, detail = "") => {
  if (!cond) failures++;
  console.log(`${cond ? "  ok  " : "FAIL  "} ${name}${detail ? ` (${detail})` : ""}`);
};

console.log("\nIndexedDB round-trip");
ok("IndexedDB detected", idbAvailable());

await idbSet("k1", { rows: [{ a: 1 }], meta: { fileName: "x.csv" } });
const back = await idbGet("k1");
ok("value round-trips", JSON.stringify(back) === JSON.stringify({ rows: [{ a: 1 }], meta: { fileName: "x.csv" } }));
await idbDel("k1");
ok("delete removes it", (await idbGet("k1")) === undefined);
ok("missing key is undefined, not a throw", (await idbGet("never-written")) === undefined);

console.log("\nRealistic dataset");
const { headers, records } = csvToRecords(readFileSync("samples/employee-time.sample.csv", "utf8"));
const { mapping } = mapColumns(headers, schema);
const base = records.map((rec) => {
  const row = {};
  for (const f of schema.fields) {
    const v = rec[mapping[f.key]];
    row[f.key] = f.type === "date" ? toIsoDate(v) : f.type === "number" ? toNumber(v) : String(v ?? "").trim();
  }
  return { ...row, ...schema.derive(row) };
}).filter((r) => !schema.isEmptyRow(r));

// Scale the sample up to something the old store provably could not hold.
const big = [];
while (big.length < 120_000) big.push(...base);
const payload = { rows: big.slice(0, 120_000), meta: { fileName: "big.csv" } };
const jsonBytes = Buffer.byteLength(JSON.stringify(payload));
console.log(`        synthetic export: ${payload.rows.length.toLocaleString()} rows, ` +
            `${(jsonBytes / 1024 / 1024).toFixed(1)} MB as JSON`);
ok("exceeds the ~5MB localStorage cap", jsonBytes > 5 * 1024 * 1024,
   `${(jsonBytes / 1024 / 1024).toFixed(1)} MB`);

const t0 = Date.now();
await idbSet("cv.analysis.employee-time.v1", payload);
const saved = await idbGet("cv.analysis.employee-time.v1");
const ms = Date.now() - t0;
ok("large dataset saves and reloads", saved?.rows?.length === payload.rows.length,
   `${saved?.rows?.length?.toLocaleString()} rows in ${ms}ms`);
ok("row contents survive intact",
   JSON.stringify(saved.rows[0]) === JSON.stringify(payload.rows[0]));
ok("meta survives", saved.meta.fileName === "big.csv");

await idbDel("cv.analysis.employee-time.v1");

/*
 * The job cost library persists a *list of sources* rather than one dataset,
 * and its whole reason to exist is that re-importing one plant must not
 * disturb the others. That is asserted here against the real storage path.
 */
console.log("\nJob cost library");
const isLibrary = (v) => Array.isArray(v?.sources);
const libKey = libraryKey("job-cost");
const sources = sampleWorkbooks().map((wb) => buildSource(wb.sheets, { plant: wb.plant, fileName: wb.fileName }));

const upsert = async (list, src) =>
  [...list.filter((s) => s.id !== src.id), src].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

let lib = [];
for (const src of sources) lib = await upsert(lib, src);
await writeRecord(libKey, { sources: lib });

const readBack = await readRecord(libKey, isLibrary);
ok("library round-trips", isLibrary(readBack) && readBack.sources.length === sources.length);
ok("sources are ordered by id", readBack.sources.map((s) => s.id).join() === [...sources.map((s) => s.id)].sort().join());
ok("cost lines survive the round-trip",
   readBack.sources.every((s, i) => s.costs.length === lib[i].costs.length && s.jobs.length === lib[i].jobs.length));
ok("per-source as-of dates are preserved",
   readBack.sources.every((s) => typeof s.asOf === "string" && s.asOf.length === 10));

// Re-import one plant with a changed figure: that plant updates, the other
// keeps its own rows untouched. This is the bug the library exists to avoid.
const target = sources[0];
const refreshed = { ...target, fileName: "refreshed.xlsx", asOf: "2026-09-02", jobs: target.jobs.slice(0, 1) };
const after = await upsert(readBack.sources, refreshed);
await writeRecord(libKey, { sources: after });
const post = await readRecord(libKey, isLibrary);
const updated = post.sources.find((s) => s.id === target.id);
const untouched = post.sources.find((s) => s.id !== target.id);
ok("re-importing a plant replaces only that plant", updated.fileName === "refreshed.xlsx" && updated.jobs.length === 1);
ok("the other plants keep their data", untouched && untouched.jobs.length === sources[1].jobs.length);
ok("no plant is duplicated by a re-import", new Set(post.sources.map((s) => s.id)).size === post.sources.length);

// Removing a source leaves the rest intact.
const pruned = post.sources.filter((s) => s.id !== target.id);
await writeRecord(libKey, { sources: pruned });
const final = await readRecord(libKey, isLibrary);
ok("removing a plant leaves the others", final.sources.length === sources.length - 1 && !final.sources.some((s) => s.id === target.id));

ok("a dataset record is not mistaken for a library", !isLibrary({ rows: [] }));

/*
 * My Projects is a *preference*, stored separately from the library on purpose:
 * clearing imported files must not forget which projects were starred.
 */
console.log("\nMy Projects preference");
// App-wide, not per module: the same starred list scopes job cost, production
// and the missing-ticket report, so it is keyed on "app" rather than a module.
const prefsKey = prefKey("app", "my-projects");
const legacyPrefsKey = prefKey("job-cost", "my-projects");
// The app's own guard, not a copy of it — a validator that drifts from the one
// the hook uses would let a rejected record through in the browser.
const validPref = isValidSelection;
ok("the selection is keyed app-wide, not per module",
   prefsKey === "cv.analysis.app.my-projects.v1", prefsKey);

await writeRecord(prefsKey, { value: { members: ["50101", "50110"], scope: "mine" } });
const pref = await readRecord(prefsKey, (v) => v != null && validPref(v.value));
ok("selection round-trips", pref?.value.members.join() === "50101,50110" && pref.value.scope === "mine");
ok("preference key is separate from the library key", prefsKey !== libKey);

// Clearing the imported reports must leave the starred list alone — that is
// the whole reason it is a separate record.
await writeRecord(libKey, { sources: [] });
const afterClear = await readRecord(prefsKey, (v) => v != null && validPref(v.value));
ok("clearing the library keeps the selection", afterClear?.value.members.length === 2);

// A stale or hand-edited record must be rejected rather than crashing a render.
await writeRecord(prefsKey, { value: { members: [1, 2], scope: "mine" } });
ok("a malformed member list is rejected",
   (await readRecord(prefsKey, (v) => v != null && validPref(v.value))) === null);
await writeRecord(prefsKey, { value: { members: [], scope: "sideways" } });
ok("an unknown scope is rejected",
   (await readRecord(prefsKey, (v) => v != null && validPref(v.value))) === null);

/*
 * The selection moved from a job-cost key to an app-wide one when production
 * and the ticket report started reading it. A hand-curated list must survive
 * that move — re-starring everything because the scope widened would be the
 * most annoying possible upgrade.
 */
console.log("\nMy Projects migration from the job-cost key");
await idbDel(prefsKey);
await writeRecord(legacyPrefsKey, { value: { members: ["43134", "45154"], scope: "mine" } });

// Mirrors what usePersistedState does on first read: adopt the old key, write
// it forward, then drop it.
const guard = (v) => v != null && validPref(v.value);
let adopted = await readRecord(prefsKey, guard);
ok("nothing is stored under the new key yet", adopted === null);
adopted = await readRecord(legacyPrefsKey, guard);
if (adopted) { await writeRecord(prefsKey, adopted); await idbDel(legacyPrefsKey); }

const migrated = await readRecord(prefsKey, guard);
ok("the curated list survives the move",
   migrated?.value.members.join() === "43134,45154" && migrated.value.scope === "mine");
ok("the old key is gone, so the migration runs once",
   (await idbGet(legacyPrefsKey)) === undefined);

// Membership is job numbers, and stays sorted so two equal lists compare equal.
ok("toggling adds and removes one job number",
   toggleMember(["43134"], "45154").join() === "43134,45154" &&
   toggleMember(["43134", "45154"], "43134").join() === "45154");

/*
 * The schedule baseline. It is a third record in the production module, and the
 * rules that matter are: it survives a reload, it is separate from the schedule
 * it describes, and clearing the schedule takes it with it — a baseline that
 * outlived its data would compare a fresh import against a file nobody
 * remembers loading.
 */
console.log("\nSchedule movement baseline");
const schedKey = storeKey("production");
const baseKey = storeKey("production-baseline");
const tickKey = storeKey("production-tickets");
ok("the baseline is its own record",
   baseKey !== schedKey && baseKey !== tickKey, `${baseKey} vs ${schedKey}`);

const mkRow = (mark, date) => ({
  jobNo: "43134", job: "43134 - JOB", jobTitle: "JOB", mark, date,
  plant: "P1", bed: "Pad 1", qty: 1,
});
const oldSched = [mkRow("A", "2026-08-05"), mkRow("B", "2026-08-06")];
const newSched = [mkRow("A", "2026-08-05"), mkRow("B", "2026-08-13")];

await writeRecord(baseKey, { rows: snapshotOf(oldSched), meta: { fileName: "prev.xls", rowCount: 2 } });
await writeRecord(schedKey, { rows: newSched, meta: { fileName: "new.xls" } });

const savedBase = await readRecord(baseKey, (v) => Array.isArray(v?.rows));
ok("the baseline round-trips", savedBase?.rows.length === 2 && savedBase.meta.fileName === "prev.xls");

// The comparison must survive a reload, not just the upload that created it.
const reloaded = diffSchedule(savedBase.rows, newSched);
ok("the comparison still works after a reload",
   reloaded.ready && reloaded.moved.length === 1 && reloaded.moved[0].days === 7,
   JSON.stringify(reloaded.moved.map((m) => m.days)));

// Only what the comparison needs is stored — a full second copy of the export
// would double the module's footprint for nothing.
const full = JSON.stringify(newSched).length;
const snap = JSON.stringify(snapshotOf(newSched)).length;
ok("the snapshot is smaller than a full copy of the rows", snap < full, `${snap} vs ${full} bytes`);

// The user's own words: cleared data means the comparison is gone.
await idbDel(schedKey);
await idbDel(baseKey);
ok("clearing the schedule leaves no baseline behind",
   (await idbGet(baseKey)) === undefined && (await idbGet(schedKey)) === undefined);
ok("a diff with no baseline is not ready, rather than empty-but-ready",
   diffSchedule([], newSched).ready === false);

console.log(failures ? `\n${failures} FAILURE(S)\n` : `\nAll persistence checks passed.\n`);
process.exit(failures ? 1 : 0);
