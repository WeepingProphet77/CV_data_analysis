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

console.log(failures ? `\n${failures} FAILURE(S)\n` : `\nAll persistence checks passed.\n`);
process.exit(failures ? 1 : 0);
