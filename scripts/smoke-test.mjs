/**
 * Node smoke test over the pure data layer — parsing, coercion, grouping and
 * cumulative math. No DOM involved, so it runs anywhere:
 *
 *   node scripts/smoke-test.mjs
 */
import { readFileSync } from "node:fs";
import { csvToRecords, parseCsv } from "../src/core/csv.js";
import { mapColumns, toIsoDate, toNumber } from "../src/core/parse.js";
import { rollup, cumulativeSeries, dateDomain, topNWithOther, sumBy, distinct } from "../src/core/aggregate.js";
import schema from "../src/modules/employee-time/schema.js";
import { niceTicks } from "../src/components/charts/scale.js";
import { parseRoute, hrefFor, segments } from "../src/core/routing.js";
import { isSection, tabsFor, paramsFor, SECTIONS, DEFAULT_SECTION, findSection, ALIASES } from "../src/modules/sections.js";
import { projectRows, applyPresence, PRESENCE } from "../src/modules/projects/rows.js";
import { assembleJob, matchTimeRows, allJobNumbers } from "../src/modules/job/assemble.js";

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
const pj = projectRows({ costJobs: pjCost, scheduleRows: pjSched, ticketRows: pjTick });
eq("one row per job number", pj.length, 3);
eq("costed and scheduled merge onto one row", pj.find((r) => r.jobNo === "100").sources, "cost+schedule");
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

console.log("\nOne job, every source");
const aj = assembleJob({
  jobNo: "100", costJobs: pjCost, scheduleRows: pjSched, ticketRows: pjTick,
  timeRows: [{ job: "100 - A", hrs: 8, name: "N", date: "2026-08-01" },
             { job: "999 - other", hrs: 4, name: "N", date: "2026-08-01" }],
  loaded: { cost: true, schedule: true, drawings: true, time: true },
});
eq("cost side found", aj.cost.netContract, 100);
eq("schedule side found", aj.schedule.pieces, 2);
eq("drawings side empty for this job", aj.drawings.pieces, 0);
eq("hours matched on the job number only", aj.hours.hours, 8);
// The timesheet join is a guess and must never claim otherwise (CLAUDE.md §12).
eq("the hours match is never presented as confirmed", aj.hours.confident, false);
eq("a token match, not a substring", matchTimeRows([{ job: "1000 - X" }], "100").length, 0);
const ajNone = assembleJob({ jobNo: "404", costJobs: pjCost, scheduleRows: pjSched, loaded: {} });
eq("a job no source knows has no cost section", ajNone.cost, null);
eq("a job no source knows has no schedule section", ajNone.schedule, null);
eq("job numbers gathered from every source",
   allJobNumbers({ costJobs: pjCost, scheduleRows: pjSched, ticketRows: pjTick }), ["100", "200", "300"]);

console.log("\nAxis ticks");
eq("nice ticks from 0..87", niceTicks(0, 87, 5).ticks, [0, 20, 40, 60, 80, 100]);
ok("degenerate range is safe", niceTicks(0, 0).ticks.length >= 2);

console.log(failures ? `\n${failures} FAILURE(S)\n` : `\nAll checks passed.\n`);
process.exit(failures ? 1 : 0);
