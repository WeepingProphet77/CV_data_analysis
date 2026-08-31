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
import { buildTicketSource, parseJobBanner, parsePlantBanner, ticketKeyOf } from "../src/modules/production/ticketParse.js";
import { ticketIndex, ticketFor, ticketCoverage, byJob, byDrafter, urgency } from "../src/modules/production/tickets.js";
import { ticketSheet, sampleTicketSheet, AUG_1 } from "./production-ticket-sample.mjs";

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
/* -- Missing Piece Mark Ticket report ---------------------------------- */

console.log("\nTicket report banners");
eq("plant banner", parsePlantBanner("Ashland City (100 pieces)"), { plant: "Ashland City", declared: 100 });
eq("plant banner with no count", parsePlantBanner("Ashland City"), { plant: "Ashland City", declared: null });
eq("job banner with a group",
   parseJobBanner("43134 - 1401 CHURCH STREET (Gate - Bre) - 25 pieces"),
   { jobNo: "43134", jobTitle: "1401 CHURCH STREET", group: "Gate - Bre", declared: 25 });
eq("job banner with no group",
   parseJobBanner("42375 - Texas Instruments - 1 pieces"),
   { jobNo: "42375", jobTitle: "Texas Instruments", group: "", declared: 1 });
// The job title itself can contain " - "; the count suffix is what closes it.
eq("job title containing a dash survives",
   parseJobBanner("43089 - Samsung - Garage (UA) - 1 pieces"),
   { jobNo: "43089", jobTitle: "Samsung - Garage", group: "UA", declared: 1 });
eq("unparseable banner keeps the job number",
   parseJobBanner("46003 - STHS TYLER PG"),
   { jobNo: "46003", jobTitle: "STHS TYLER PG", group: "", declared: null });

console.log("\nTicket report walk");
const ts = buildTicketSource(sampleTicketSheet(), { fileName: "sample.xlsx" });
eq("every detail row read", ts.rows.length, 7);
eq("grand total agrees with the rows read", ts.grandTotal, ts.rows.length);
eq("no import warnings on a clean report", ts.warnings, []);
eq("jobs walked", ts.jobs.map((j) => j.jobNo), ["43134", "45154", "49999"]);
eq("plants walked", ts.plants.map((p) => p.plant), ["Sample Plant A", "Sample Plant B"]);
// Reconciliation is the check that proves the walk classified every row: a
// banner subtotal that stops matching means a row landed in the wrong bucket.
ok("every job banner reconciles", ts.jobs.every((j) => j.declared === j.pieces));
ok("every plant banner reconciles", ts.plants.every((p) => p.declared === p.pieces));
eq("plant totals sum to the grand total",
   ts.plants.reduce((a, p) => a + p.pieces, 0), ts.grandTotal);
eq("banner group reaches the detail rows",
   [...new Set(ts.rows.filter((r) => r.jobNo === "43134").map((r) => r.group))], ["Grp - A"]);
eq("dates coerced from Excel serials", ts.rows[0].date, "2026-08-03");
// The range is dragged wide by TP-STALE, a piece whose bed date is long past
// and which still has no drawing — the real export carries two such rows.
eq("report range", [ts.range.min, ts.range.max], ["2025-06-27", "2026-08-22"]);
// Feet-and-inches are text: read as a number, 11'-3 1/4" would become 11.
eq("dimensions kept as text", ts.rows[0].length, "11'-3 1/4\"");
ok("numeric columns are numbers", ts.rows.every((r) => typeof r.sf === "number" && typeof r.cy === "number"));
ok("a blank Drawn By stays blank, not a name",
   ts.rows.some((r) => r.drawnBy === "") && ts.rows.some((r) => r.drawnBy !== ""));
ok('"Total Pieces" rows are not read as pieces', !ts.rows.some((r) => /total/i.test(r.mark)));
ok("the <strong>-wrapped grand total is not read as a piece",
   !ts.rows.some((r) => /grand/i.test(r.mark)));

console.log("\nTicket report — malformed input");
let threw = "";
try { buildTicketSource([[null, null, "Nope"], [1, 2, 3]], { fileName: "wrong.xlsx" }); }
catch (e) { threw = e.message; }
ok("a file with no header row is rejected by name", threw.includes("wrong.xlsx"), threw.slice(0, 60));
const broken = buildTicketSource(
  ticketSheet([{ plant: "P", jobs: [{ jobNo: "1", jobName: "J", group: "", pieces: [["M1", "", AUG_1, 10]] }] }])
    .map((r) => (typeof r[0] === "string" ? ["P (9 pieces)"] : r)),
  { fileName: "drift.xlsx" }
);
ok("a banner count that disagrees is reported, not swallowed",
   broken.warnings.some((w) => w.includes("9")), broken.warnings.join(" | "));
eq("a disagreeing banner still yields its rows", broken.rows.length, 1);
eq("empty report walks to nothing",
   buildTicketSource([[null, null, "Plant Name", "Job Num"]], {}).rows.length, 0);

console.log("\nTicket join");
eq("key ignores mark case but not the (RL) suffix",
   [ticketKeyOf("43134", " rm101 "), ticketKeyOf("43134", "RM101(RL)")],
   ["43134|RM101", "43134|RM101(RL)"]);
const tIdx = ticketIndex(ts.rows);
eq("index holds one entry per piece", tIdx.size, ts.rows.length);
ok("a scheduled piece with no ticket is found",
   Boolean(ticketFor(tIdx, { jobNo: "43134", mark: "TP-001" })));
ok("a lower-case mark still matches",
   Boolean(ticketFor(tIdx, { jobNo: "43134", mark: "tp-001" })));
ok("a piece with its ticket is not flagged",
   !ticketFor(tIdx, { jobNo: "43134", mark: "TP-DRAWN" }));
// The two reports carry their own bed dates and disagree whenever the schedule
// has moved since the ticket report was pulled. The join must survive that.
ok("the join ignores the bed date",
   Boolean(ticketFor(tIdx, { jobNo: "43134", mark: "TP-001", date: "2030-01-01" })));
ok("a mark alone never matches across jobs",
   !ticketFor(tIdx, { jobNo: "99999", mark: "TP-001" }));
eq("a row with no mark is never flagged", ticketFor(tIdx, { jobNo: "43134", mark: "" }), undefined);

console.log("\nTicket coverage");
const sched = [
  { jobNo: "43134", mark: "TP-001", date: "2026-08-03", qty: 2 },
  { jobNo: "43134", mark: "TP-DRAWN", date: "2026-08-04", qty: 1 },
  { jobNo: "45154", mark: "TP-010", date: "2026-08-06", qty: 1 },
];
const cov = ticketCoverage(sched, ts.rows);
eq("flagged rows", cov.flaggedRows, 2);
eq("flagged pieces sums qty, not rows", cov.flaggedPieces, 3);
ok("overlapping windows are detected", cov.overlapDays > 0, `${cov.overlapDays} days`);
eq("jobs with nothing in the ticket report are named", cov.jobsNotCovered, []);
eq("ticket rows for unscheduled jobs are counted", cov.unscheduled, 2);
// The trap this whole module exists to make visible: two reports pulled over
// different months flag almost nothing, which reads as "everything is drawn".
const disjoint = ticketCoverage(
  [{ jobNo: "43134", mark: "TP-001", date: "2026-08-03", qty: 1 }],
  [{ jobNo: "43134", mark: "TP-777", date: "2026-09-14" }]
);
eq("non-overlapping windows report zero overlap", disjoint.overlapDays, 0);
eq("...and flag nothing", disjoint.flaggedRows, 0);
ok("...but still report the report as loaded, so the UI can say why", disjoint.loaded);
// A single outlier row must not be able to claim coverage the report doesn't
// have: the real export carries two pieces with bed dates years in the past,
// which stretch its range over the schedule while every other row sits a month
// later. Counting rows in the window is what can't be fooled by that.
const outlier = ticketCoverage(
  [{ jobNo: "43134", mark: "TP-001", date: "2026-08-03", qty: 1 }],
  [{ jobNo: "43134", mark: "TP-A", date: "2023-01-31" },
   { jobNo: "43134", mark: "TP-B", date: "2026-09-14" }]
);
ok("an outlier date makes the ranges overlap", outlier.overlapDays > 0, `${outlier.overlapDays} days`);
eq("...but no ticket row is actually inside the schedule window", outlier.ticketsInWindow, 0);
eq("ticketsInWindow counts only rows in range", cov.ticketsInWindow, 3);
eq("no ticket report loaded is not the same as none missing",
   [ticketCoverage(sched, []).loaded, ticketCoverage(sched, ts.rows).loaded], [false, true]);

console.log("\nTicket roll-ups");
const jr = byJob(ts.rows);
eq("job roll-up conserves every piece", jr.reduce((a, j) => a + j.pieces, 0), ts.rows.length);
eq("worst job first", jr[0].jobNo, "43134");
eq("unassigned counted per job", jr.find((j) => j.jobNo === "43134").unassigned, 2);
const dr = byDrafter(ts.rows);
eq("drafter roll-up conserves every piece", dr.reduce((a, d) => a + d.pieces, 0), ts.rows.length);
ok("unassigned is its own bucket and comes first", dr[0].assigned === false, JSON.stringify(dr.map((d) => d.drawnBy)));
const ub = urgency(ts.rows, "2026-08-02");
eq("urgency buckets conserve every piece", ub.reduce((a, b) => a + b.pieces, 0), ts.rows.length);
eq("a bed date in the past is its own bucket", ub.find((b) => b.id === "past").pieces, 1);
eq("buckets split by how soon the piece is cast",
   ub.filter((b) => b.pieces).map((b) => [b.id, b.pieces]),
   [["past", 1], ["week", 3], ["month", 3]]);
ok("no bucket is NaN", ub.every((b) => Number.isFinite(b.pieces)));

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

/**
 * The real ticket report, when it happens to be in the working directory.
 *
 * Figures here are *printed*, not asserted: the report is re-run weekly and the
 * counts legitimately move (the same reasoning as the job cost suite, §13).
 * What IS asserted is the arithmetic that must hold whatever the numbers are —
 * every banner reconciles, the grand total agrees, and no figure is NaN.
 */
const REAL_TICKETS_FILE = "MissingPieceMarkTicket.xlsx";
if (existsSync(REAL_TICKETS_FILE)) {
  console.log("\nReal ticket report (local only — gitignored)");
  const XLSX = await import("xlsx");
  const twb = XLSX.read(readFileSync(REAL_TICKETS_FILE));
  const aoa = XLSX.utils.sheet_to_json(twb.Sheets[twb.SheetNames[0]], {
    header: 1, raw: true, defval: null, blankrows: true,
  });
  const rt = buildTicketSource(aoa, { fileName: REAL_TICKETS_FILE });

  eq("no unrecognised rows", rt.warnings, []);
  eq("grand total agrees with the rows read", rt.grandTotal, rt.rows.length);
  ok("every job banner reconciles", rt.jobs.every((j) => j.declared === j.pieces));
  ok("every plant banner reconciles", rt.plants.every((p) => p.declared === p.pieces));
  eq("plant totals sum to the grand total",
     rt.plants.reduce((a, p) => a + p.pieces, 0), rt.grandTotal);
  ok("every row carries a job number and a mark", rt.rows.every((r) => r.jobNo && r.mark));
  ok("job+mark is unique", new Set(rt.rows.map((r) => r.key)).size === rt.rows.length,
     `${rt.rows.length - new Set(rt.rows.map((r) => r.key)).size} duplicate(s)`);
  ok("every row has a bed date", rt.rows.every((r) => r.date));
  ok("no numeric figure is NaN",
     rt.rows.every((r) => [r.sf, r.cy, r.lf, r.weight].every(Number.isFinite)));
  ok("dimensions stayed as feet-and-inches text",
     rt.rows.every((r) => typeof r.length === "string"));

  const unassigned = rt.rows.filter((r) => !r.drawnBy).length;
  console.log(`        ${rt.rows.length} pieces · ${rt.jobs.length} jobs · ${rt.plants.length} plants · ` +
              `${unassigned} with no drafter assigned · ${rt.range.min} → ${rt.range.max}`);
  console.log(`        drafting groups: ${[...new Set(rt.rows.map((r) => r.group).filter(Boolean))].join(", ") || "none"}`);

  // The join against the real schedule, if that is present too. This is the
  // figure to look at: it is what the planning board will actually flag, and a
  // near-zero here means the two reports were run over different ranges rather
  // than that the drawings are done.
  if (existsSync(REAL)) {
    const XL = await import("xlsx");
    const pwb = XL.read(readFileSync(REAL), { type: "buffer", cellDates: true, raw: true });
    const precs = XL.utils.sheet_to_json(pwb.Sheets[pwb.SheetNames[0]], { defval: "", raw: true });
    const prod = build(precs, Object.keys(precs[0])).rows;
    const c = ticketCoverage(prod, rt.rows);
    ok("coverage figures are all finite",
       [c.flaggedRows, c.flaggedPieces, c.overlapDays, c.unscheduled].every(Number.isFinite));
    ok("flagged rows never exceed the report",
       c.flaggedRows <= rt.rows.length && c.flaggedRows <= prod.length);
    console.log(`        schedule ${c.prodRange.min} → ${c.prodRange.max} · ` +
                `tickets ${c.tickRange.min} → ${c.tickRange.max} · overlap ${c.overlapDays} day(s)`);
    console.log(`        ${c.flaggedPieces} scheduled piece(s) flagged on the board, ` +
                `${c.jobsCovered.length}/${c.jobsCovered.length + c.jobsNotCovered.length} scheduled jobs covered, ` +
                `${c.ticketsInWindow}/${c.tickets} ticket rows inside the schedule window`);
    if (!c.ticketsInWindow) {
      console.log("        NOTE: the two reports cover different dates — an unflagged board does NOT mean everything is drawn.");
    }
  }
} else {
  console.log("\n  --  real ticket report not present; skipped (expected in CI)");
}

console.log(failures ? `\n${failures} FAILURE(S)\n` : `\nAll production checks passed.\n`);
process.exit(failures ? 1 : 0);
