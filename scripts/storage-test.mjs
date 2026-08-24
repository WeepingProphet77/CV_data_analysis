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

console.log(failures ? `\n${failures} FAILURE(S)\n` : `\nAll persistence checks passed.\n`);
process.exit(failures ? 1 : 0);
