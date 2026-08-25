/**
 * Production data-layer checks.
 *
 * Runs against the synthetic sample always, and additionally against the real
 * ScheduledProdRptDtl.xls when it happens to be present in the working
 * directory (it is gitignored, so CI sees only the sample).
 *
 *   node scripts/production-test.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { csvToRecords } from "../src/core/csv.js";
import { mapColumns, toIsoDate, toNumber } from "../src/core/parse.js";
import schema from "../src/modules/production/schema.js";
import { groupBy, sumBy, distinct, rollup } from "../src/core/aggregate.js";
import { monthsIn, weeksOf } from "../src/core/calendar.js";
import { buildColumns, daySpan } from "../src/modules/production/board.js";

let failures = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "} ${name}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};
const ok = (name, cond, detail = "") => {
  if (!cond) failures++;
  console.log(`${cond ? "  ok  " : "FAIL  "} ${name}${detail ? ` (${detail})` : ""}`);
};

const toText = (v) => (v == null ? "" : String(v).trim());

function build(records, headers) {
  const { mapping, missing, unmapped } = mapColumns(headers, schema);
  const rows = records.map((rec) => {
    const row = {};
    for (const f of schema.fields) {
      const v = rec[mapping[f.key]];
      row[f.key] = f.type === "date" ? toIsoDate(v) : f.type === "number" ? toNumber(v) : toText(v);
    }
    // Mirrors parse.js: anything the schema doesn't name is carried in `extra`.
    if (unmapped.length) {
      const extra = {};
      for (const h of unmapped) { const v = toText(rec[h]); if (v !== "") extra[h] = v; }
      if (Object.keys(extra).length) row.extra = extra;
    }
    return { ...row, ...schema.derive(row) };
  }).filter((r) => !schema.isEmptyRow(r));
  return { rows, missing, unmapped, mapping };
}

/**
 * No column may be silently discarded: each export header must either map to a
 * schema field, survive in `extra`, or be empty in every single row.
 */
function unreachableColumns(headers, mapping, rows, records) {
  const byHeader = Object.fromEntries(Object.entries(mapping).map(([k, h]) => [h, k]));
  return headers.filter((h) =>
    byHeader[h] === undefined &&
    !rows.some((r) => r.extra && h in r.extra) &&
    !records.every((rec) => toText(rec[h]) === "")
  );
}

console.log("\nSchema derivations");
const d = schema.derive({ job: "43134 - 1401 CHURCH STREET", phase: "2 - Building 2", comment: "<b>Bed Comment:</b> Build New Mold", qty: 1, plant: "P", bed: "Pad 1" });
eq("numeric job number split", [d.jobNo, d.jobTitle], ["43134", "1401 CHURCH STREET"]);
eq("phase label stripped", d.phaseName, "Building 2");
eq("comment HTML stripped", d.note, "Build New Mold");
eq("bed key is plant-scoped", d.bedKey, "P · Pad 1");
eq("qty>0 is a pour", d.isPour, true);

const alpha = schema.derive({ job: "45112P2 - Mariposa Grove P2", qty: 0, plant: "P", bed: "B" });
eq("alphanumeric job number split", [alpha.jobNo, alpha.jobTitle], ["45112P2", "Mariposa Grove P2"]);
eq("qty=0 is not a pour", alpha.isPour, false);

const noNum = schema.derive({ job: "SOME JOB WITH NO NUMBER", qty: 1, plant: "P", bed: "B" });
eq("unnumbered job keeps its full title", [noNum.jobNo, noNum.jobTitle], ["", "SOME JOB WITH NO NUMBER"]);
eq("N/A comment becomes blank", schema.derive({ comment: "N/A", job: "x", qty: 0 }).note, "");

console.log("\nRow retention");
ok("qty=0 row is KEPT (bed activity is schedule information)",
   !schema.isEmptyRow({ date: "2026-08-01", plant: "P", bed: "Pad 1", qty: 0 }));
ok("row with no date is dropped", schema.isEmptyRow({ date: "", plant: "P", bed: "Pad 1", qty: 1 }));
ok("row with no bed is dropped", schema.isEmptyRow({ date: "2026-08-01", plant: "P", bed: "", qty: 1 }));

console.log("\nSynthetic sample end-to-end");
const csv = csvToRecords(readFileSync("samples/production.sample.csv", "utf8"));
const s = build(csv.records, csv.headers);
eq("no required columns missing", s.missing.map((f) => f.label), []);
ok("rows parsed", s.rows.length > 1000, `${s.rows.length} rows`);
ok("has both pour and bed-activity rows",
   s.rows.some((r) => r.isPour) && s.rows.some((r) => !r.isPour));
ok("bed-activity rows carry no volume",
   s.rows.filter((r) => !r.isPour).every((r) => r.sf === 0 && r.cy === 0 && r.lf === 0));
ok("every row lands on a calendar day", s.rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)));
eq("months resolve", monthsIn(s.rows.map((r) => r.date)), ["2026-08"]);

console.log("\nNothing is discarded at import");
// A column the schema doesn't know about must still reach the detail view.
const withNew = csv.records.map((r) => ({ ...r, "Future CV Column": "kept-me" }));
const grown = build(withNew, [...csv.headers, "Future CV Column"]);
ok("an unknown column is reported as unmapped", grown.unmapped.includes("Future CV Column"));
ok("its values survive on the row",
   grown.rows.every((r) => r.extra?.["Future CV Column"] === "kept-me"));
eq("no column is unreachable",
   unreachableColumns([...csv.headers, "Future CV Column"], grown.mapping, grown.rows, withNew), []);
// An always-empty column costs nothing: no `extra` object is created for it.
const blank = build(csv.records.map((r) => ({ ...r, "Always Blank": "" })), [...csv.headers, "Always Blank"]);
ok("an always-empty column adds no payload",
   blank.rows.every((r) => !r.extra || !("Always Blank" in r.extra)));

console.log("\nCalendar grid");
const wk = weeksOf("2026-08");
ok("whole weeks only", wk.every((w) => w.length === 7), `${wk.length} weeks`);
eq("starts on a Sunday", wk[0][0].getDay(), 0);
eq("ends on a Saturday", wk[wk.length - 1][6].getDay(), 6);
ok("covers every day of the month",
   [...Array(31)].every((_, i) => wk.flat().some((d) => d.getMonth() === 7 && d.getDate() === i + 1)));
// Feb 2026 starts on a Sunday and has 28 days -> exactly 4 unpadded weeks.
eq("a clean month needs no padding", weeksOf("2026-02").length, 4);
// A month whose 1st is a Saturday is the worst case for padding.
ok("padded month still rectangular", weeksOf("2026-08").flat().length % 7 === 0);

console.log("\nBoard columns");
const span = daySpan("2026-08-24", "2026-08-30");
eq("span is contiguous and inclusive", span,
   ["2026-08-24","2026-08-25","2026-08-26","2026-08-27","2026-08-28","2026-08-29","2026-08-30"]);
ok("span includes Sundays absent from the data", span.includes("2026-08-30"));
const cols = buildColumns(span);
eq("one column per day plus a week total", cols.filter((c) => c.type === "day").length, 7);
eq("week total closes the Mon-Sun week", cols[cols.length - 1].type, "week");
eq("week total covers all 7 days", cols[cols.length - 1].days.length, 7);
// A range ending mid-week must still close out its trailing partial week.
const partial = buildColumns(daySpan("2026-08-24", "2026-08-27"));
eq("partial trailing week still totalled", partial[partial.length - 1].type, "week");
eq("partial week covers only its days", partial[partial.length - 1].days.length, 4);
// Two full weeks -> two week-total columns, no day counted twice.
const two = buildColumns(daySpan("2026-08-24", "2026-09-06"));
const weekCols = two.filter((c) => c.type === "week");
eq("two weeks produce two totals", weekCols.length, 2);
eq("no day appears in two week totals",
   new Set(weekCols.flatMap((c) => c.days)).size, weekCols.reduce((a, c) => a + c.days.length, 0));

console.log("\nAggregation invariants");
const total = sumBy(s.rows, (r) => r.qty);
const byPlant = rollup(s.rows, (r) => r.plant, (r) => r.qty);
eq("plant rollup conserves pieces", byPlant.reduce((a, g) => a + g.value, 0), total);
const byDate = rollup(s.rows, (r) => r.date, (r) => r.sf);
eq("date rollup conserves SF",
   +byDate.reduce((a, g) => a + g.value, 0).toFixed(4),
   +sumBy(s.rows, (r) => r.sf).toFixed(4));
const bedDays = new Set(s.rows.map((r) => `${r.bedKey}|${r.date}`));
ok("bed-days <= rows", bedDays.size <= s.rows.length, `${bedDays.size} bed-days`);
ok("pieces counted by qty, not row count",
   total !== s.rows.length, `${total} pieces vs ${s.rows.length} rows`);

/* -- The real export, when it is sitting in the working directory -------- */
const REAL = "ScheduledProdRptDtl.xls";
if (existsSync(REAL)) {
  console.log("\nReal export (local only — gitignored)");
  const XLSX = await import("xlsx");
  const wb = XLSX.read(readFileSync(REAL), { type: "buffer", cellDates: true, raw: true });
  const recs = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
  const r = build(recs, Object.keys(recs[0]));
  eq("no required columns missing", r.missing.map((f) => f.label), []);
  eq("every column is mapped", r.unmapped, []);
  eq("no column unreachable", unreachableColumns(Object.keys(recs[0]), r.mapping, r.rows, recs), []);
  eq("every row retained", r.rows.length, recs.length);
  ok("bed-activity rows carry no volume",
     r.rows.filter((x) => !x.isPour).every((x) => x.sf === 0 && x.cy === 0));
  ok("every job parsed a number", r.rows.every((x) => x.jobNo), 
     `${new Set(r.rows.filter((x) => !x.jobNo).map((x) => x.job)).size} without`);
  console.log(`        ${r.rows.length} rows · ${sumBy(r.rows, (x) => x.qty)} pieces · ` +
              `${Math.round(sumBy(r.rows, (x) => x.sf)).toLocaleString()} SF · ` +
              `${new Set(r.rows.map((x) => `${x.bedKey}|${x.date}`)).size} bed-days · ` +
              `${distinct(r.rows, (x) => x.plant).length} plants`);
} else {
  console.log("\n  --  real export not present; skipped (expected in CI)");
}

console.log(failures ? `\n${failures} FAILURE(S)\n` : `\nAll production checks passed.\n`);
process.exit(failures ? 1 : 0);
