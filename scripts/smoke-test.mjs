/**
 * Node smoke test over the pure data layer — parsing, coercion, grouping and
 * cumulative math. No DOM involved, so it runs anywhere:
 *
 *   node scripts/smoke-test.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { csvToRecords, parseCsv } from "../src/core/csv.js";
import { mapColumns, toIsoDate, toNumber } from "../src/core/parse.js";
import { rollup, cumulativeSeries, dateDomain, topNWithOther, sumBy, distinct } from "../src/core/aggregate.js";
import schema from "../src/modules/employee-time/schema.js";
import { niceTicks } from "../src/components/charts/scale.js";
import { daysSince, ago } from "../src/core/format.js";
import { isoFromMtime } from "../src/core/parse.js";
import { describeSources, sourceSummary, STALE_AFTER_DAYS } from "../src/app/sources.js";
import { parseRoute, hrefFor, segments } from "../src/core/routing.js";
import { isSection, tabsFor, paramsFor, SECTIONS, DEFAULT_SECTION, findSection, ALIASES } from "../src/modules/sections.js";
import { projectRows, applyPresence, PRESENCE } from "../src/modules/projects/rows.js";
import { assembleJob, matchTimeRows, allJobNumbers } from "../src/modules/job/assemble.js";
import { splitJob } from "../src/modules/employee-time/schema.js";

let failures = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "} ${name}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};
const ok = (name, cond, detail = "") => eq(name + (detail && ` (${detail})`), !!cond, true);

console.log("\nCSV parsing");
eq("quoted comma", parseCsv('a,b\n"x,y",2')[1], ["x,y", "2"]);
eq("escaped quote", parseCsv('a\n"say ""hi"""')[1], ['say "hi"']);
eq("embedded newline", parseCsv('a,b\n"line1\nline2",2')[1], ["line1\nline2", "2"]);
eq("CRLF endings", parseCsv("a,b\r\n1,2\r\n")[1], ["1", "2"]);
eq("BOM stripped", csvToRecords("﻿Hours\n8").headers, ["Hours"]);

console.log("\nCoercion");
eq("ISO passthrough", toIsoDate("2026-03-14"), "2026-03-14");
eq("US slash date", toIsoDate("3/14/2026"), "2026-03-14");
eq("2-digit year", toIsoDate("3/14/26"), "2026-03-14");
eq("Excel serial", toIsoDate(45000), "2023-03-15");
eq("comma number", toNumber("1,234.5"), 1234.5);
eq("paren negative", toNumber("(2.5)"), -2.5);
eq("junk -> 0", toNumber("n/a"), 0);

console.log("\nColumn mapping");
const mapped = mapColumns(
  ["Effective Date","First Name","Last Name","Location","Job Name","GL Code","Labor Task","Deptment","Hours"],
  schema
);
eq("no required columns missing", mapped.missing.map((f) => f.key), []);
eq("CV misspelling 'Deptment' maps", mapped.mapping.dept, "Deptment");
const drifted = mapColumns(["Date","First","Last","Project","Hrs","Department"], schema);
eq("drifted headers still map", drifted.missing.map((f) => f.key), []);
eq("  -> job from 'Project'", drifted.mapping.job, "Project");
const broken = mapColumns(["Foo", "Bar"], schema);
ok("missing columns are reported", broken.missing.length >= 4, `${broken.missing.length} missing`);

console.log("\nSample file end-to-end");
const { headers, records } = csvToRecords(readFileSync("samples/employee-time.sample.csv", "utf8"));
const m2 = mapColumns(headers, schema);
eq("sample maps cleanly", m2.missing.length, 0);

const rows = records.map((rec) => {
  const row = {};
  for (const f of schema.fields) {
    const v = rec[m2.mapping[f.key]];
    row[f.key] = f.type === "date" ? toIsoDate(v) : f.type === "number" ? toNumber(v) : String(v ?? "").trim();
  }
  return { ...row, ...schema.derive(row) };
}).filter((r) => !schema.isEmptyRow(r));

ok("rows parsed", rows.length > 1500, `${rows.length} rows`);
ok("every row has a date", rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)));
ok("every row has hours", rows.every((r) => r.hrs > 0));

console.log("\nAggregation");
const total = sumBy(rows, (r) => r.hrs);
const byJob = rollup(rows, (r) => r.job, (r) => r.hrs);
eq("rollup conserves the total", +byJob.reduce((s, g) => s + g.value, 0).toFixed(4), +total.toFixed(4));
ok("rollup sorted descending", byJob.every((g, i) => i === 0 || byJob[i - 1].value >= g.value));

const { top, other } = topNWithOther(byJob, 3);
eq("topN keeps 3", top.length, 3);
eq("Other conserves the remainder", +(top.reduce((s, g) => s + g.value, 0) + other.value).toFixed(4), +total.toFixed(4));

console.log("\nCumulative math");
const person = distinct(rows, (r) => r.name)[0];
const mine = rows.filter((r) => r.name === person);
const domain = dateDomain(mine, (r) => r.date);
const cum = cumulativeSeries(mine, (r) => r.date, (r) => r.hrs, domain);
ok("monotonically non-decreasing", cum.every((p, i) => i === 0 || p.y >= cum[i - 1].y));
eq("ends at the person's total", +cum[cum.length - 1].y.toFixed(4), +sumBy(mine, (r) => r.hrs).toFixed(4));
eq("one point per domain date", cum.length, domain.length);

// A series carried across a shared domain must stay flat on its idle days.
const oneJob = mine.filter((r) => r.job === mine[0].job);
const carried = cumulativeSeries(oneJob, (r) => r.date, (r) => r.hrs, domain);
eq("carried series spans the full domain", carried.length, domain.length);
ok("carried series never dips", carried.every((p, i) => i === 0 || p.y >= carried[i - 1].y));

console.log("\nRouting");
const R = { isSection, tabsFor, paramsFor, fallback: DEFAULT_SECTION };
eq("section + tab", parseRoute("#/production/calendar", R).tab, "calendar");
eq("bare section falls to its first tab", parseRoute("#/production", R).tab, "board");
// A stale bookmark must land somewhere real rather than on a blank page.
eq("unknown tab falls back", parseRoute("#/production/nope", R).tab, "board");
eq("unknown section falls back", parseRoute("#/nope/x", R).section, DEFAULT_SECTION);
eq("empty hash falls back", parseRoute("", R).section, DEFAULT_SECTION);
// The job page is addressed by the job it is about, so its id precedes the tab.
eq("job id before tab", parseRoute("#/job/43134/cost", R).params, ["43134"]);
eq("job tab after id", parseRoute("#/job/43134/cost", R).tab, "cost");
eq("job with no tab", parseRoute("#/job/43134", R).tab, "summary");
// Segments a section takes for itself -- a person's name -- survive untouched.
eq("drill segments preserved", parseRoute("#/time/people/person/Ada%20Lovelace", R).rest, ["person", "Ada Lovelace"]);
eq("names are encoded", hrefFor("time", "person", "Ada Lovelace"), "#/time/person/Ada%20Lovelace");
eq("a stray % does not throw", segments("#/time/%"), ["time", "%"]);
ok("every nav section resolves", SECTIONS.every((x) => findSection(x.id)));
ok("every section's first tab is routable",
   SECTIONS.every((x) => !x.tabs.length || parseRoute(hrefFor(x.id), R).tab === x.tabs[0].id));
// Old bookmarks must land where the section went, not on Home.
ok("every legacy alias points at a real section",
   Object.values(ALIASES).every((to) => isSection(to)));
ok("no alias shadows a live section", Object.keys(ALIASES).every((from) => !isSection(from)));

console.log("\nProject roll-up");
const pjCost = [
  { jobNo: "100", jobTitle: "A", plant: "P1", netContract: 100, amountBilled: 50,
    totals: { estCost: 60, projCost: 80, actCost: 40, variance: 40 }, estOhProfit: 20,
    sf: { job: 10, hasSf: true } },
  { jobNo: "200", jobTitle: "B", plant: "P2", netContract: 0, amountBilled: 0,
    totals: { estCost: 0, projCost: 0, actCost: 0, variance: 0 }, estOhProfit: 0,
    sf: { job: 0, hasSf: false } },
];
const pjSched = [
  { jobNo: "100", jobTitle: "A sched", plant: "P1", qty: 2, sf: 5, cy: 1, bedKey: "b1", date: "2026-08-03" },
  { jobNo: "300", jobTitle: "C", plant: "P3", qty: 3, sf: 7, cy: 2, bedKey: "b2", date: "2026-08-04" },
];
const pjTick = [{ jobNo: "300", jobTitle: "C", drawnBy: "", date: "2026-09-01" }];
const pjTime = [
  { jobNo: "100", jobTitle: "A", hrs: 10, name: "N", date: "2026-08-01" },
  { jobNo: "100", jobTitle: "A", hrs: 6, name: "M", date: "2026-08-02" },
  // Hours on a job no cost report and no schedule mentions — 145 real job
  // numbers look like this, so the merge must carry them rather than drop them.
  { jobNo: "400", jobTitle: "D", hrs: 4, name: "N", date: "2026-08-03" },
];
const pj = projectRows({ costJobs: pjCost, scheduleRows: pjSched, ticketRows: pjTick, timeRows: pjTime });
eq("one row per job number", pj.length, 4);
eq("hours join onto the job that already existed", pj.find((r) => r.jobNo === "100").hours, 16);
eq("two people counted once each", pj.find((r) => r.jobNo === "100").people, 2);
// A job only the timesheet knows still gets a row — it is a real project
// someone booked time to, and dropping it would hide the hours entirely.
eq("a time-only job still gets a row", pj.find((r) => r.jobNo === "400").sources, "time");
eq("a time-only job has no contract", pj.find((r) => r.jobNo === "400").costed, false);
eq("cost per booked hour where both sides exist",
   pj.find((r) => r.jobNo === "100").costPerHour, 40 / 16);
eq("no cost means no cost-per-hour, not zero", pj.find((r) => r.jobNo === "400").costPerHour, null);
eq("costed and scheduled merge onto one row", pj.find((r) => r.jobNo === "100").sources, "cost+schedule+time");
eq("schedule's title wins", pj.find((r) => r.jobNo === "100").title, "A sched");
eq("cost-only job carries no pieces", pj.find((r) => r.jobNo === "200").scheduled, false);
eq("schedule-only job carries no contract", pj.find((r) => r.jobNo === "300").costed, false);
eq("missing tickets counted", pj.find((r) => r.jobNo === "300").missingTickets, 1);
// A rate with no denominator is unknown, never zero -- a zero would read as
// "costs nothing per foot".
eq("no footage means a null rate, not 0", pj.find((r) => r.jobNo === "200").actualPerSf, null);
eq("no contract means a null margin, not 0", pj.find((r) => r.jobNo === "200").marginPct, null);
eq("rate divides by job square footage", pj.find((r) => r.jobNo === "100").actualPerSf, 4);
// Every presence filter must be a subset of the whole, and "all" the whole.
eq("presence: all keeps everything", applyPresence(pj, "all").length, pj.length);
ok("every presence filter is a subset",
   PRESENCE.every((f) => applyPresence(pj, f.id).length <= pj.length));
eq("cost-only + sched-only + both accounts for every costed or scheduled job",
   applyPresence(pj, "cost-only").length + applyPresence(pj, "sched-only").length + applyPresence(pj, "both").length,
   pj.filter((r) => r.costed || r.scheduled).length);

console.log("\nTimesheet job numbers");
// Profiled 2026-08-31: Job Name carries the number in "<no> - <title>", the
// same shape the schedule uses. This is what makes the hours join real (§12).
eq("plain job number", splitJob("45219 - FIU STUDENT HOUSING"),
   { jobNo: "45219", jobTitle: "FIU STUDENT HOUSING" });
// The admin jobs are the reason the separator must be spaced: an unspaced
// match would cut 00-001 in half and collapse every 00-* onto one key. 19.2%
// of all hours sit on those.
eq("dashed admin number survives", splitJob("00-001 - Corporate Admin Job").jobNo, "00-001");
eq("00-006 and 00-009 stay distinct",
   [splitJob("00-006 - A").jobNo, splitJob("00-009 - B").jobNo], ["00-006", "00-009"]);
eq("non-numeric job number", splitJob("45081P2 - X").jobNo, "45081P2");
// 5 of 29,267 real rows look like this -- a title with no number at all.
eq("a title with no number keeps an empty jobNo",
   splitJob("- St. Jude Clinical Research Tower"), { jobNo: "", jobTitle: "- St. Jude Clinical Research Tower" });
eq("a title with an unspaced dash is not split", splitJob("FIU-STUDENT").jobNo, "");

console.log("\nOne job, every source");
const timeRow = (job, hrs, name, task) => {
  const row = { job, hrs, name, date: "2026-08-01", task, loc: "Kis" };
  return { ...row, ...splitJob(job) };   // exactly what the schema derives
};
const aj = assembleJob({
  jobNo: "100", costJobs: pjCost, scheduleRows: pjSched, ticketRows: pjTick,
  timeRows: [timeRow("100 - A", 8, "N", "CHK"), timeRow("999 - other", 4, "N", "MGT")],
  loaded: { cost: true, schedule: true, drawings: true, time: true },
});
eq("cost side found", aj.cost.netContract, 100);
eq("schedule side found", aj.schedule.pieces, 2);
eq("drawings side empty for this job", aj.drawings.pieces, 0);
eq("hours matched on the job number", aj.hours.hours, 8);
// It joins on the same key as every other source now, so it says so.
eq("the hours join is a real one", aj.hours.confident, true);
eq("hours broken down by task", aj.hours.byTask, [{ key: "CHK", hrs: 8 }]);
// An equality match on a derived number, not a string search: 1000 is not 100.
eq("1000 does not match 100", matchTimeRows([timeRow("1000 - X", 5, "N", "T")], "100").length, 0);
eq("a row with no job number matches nothing",
   matchTimeRows([timeRow("- No Number", 5, "N", "T")], "").length, 0);
const ajNone = assembleJob({ jobNo: "404", costJobs: pjCost, scheduleRows: pjSched, loaded: {} });
eq("a job no source knows has no cost section", ajNone.cost, null);
eq("a job no source knows has no schedule section", ajNone.schedule, null);
eq("job numbers gathered from every source",
   allJobNumbers({ costJobs: pjCost, scheduleRows: pjSched, ticketRows: pjTick }), ["100", "200", "300"]);

console.log("\nFile age");
const TODAY = new Date(2026, 7, 31);            // 2026-08-31, local
eq("today is zero days old", daysSince("2026-08-31", TODAY), 0);
eq("yesterday", ago("2026-08-30", TODAY), "yesterday");
eq("a week", ago("2026-08-24", TODAY), "last week");
eq("three weeks", ago("2026-08-10", TODAY), "3 weeks ago");
// A clock disagreement must not render as "-2 days ago", which reads as a bug.
eq("a future file reads forward", ago("2026-09-02", TODAY), "in 2 days");
eq("no date is not a date", daysSince("", TODAY), null);
eq("junk is not a date", daysSince("nope", TODAY), null);
// The local calendar day, not UTC — a file saved in the evening in a western
// zone must not be reported as tomorrow's.
eq("mtime converts through the local day",
   isoFromMtime(new Date(2026, 7, 31, 23, 30).getTime()), "2026-08-31");
eq("no mtime yields no date", isoFromMtime(undefined), "");

console.log("\nSource ages");
const ds = (rows, meta) => ({ rows, meta: meta || null, persistWarning: "" });
const mkApp = (schedDate, tickDate, costDates, timeDate) => ({
  schedule: ds([{}], { fileName: "S.xls", fileDate: schedDate }),
  scheduleRange: { min: "2026-08-01", max: "2026-08-31" },
  tickets: { source: { fileName: "T.xlsx", fileDate: tickDate, rows: [{}], jobs: [1], plants: [], range: { min: "", max: "" }, warnings: [] }, rows: [{}] },
  ticketData: ds([]),
  coverage: { ticketsInWindow: 1 },
  costLib: { sources: costDates.map((d, i) => ({ plant: `P${i}`, fileDate: d, warnings: [] })), persistWarning: "" },
  cost: { data: { jobs: [], asOfRange: { min: "", max: "" }, mixedAsOf: false } },
  time: timeDate ? ds([{}], { fileName: "E.xls", fileDate: timeDate }) : ds([]),
});

{
  const d = describeSources(mkApp("2026-08-30", "2026-08-01", ["2026-08-26", "2026-08-05"], ""), TODAY);
  const by = Object.fromEntries(d.map((x) => [x.id, x]));
  eq("a fresh file is not stale", by.schedule.stale, false);
  eq("an old file is stale", by.tickets.stale, true);
  // A library is only as current as its stalest member, so the card reports
  // the oldest file rather than the newest.
  eq("the cost card reports its oldest plant", by.cost.modified, "2026-08-05");
  eq("the cost card is stale on that oldest plant", by.cost.stale, true);
  // Unknown is neither fresh nor stale — sources imported before the date was
  // captured must not be accused of being old.
  eq("an unknown date is not called stale", by.time.stale, false);
  eq("an unknown date has no age", by.time.modifiedDays, null);
  eq("every source carries the age fields",
     d.every((x) => "modified" in x && "modifiedDays" in x && "stale" in x), true);
}
{
  // The header chip has to raise an old file, or the age is only visible to
  // someone who already went looking for it.
  const fresh = sourceSummary(mkApp("2026-08-30", "2026-08-30", ["2026-08-30"], "2026-08-30"), TODAY);
  ok("a fresh set does not raise the chip", !fresh.warn, JSON.stringify(fresh.warnings));
  const old = sourceSummary(mkApp("2026-01-01", "2026-08-30", ["2026-08-30"], "2026-08-30"), TODAY);
  ok("an old file raises the chip", old.warn && old.stale.length === 1);
  ok("and the chip can say why", old.warnings.some((w) => /last modified/.test(w)));
  ok(`the threshold is ${STALE_AFTER_DAYS} days`,
     describeSources(mkApp(isoFromMtime(TODAY.getTime() - (STALE_AFTER_DAYS - 1) * 86400000), "", [], ""), TODAY)[0].stale === false);
}

console.log("\nAxis ticks");
eq("nice ticks from 0..87", niceTicks(0, 87, 5).ticks, [0, 20, 40, 60, 80, 100]);
ok("degenerate range is safe", niceTicks(0, 0).ticks.length >= 2);

/*
 * The real employee time export, when it happens to be sitting in the working
 * directory. It is gitignored, so CI only ever sees the synthetic sample — but
 * locally this is the check that matters, exactly as the production and job
 * cost suites treat their own real exports (CLAUDE.md §7).
 *
 * The figures are PRINTED rather than asserted wherever they legitimately move
 * between pulls; what is asserted are the invariants that must hold whatever
 * the export contains.
 */
/**
 * Find the timesheet export, whatever the browser called it.
 *
 * It used to be the literal string "EmpTimeExport.xls", which meant a second
 * download landing as "EmpTimeExport (1).xls" silently skipped this whole
 * block — every real-data check below, reconciliation included, quietly
 * stopped running while the suite still reported all green. A check that
 * disappears when the file is re-downloaded is worse than no check, because
 * nothing says it went away. Newest match wins, and the name is printed.
 */
function findTimeExport() {
  const found = readdirSync(".")
    .filter((f) => /^EmpTimeExport.*\.xlsx?$/i.test(f))
    .map((f) => ({ f, mtime: statSync(f).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return found.length ? found[0].f : null;
}

const TIME_EXPORT = findTimeExport();
if (TIME_EXPORT && existsSync(TIME_EXPORT)) {
  console.log(`\nReal employee time export — ${TIME_EXPORT}`);
  const XLSX = await import("xlsx");
  const wb = XLSX.read(readFileSync(TIME_EXPORT), { type: "buffer" });
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],
    { header: 1, raw: true, defval: null, blankrows: false });
  const hdrs = aoa[0].map((h) => String(h ?? ""));
  const m = mapColumns(hdrs, schema);

  // The schema must absorb the real headers with nothing missing and nothing
  // left over -- an unmapped header would still be carried as row.extra, but
  // it means a real column nobody named.
  eq("every required column maps", m.missing, []);
  eq("no header is left unmapped", m.unmapped, []);

  const at = Object.fromEntries(Object.entries(m.mapping).map(([k, v]) => [k, hdrs.indexOf(v)]));
  const real = aoa.slice(1)
    .filter((r) => r && r.some((c) => c != null && c !== ""))
    .map((r) => {
      const row = {};
      for (const f of schema.fields) {
        const v = at[f.key] >= 0 ? r[at[f.key]] : null;
        row[f.key] = f.type === "date" ? toIsoDate(v) : f.type === "number" ? toNumber(v) : String(v ?? "").trim();
      }
      return { ...row, ...schema.derive(row) };
    })
    .filter((r) => !schema.isEmptyRow(r));

  const withNo = real.filter((r) => r.jobNo);
  const jobNos = new Set(withNo.map((r) => r.jobNo));
  const people = new Set(real.map((r) => r.name));
  const hours = real.reduce((a, r) => a + r.hrs, 0);
  const dates = real.map((r) => r.date).filter(Boolean).sort();

  /**
   * **No hour is lost between the sheet and the rows the app aggregates.**
   *
   * Every per-person figure in Time is `groupBy(name)` + `sumBy(hrs)` over
   * these rows, so if the sheet's own Hours column sums to the parsed total —
   * overall and for each person — then no view can be under-counting anybody;
   * a short figure on screen is a filter or the My Projects scope, not ingest.
   * That is the same reconciliation the job cost and ticket walkers get (§7),
   * and it was missing here: the suite counted rows and asserted no NaN, which
   * cannot tell a dropped row from an absent one.
   *
   * `isEmptyRow` drops a zero-hour row, which contributes nothing to a sum, so
   * dropping rows and conserving hours are not the same claim — both are made.
   */
  const sheetHours = aoa.slice(1).reduce((a, r) => a + toNumber(r?.[at.hrs]), 0);
  eq("every hour on the sheet reaches the rows", +hours.toFixed(4), +sheetHours.toFixed(4));

  const sheetByPerson = new Map();
  for (const r of aoa.slice(1)) {
    if (!r) continue;
    const name = `${String(r[at.firstName] ?? "").trim()} ${String(r[at.lastName] ?? "").trim()}`.trim();
    if (!name) continue;
    sheetByPerson.set(name, (sheetByPerson.get(name) || 0) + toNumber(r[at.hrs]));
  }
  const parsedByPerson = new Map();
  for (const r of real) parsedByPerson.set(r.name, (parsedByPerson.get(r.name) || 0) + r.hrs);

  // A person split across two spellings would show here as two short rows
  // rather than one whole one -- the failure this check is really looking for.
  const short = [...sheetByPerson].filter(([n, h]) => Math.abs((parsedByPerson.get(n) || 0) - h) > 0.0001);
  ok("no person's hours are short of the sheet's own total", short.length === 0,
     short.slice(0, 3).map(([n, h]) => `${n}: sheet ${h.toFixed(1)}, parsed ${(parsedByPerson.get(n) || 0).toFixed(1)}`).join("; "));
  eq("every person on the sheet survives ingest", parsedByPerson.size, sheetByPerson.size);

  console.log(`       ${real.length} rows, ${dates[0]} -> ${dates[dates.length - 1]}`);
  console.log(`       ${people.size} people, ${jobNos.size} job numbers, ${hours.toFixed(0)} hours`);
  console.log(`       job number parsed on ${((withNo.length / real.length) * 100).toFixed(1)}% of rows`);

  // The join is the whole point of profiling this export: if the job number
  // stops parsing, Time silently stops joining to everything else.
  ok("the job number parses on nearly every row",
     withNo.length / real.length > 0.99, `${withNo.length}/${real.length}`);
  ok("dashed admin job numbers survive intact",
     [...jobNos].every((j) => !/^\d\d$/.test(j)),
     "a bare '00' would mean 00-00N collapsed onto one key");
  ok("no row carries NaN hours", real.every((r) => Number.isFinite(r.hrs)));
  ok("every row has a person and a date", real.every((r) => r.name && r.date));

  // Location is the person's office, not the job's plant. Profiled 2026-08-31:
  // nobody sits at two, while many jobs are charged from several. If that ever
  // flips, the assumption in §12 needs revisiting -- and nothing should be
  // wired to job-cost/plants.js on the strength of it.
  const officeOf = new Map(), locsOfJob = new Map();
  for (const r of real) {
    if (!officeOf.has(r.name)) officeOf.set(r.name, new Set());
    officeOf.get(r.name).add(r.loc);
    if (!locsOfJob.has(r.jobNo)) locsOfJob.set(r.jobNo, new Set());
    locsOfJob.get(r.jobNo).add(r.loc);
  }
  const multiOffice = [...officeOf.values()].filter((x) => x.size > 1).length;
  const multiJobLoc = [...locsOfJob.values()].filter((x) => x.size > 1).length;
  console.log(`       Location: ${multiOffice}/${officeOf.size} people at >1, ${multiJobLoc}/${locsOfJob.size} jobs from >1`);
  ok("Location tracks the person, not the job", multiOffice === 0 && multiJobLoc > 0,
     `${multiOffice} people at 2+ offices, ${multiJobLoc} jobs charged from 2+`);

  // How much of the timesheet the rest of the app can actually speak about.
  // Printed, not asserted: it moves with whichever reports are loaded.
  const projectHours = real.filter((r) => r.jobNo && !/^00-/.test(r.jobNo)).reduce((a, r) => a + r.hrs, 0);
  const adminHours = real.filter((r) => /^00-/.test(r.jobNo)).reduce((a, r) => a + r.hrs, 0);
  console.log(`       ${((projectHours / hours) * 100).toFixed(1)}% of hours on project jobs, ` +
              `${((adminHours / hours) * 100).toFixed(1)}% on 00-* admin/overhead`);
}

console.log(failures ? `\n${failures} FAILURE(S)\n` : `\nAll checks passed.\n`);
process.exit(failures ? 1 : 0);
