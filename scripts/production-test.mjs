/**
 * Production data-layer checks.
 *
 * Runs against the synthetic sample always, and additionally against the real
 * ScheduledProdRptDtl.xls when it happens to be present in the working
 * directory (it is gitignored, so CI sees only the sample).
 *
 *   node scripts/production-test.mjs
 */
import { readFileSync } from "node:fs";
import { findExport, headerSignature, describeFound } from "./find-export.mjs";
import { csvToRecords } from "../src/core/csv.js";
import { mapColumns, toIsoDate, toNumber } from "../src/core/parse.js";
import schema from "../src/modules/production/schema.js";
import { groupBy, sumBy, distinct, rollup } from "../src/core/aggregate.js";
import { monthsIn, weeksOf } from "../src/core/calendar.js";
import { buildColumns, daySpan } from "../src/modules/production/board.js";
import { buildTicketSource, parseJobBanner, parsePlantBanner, ticketKeyOf } from "../src/modules/production/ticketParse.js";
import { ticketIndex, ticketFor, ticketCoverage, byJob, byDrafter, urgency } from "../src/modules/production/tickets.js";
import { alignInstances, diffSchedule, snapshotOf, movementByJob, pieceKeyOf, dayDelta } from "../src/modules/production/movement.js";
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

/* -- Schedule movement between two uploads ------------------------------ */

const pc = (jobNo, mark, date, extra = {}) => ({
  jobNo, job: `${jobNo} - JOB ${jobNo}`, jobTitle: `JOB ${jobNo}`,
  mark, date, plant: "P1", bed: "Pad 1", qty: 1, ...extra,
});

console.log("\nMovement — instance alignment");
const align = (p, n) => {
  const r = alignInstances(p, n);
  return {
    pairs: r.pairs.map(([i, j]) => [p[i], n[j]]),
    prevOnly: r.prevOnly.map((i) => p[i]),
    nextOnly: r.nextOnly.map((j) => n[j]),
  };
};
eq("equal counts pair in order",
   align(["2026-08-05", "2026-08-12"], ["2026-08-07", "2026-08-19"]).pairs,
   [["2026-08-05", "2026-08-07"], ["2026-08-12", "2026-08-19"]]);
// The reason the alignment is a DP and not a zip. Pairing by rank would call
// this a 7-day slip; matching Aug 10 to Aug 10 says nothing moved and two
// instances were dropped, which is what the dates actually support.
eq("surplus is dropped rather than forced into a move",
   align(["2026-08-03", "2026-08-10", "2026-08-20"], ["2026-08-10"]),
   { pairs: [["2026-08-10", "2026-08-10"]], prevOnly: ["2026-08-03", "2026-08-20"], nextOnly: [] });
eq("surplus on the new side becomes additions",
   align(["2026-08-10"], ["2026-08-03", "2026-08-10", "2026-08-20"]).nextOnly,
   ["2026-08-03", "2026-08-20"]);
eq("an empty previous side matches nothing",
   align([], ["2026-08-01"]), { pairs: [], prevOnly: [], nextOnly: ["2026-08-01"] });
eq("an empty new side matches nothing",
   align(["2026-08-01"], []), { pairs: [], prevOnly: ["2026-08-01"], nextOnly: [] });
ok("the pairing is always as large as the shorter side",
   [[1, 1], [3, 1], [1, 3], [4, 4], [2, 5]].every(([a, b]) => {
     const P = Array.from({ length: a }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`);
     const N = Array.from({ length: b }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
     return alignInstances(P, N).pairs.length === Math.min(a, b);
   }));

// The DP must actually be optimal, not merely plausible. Checked against an
// exhaustive search over every order-preserving matching.
console.log("\nMovement — alignment is provably minimal");
const isoOf = (d) => new Date(Date.UTC(2026, 7, 1 + d)).toISOString().slice(0, 10);
function bruteCost(P, N) {
  const k = Math.min(P.length, N.length);
  let best = Infinity;
  const rec = (i, j, n, cost) => {
    if (n === k) { best = Math.min(best, cost); return; }
    if (i >= P.length || j >= N.length) return;
    rec(i + 1, j + 1, n + 1, cost + Math.abs(dayDelta(P[i], N[j])));
    rec(i + 1, j, n, cost);
    rec(i, j + 1, n, cost);
  };
  rec(0, 0, 0, 0);
  return best;
}
let mism = 0;
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let t = 0; t < 600; t++) {
  const mk = () => [...new Set(Array.from({ length: 1 + Math.floor(rnd() * 5) },
    () => Math.floor(rnd() * 18)))].sort((a, b) => a - b).map(isoOf);
  const P = mk(), N = mk();
  const r = alignInstances(P, N);
  const cost = r.pairs.reduce((a, [i, j]) => a + Math.abs(dayDelta(P[i], N[j])), 0);
  if (cost !== bruteCost(P, N)) mism++;
}
ok("matches an exhaustive search over 600 random cases", mism === 0, `${mism} mismatches`);

console.log("\nMovement — the diff");
const prevSched = [
  pc("43134", "RM101", "2026-08-05"),
  pc("43134", "RM102", "2026-08-06"),
  pc("43134", "RM103", "2026-08-07"),
  pc("45154", "RC-01", "2026-08-10"),
  pc("45154", "GONE", "2026-08-11"),
];
const nextSched = [
  pc("43134", "RM101", "2026-08-05"),              // unchanged
  pc("43134", "RM102", "2026-08-12"),              // 6 days later
  pc("43134", "RM103", "2026-08-04"),              // 3 days earlier
  pc("45154", "RC-01", "2026-08-10", { bed: "Pad 9" }),   // same day, new bed
  pc("45154", "BRAND-NEW", "2026-08-14"),          // added
];
const mv = diffSchedule(snapshotOf(prevSched), nextSched);
ok("a baseline makes the diff ready", mv.ready);
eq("unchanged pieces counted, not reported as moves", mv.unchanged, 2);
eq("moves found", mv.moved.map((m) => [m.row.mark, m.days]).sort(), [["RM102", 6], ["RM103", -3]]);
eq("a later date is a positive delta", mv.moved.find((m) => m.row.mark === "RM102").days, 6);
eq("an earlier date is a negative delta", mv.moved.find((m) => m.row.mark === "RM103").days, -3);
eq("additions found", mv.added.map((a) => a.row.mark), ["BRAND-NEW"]);
eq("removals found", mv.removed.map((r) => r.prev.mark), ["GONE"]);
eq("an addition has no from-date and no day count",
   [mv.added[0].from, mv.added[0].days], [null, null]);
ok("a bed change on an unmoved piece is still noticed",
   mv.byRow.get(nextSched[3])?.bedChanged === true);
eq("stats agree with the lists",
   [mv.stats.moved, mv.stats.added, mv.stats.removed, mv.stats.unchanged],
   [mv.moved.length, mv.added.length, mv.removed.length, mv.unchanged]);
ok("no stat is NaN or Infinity", Object.values(mv.stats).every(Number.isFinite));

console.log("\nMovement — the invariants that matter");
// Every piece in the new export must be accounted for exactly once, or the
// board would draw a chip on a card the report never mentions (or the reverse).
const marked = nextSched.filter((r) => r.mark && r.date).length;
eq("moved + added + unchanged accounts for every current piece",
   mv.moved.length + mv.added.length + mv.unchanged, marked);
ok("byRow holds an entry for every current piece",
   nextSched.every((r) => mv.byRow.has(r)));
eq("byRow holds no more than that", mv.byRow.size, marked);
ok("byRow is keyed on the row object the board renders",
   mv.byRow.get(nextSched[1])?.days === 6);
// Re-uploading the same file is the commonest case after a mistake; it must
// report calm, not churn.
const same = diffSchedule(snapshotOf(nextSched), nextSched);
eq("an identical re-upload reports nothing moved",
   [same.moved.length, same.added.length, same.removed.length], [0, 0, 0]);
eq("...and counts every piece as unchanged", same.unchanged, marked);
// Reversing the two sides must mirror the signs, or the direction is arbitrary.
const rev = diffSchedule(snapshotOf(nextSched), prevSched);
eq("reversing the comparison flips every sign",
   rev.moved.map((m) => [m.row.mark, m.days]).sort(), [["RM102", -6], ["RM103", 3]]);

console.log("\nMovement — no baseline");
eq("no baseline is not 'nothing moved'",
   [diffSchedule([], nextSched).ready, diffSchedule(snapshotOf(prevSched), []).ready], [false, false]);
eq("an unready diff carries empty lists, not undefined",
   [diffSchedule([], nextSched).moved.length, diffSchedule([], nextSched).byRow.size], [0, 0]);

console.log("\nMovement — repeated marks");
// 257 of 1,669 job|mark groups in the real export hold several instances.
const repPrev = [pc("1", "M", "2026-08-03"), pc("1", "M", "2026-08-10"), pc("1", "M", "2026-08-17")];
const repNext = [pc("1", "M", "2026-08-04"), pc("1", "M", "2026-08-10"), pc("1", "M", "2026-08-24")];
const repDiff = diffSchedule(snapshotOf(repPrev), repNext);
eq("each instance of a repeated mark gets its own verdict",
   repNext.map((r) => repDiff.byRow.get(r).days), [1, 0, 7]);
eq("...and the unmoved instance is not reported as a move", repDiff.moved.length, 2);

console.log("\nMovement — what is not a piece");
// Bed activity carries no mark; it is not a piece and cannot be tracked.
const withActivity = [...nextSched, { jobNo: "43134", job: "x", mark: "", date: "2026-08-05", plant: "P1", bed: "Pad 2", qty: 0 }];
eq("rows with no mark are excluded from the snapshot",
   snapshotOf(withActivity).length, nextSched.length);
eq("...and never appear in the diff",
   diffSchedule(snapshotOf(prevSched), withActivity).byRow.size, marked);
eq("a row with no date is excluded too",
   snapshotOf([pc("1", "M", "")]).length, 0);
// 45 marks in the real export are shared across jobs, so the key must carry both.
ok("the piece key separates the same mark on different jobs",
   pieceKeyOf("43134", "RM101") !== pieceKeyOf("45154", "RM101"));
eq("the key is case-insensitive on the mark",
   pieceKeyOf("43134", " rm101 "), pieceKeyOf("43134", "RM101"));

console.log("\nMovement — per-job roll-up");
const mj = movementByJob(mv);
eq("roll-up conserves moves", mj.reduce((a, g) => a + g.moved, 0), mv.moved.length);
eq("roll-up conserves additions", mj.reduce((a, g) => a + g.added, 0), mv.added.length);
eq("roll-up conserves removals", mj.reduce((a, g) => a + g.removed, 0), mv.removed.length);
ok("net movement is signed, so a job that cancels out reads as flat",
   Math.abs(mj.find((g) => g.jobNo === "43134").net - 1.5) < 1e-9,
   String(mj.find((g) => g.jobNo === "43134").net));
ok("no roll-up figure is NaN",
   mj.every((g) => [g.moved, g.added, g.removed, g.avgAbs, g.net, g.changed].every(Number.isFinite)));

/**
 * The real exports are found by their columns, not by their names — they are
 * gitignored and re-downloaded often, so a name is a hint and nothing more.
 * Naming them exactly used to mean a renamed file skipped every check below
 * while the run still said all green (see scripts/find-export.mjs).
 */
const XLSX = await import("xlsx");
const schedFound = findExport({
  hint: /sched.*prod|prod.*rpt/i,
  identify: headerSignature(XLSX, ["Bed Date", "Bed Name", "Piece Mark", "Plant"]),
});
console.log(`\n${describeFound(schedFound, "Real schedule export (local only — gitignored)")}`);

const REAL = schedFound?.file;
if (REAL) {
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

  /*
   * A simulated re-upload, at real scale. There is only ever one export on
   * disk, so the previous one is manufactured by shifting a known share of
   * pieces by a known number of days — which means the diff's answers can be
   * checked against numbers this script chose, not merely inspected.
   */
  console.log("\nReal export — simulated re-upload");
  const shiftIso = (iso, n) => {
    const t = new Date(`${iso}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  let rs = 99;
  const rr = () => (rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  // Every 109th row is withheld from the baseline, so it must come back as an
  // addition; a tenth of the rest is shifted each way by a bounded amount.
  let injectedDays = 0;
  const prevReal = r.rows.filter((_, i) => i % 109 !== 0).map((x) => {
    if (!x.mark || !x.date) return x;
    const u = rr();
    // The baseline is shifted the opposite way to the effect on the new file:
    // moving the OLD date later means the piece is now EARLIER than it was.
    if (u < 0.10) { const n = 1 + Math.floor(rr() * 9); injectedDays += n; return { ...x, date: shiftIso(x.date, n) }; }
    if (u < 0.20) { const n = 1 + Math.floor(rr() * 5); injectedDays += n; return { ...x, date: shiftIso(x.date, -n) }; }
    return x;
  });

  const snap = snapshotOf(prevReal);
  const t0 = Date.now();
  const rd = diffSchedule(snap, r.rows);
  const ms = Date.now() - t0;

  const realPieces = r.rows.filter((x) => x.mark && x.date).length;
  eq("every current piece is accounted for exactly once",
     rd.moved.length + rd.added.length + rd.unchanged, realPieces);
  ok("byRow covers every current piece", r.rows.filter((x) => x.mark && x.date).every((x) => rd.byRow.has(x)));
  eq("byRow holds no extra entries", rd.byRow.size, realPieces);
  ok("no movement figure is NaN", Object.values(rd.stats).every(Number.isFinite));
  ok("every reported move is a nonzero whole number of days",
     rd.moved.every((m) => Number.isInteger(m.days) && m.days !== 0));
  // The shifts were bounded at 9 earlier and 5 later, so anything outside that
  // band means instances were mis-aligned rather than merely moved.
  ok("no move exceeds the shift that was injected",
     rd.moved.every((m) => m.days >= -9 && m.days <= 5),
     `range ${Math.min(...rd.moved.map((m) => m.days))}..${Math.max(...rd.moved.map((m) => m.days))}`);
  /*
   * Total movement, not the count of moves, is what minimality bounds — and
   * the distinction is real rather than pedantic. Where a mark is scheduled
   * several times, shifting one instance re-sorts the group, and the alignment
   * then explains the same change as several smaller slides. That reports MORE
   * moves than were injected while reporting no more total movement, which is
   * the alignment doing exactly its job. Asserting on the count instead fails
   * here, which is how this was found.
   */
  const reportedDays = rd.moved.reduce((a, m) => a + Math.abs(m.days), 0);
  ok("total movement never exceeds what was injected",
     reportedDays <= injectedDays, `${reportedDays} reported vs ${injectedDays} injected`);
  ok("every move stays within the injected band",
     rd.moved.every((m) => m.days >= -9 && m.days <= 5));
  ok("the per-job roll-up conserves every change",
     movementByJob(rd).reduce((a, g) => a + g.changed, 0) ===
       rd.moved.length + rd.added.length + rd.removed.length);
  // Re-uploading the identical file is the commonest real case; at this scale
  // it is also the strongest check that nothing is spuriously matched.
  const idem = diffSchedule(snapshotOf(r.rows), r.rows);
  eq("an identical re-upload of the real export reports no change",
     [idem.moved.length, idem.added.length, idem.removed.length], [0, 0, 0]);
  eq("...and every piece as unchanged", idem.unchanged, realPieces);

  console.log(`        ${realPieces} pieces compared in ${ms}ms · ` +
              `${rd.stats.earlier} earlier, ${rd.stats.later} later, ` +
              `${rd.stats.added} new, ${rd.stats.removed} dropped, ${rd.unchanged} unchanged`);
  console.log(`        baseline snapshot ${snap.length} rows, ` +
              `~${Math.round(JSON.stringify(snap).length / 1024)}KB stored`);
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
// "Job Num" + "Drawn By" is the ticket report; the schedule shares "Piece Mark"
// with it but carries neither.
const ticketFound = findExport({
  hint: /missing.*ticket|piece.*mark.*ticket/i,
  identify: headerSignature(XLSX, ["Plant Name", "Job Num", "Piece Mark", "Drawn By"]),
});
console.log(`\n${describeFound(ticketFound, "Real ticket report (local only — gitignored)")}`);

const REAL_TICKETS_FILE = ticketFound?.file;
if (REAL_TICKETS_FILE) {
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
  if (REAL) {
    const pwb = XLSX.read(readFileSync(REAL), { type: "buffer", cellDates: true, raw: true });
    const precs = XLSX.utils.sheet_to_json(pwb.Sheets[pwb.SheetNames[0]], { defval: "", raw: true });
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
