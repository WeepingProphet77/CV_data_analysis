/**
 * Render every view to a string against the sample dataset.
 *
 * Not a substitute for looking at the page, but it does prove each view mounts,
 * the chart geometry survives real data, and no import is broken. Built through
 * Vite so JSX and the app's own import graph are used verbatim:
 *
 *   npm run test:render
 */
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import React from "react";

import { csvToRecords } from "../src/core/csv.js";
import { mapColumns, toIsoDate, toNumber } from "../src/core/parse.js";
import schema from "../src/modules/employee-time/schema.js";
import Overview from "../src/modules/employee-time/views/Overview.jsx";
import People from "../src/modules/employee-time/views/People.jsx";
import Projects from "../src/modules/employee-time/views/Projects.jsx";
import Cumulative from "../src/modules/employee-time/views/Cumulative.jsx";
import PersonDetail from "../src/modules/employee-time/views/PersonDetail.jsx";
import ProjectDetail from "../src/modules/employee-time/views/ProjectDetail.jsx";
import IngestSummary from "../src/components/IngestSummary.jsx";
import ScopeNotice from "../src/components/ScopeNotice.jsx";
import CostModule from "../src/modules/job-cost/index.jsx";
import TimeModule from "../src/modules/employee-time/index.jsx";
import HomeModule from "../src/modules/home/index.jsx";
import SourcesModule from "../src/modules/sources/index.jsx";
import ProjectsModule from "../src/modules/projects/index.jsx";
import JobPage from "../src/modules/job/index.jsx";
import AppHeader from "../src/components/AppHeader.jsx";
import { PageHeader, RouteTabs, NeedsSource } from "../src/components/Page.jsx";
import { SourceStrip, SourceRow, RemoveButton } from "../src/components/SourceStrip.jsx";
import { AppDataContext } from "../src/core/appData.js";
import { describeSources, sourceSummary } from "../src/app/sources.js";
import { projectRows, applyPresence } from "../src/modules/projects/rows.js";
import { assembleJob } from "../src/modules/job/assemble.js";
import { parseRoute, hrefFor, segments } from "../src/core/routing.js";
import { tabsFor, isSection, paramsFor, SECTIONS, DEFAULT_SECTION } from "../src/modules/registry.js";
import JcPortfolio from "../src/modules/job-cost/views/Portfolio.jsx";
import JcJobDetail from "../src/modules/job-cost/views/JobDetail.jsx";
import JcCostCodes from "../src/modules/job-cost/views/CostCodes.jsx";
import JcEngineering from "../src/modules/job-cost/views/Engineering.jsx";
import { SourceDrop } from "../src/modules/job-cost/views/SourceLibrary.jsx";
import { StarButton, ScopeToggle, NoProjectsYet } from "../src/components/MyProjects.jsx";
import { buildSource } from "../src/modules/job-cost/parse.js";
import { groupReport } from "../src/modules/job-cost/reportGroups.js";
import { money } from "../src/core/format.js";
import { categoryOf } from "../src/modules/job-cost/categories.js";
import { engineeringRollup, actIsHours } from "../src/modules/job-cost/engineering.js";
import { deriveJob, quantitiesByJob } from "../src/modules/job-cost/jobMetrics.js";
import { sampleWorkbooks } from "./job-cost-sample.mjs";
import App from "../src/App.jsx";
import { sumBy, distinct } from "../src/core/aggregate.js";

const { headers, records } = csvToRecords(readFileSync("samples/employee-time.sample.csv", "utf8"));
const { mapping } = mapColumns(headers, schema);
const rows = records.map((rec) => {
  const row = {};
  for (const f of schema.fields) {
    const v = rec[mapping[f.key]];
    row[f.key] = f.type === "date" ? toIsoDate(v) : f.type === "number" ? toNumber(v) : String(v ?? "").trim();
  }
  return { ...row, ...schema.derive(row) };
}).filter((r) => !schema.isEmptyRow(r));

/*
 * Job cost fixtures. The sample workbooks are generated rather than read: a
 * Job Cost Report is a binary multi-sheet workbook, and no real one may be
 * committed (CLAUDE.md §1).
 */
const jcSources = sampleWorkbooks().map((wb) => buildSource(wb.sheets, { plant: wb.plant, fileName: wb.fileName }));
// Decorated through the same function the app uses, so a fixture can never
// drift from what the views require.
const jcQtyForJob = quantitiesByJob(jcSources.flatMap((s) => s.quantities));
const jcJobs = jcSources.flatMap((s) => s.jobs).map((j) => deriveJob(j, jcQtyForJob.get(j.key)));
const jcCosts = jcSources.flatMap((s) => s.costs).map((c) => ({ ...c, category: categoryOf(c.code).label }));
const jcQuantities = jcSources.flatMap((s) => s.quantities);
const jcCostsByJob = new Map();
for (const c of jcCosts) {
  if (!jcCostsByJob.has(c.jobKey)) jcCostsByJob.set(c.jobKey, []);
  jcCostsByJob.get(c.jobKey).push(c);
}
const jcQtyByJob = new Map();
for (const q of jcSources.flatMap((s) => s.quantities)) {
  if (!jcQtyByJob.has(q.jobKey)) jcQtyByJob.set(q.jobKey, []);
  jcQtyByJob.get(q.jobKey).push(q);
}
const jcData = {
  jobs: jcJobs,
  asOfRange: { min: "2026-07-31", max: "2026-08-26" },
  mixedAsOf: true,
};
const jcLossJob = jcJobs.find((j) => j.estOhProfitPct < 0) || jcJobs[0];
const jcZeroJob = jcJobs.find((j) => j.netContract === 0) || jcJobs[0];

const total = sumBy(rows, (r) => r.hrs);
const person = distinct(rows, (r) => r.name)[0];
const job = distinct(rows, (r) => r.job)[0];
const noop = () => {};

// Stand-ins for the useMyProjects hook: one with a starred job, one empty.
const jcMine = {
  ready: true, members: new Set([jcJobs[0].jobNo]), memberList: [jcJobs[0].jobNo], count: 1,
  scope: "mine", active: true,
  isMember: (n) => n === jcJobs[0].jobNo, toggle: noop, setScope: noop, clearMembers: noop,
};
const jcMineEmpty = {
  ready: true, members: new Set(), memberList: [], count: 0, scope: "all", active: false,
  isMember: () => false, toggle: noop, setScope: noop, clearMembers: noop,
};

/*
 * A stand-in for the app-wide data context.
 *
 * The sections that read both sources at once — Home, Sources, Projects, the
 * job page — cannot be handed props, so they get a fixture context instead.
 * Two of them: everything loaded, and nothing loaded, because "no file yet" is
 * a state each of those pages is supposed to explain rather than render blank.
 */
const emptyDataset = { rows: [], meta: null, ready: true, persistWarning: "", load: noop, clear: noop };

const appLoaded = {
  ready: true,
  mine: jcMine,
  costLib: { sources: jcSources, ready: true, persistWarning: "", upsert: noop, remove: noop, clear: noop },
  cost: { data: { ...jcData, costs: jcCosts, quantities: jcQuantities, costsByJob: jcCostsByJob, qtyByJob: jcQtyByJob, byJobKey: new Map(jcJobs.map((j) => [j.key, j])) } },
  time: { ...emptyDataset, rows, meta: { fileName: "time.csv", fileDate: "2026-08-31" } },
};

const appEmpty = {
  ready: true,
  mine: jcMineEmpty,
  costLib: { sources: [], ready: true, persistWarning: "", upsert: noop, remove: noop, clear: noop },
  cost: { data: { jobs: [], costs: [], quantities: [], byJobKey: new Map(), costsByJob: new Map(), qtyByJob: new Map(), asOfRange: { min: "", max: "" }, mixedAsOf: false } },
  time: emptyDataset,
};

const withApp = (el, value = appLoaded) => (
  <AppDataContext.Provider value={value}>{el}</AppDataContext.Provider>
);

/*
 * File-age fixtures. "How old is this copy?" is what Sources is most often
 * opened to answer, so all three states are exercised: current, long past the
 * staleness threshold, and imported before the date was recorded at all.
 */
const iso = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const withAges = (base, days) => ({
  ...base,
  time: { ...base.time, meta: { ...(base.time.meta || {}), fileDate: iso(days) } },
  costLib: { ...base.costLib, sources: base.costLib.sources.map((x, i) => ({ ...x, fileDate: iso(days + i * 3) })) },
});
const appFresh = withAges(appLoaded, 1);
const appStale = withAges(appLoaded, 40);
// appLoaded's workbook sources carry no fileDate at all — the pre-existing
// import case, which must read as "unknown" rather than as an empty cell.

const projRows = projectRows({ costJobs: jcJobs, timeRows: rows });
// A job the timesheet sample actually books hours to, so the Hours block on the
// job page is exercised rather than merely imported.
const timedJobNo = rows.map((r) => r.jobNo).find(Boolean) || jcJobs[0].jobNo;
const sourceRoute = { section: "time", params: [], tab: "overview", rest: [] };

// My Projects over a job number the timesheet actually books hours to — Time
// takes part in the app-wide scope now that its export carries job numbers.
const timeJobNo = rows.map((r) => r.jobNo).find(Boolean) || "00-001";
const timeMine = {
  ready: true, members: new Set([timeJobNo]), memberList: [timeJobNo], count: 1,
  scope: "mine", active: true,
  isMember: (n) => n === timeJobNo, toggle: noop, setScope: noop, clearMembers: noop,
};
const timeMineNone = {
  ready: true, members: new Set(), memberList: [], count: 0, scope: "mine", active: false,
  isMember: () => false, toggle: noop, setScope: noop, clearMembers: noop,
};

const cases = [
  // A module returns null until useDataset resolves, and effects never run
  // when server-rendering — so rendering nothing is correct here, not a fault.
  // allowEmpty says "must not throw" rather than "must produce output".
  // The shell holds a placeholder until every saved record resolves, and
  // effects never run when server-rendering, so it stays at the placeholder.
  // allowEmpty says "must not throw" rather than "must produce output".
  ["App shell", <App />, { allowEmpty: true }],
  ["Route / default", <span>{JSON.stringify(parseRoute("", { isSection, tabsFor, paramsFor, fallback: DEFAULT_SECTION }))}</span>],
  ["Overview", <Overview rows={rows} onOpenProject={noop} />],
  ["People", <People rows={rows} total={total} search="" onOpenPerson={noop} />],
  ["Projects", <Projects rows={rows} total={total} search="" onOpenProject={noop} />],
  ["Cumulative", <Cumulative rows={rows} />],
  ["PersonDetail", <PersonDetail name={person} rows={rows} onBack={noop} onOpenProject={noop} />],
  ["ProjectDetail", <ProjectDetail job={job} rows={rows} onBack={noop} onOpenPerson={noop} />],

  // The ingest summary is the page's answer to "did it read all of it?", so its
  // quiet and loud states are both rendered -- a silent loud state is the bug.
  ["IngestSummary, everything read",
   <IngestSummary meta={{ recordsRead: 29510, rowCount: 29510, dropped: 0,
                          sheetsRead: [{ name: "Sheet1", records: 29510, rows: 29510 }], sheetsSkipped: [] }} />],
  ["IngestSummary, rows dropped",
   <IngestSummary meta={{ recordsRead: 100, rowCount: 90, dropped: 10,
                          sheetsRead: [{ name: "Sheet1", records: 100, rows: 90 }], sheetsSkipped: [] }} />],
  ["IngestSummary, a sheet was skipped",
   <IngestSummary meta={{ recordsRead: 50, rowCount: 50, dropped: 0,
                          sheetsRead: [{ name: "Page 1", records: 50, rows: 50 }],
                          sheetsSkipped: [{ name: "Page 2", why: "no Hours column" }] }} />],
  // An import saved before these fields existed must say nothing rather than
  // claim a completeness it cannot show.
  // A scoped pool must announce itself; an unscoped one must stay silent.
  ["ScopeNotice, My Projects active",
   <ScopeNotice mine={{ active: true, count: 8, setScope: noop }} range={{ min: "", max: "" }} dimensions={[]} />],
  ["ScopeNotice, a date window and a dimension",
   <ScopeNotice mine={{ active: false, count: 0, setScope: noop }} dateFrom="2026-08-01" dateTo="2026-08-31"
                range={{ min: "2026-01-01", max: "2026-09-01" }}
                dimensions={[{ label: "Location", value: "MDS" }, { label: "Department", value: "All" }]} />],
  ["ScopeNotice, nothing narrowing",
   <ScopeNotice mine={{ active: false, count: 0, setScope: noop }} range={{ min: "2026-01-01", max: "2026-09-01" }}
                dimensions={[{ label: "Location", value: "All" }]} />, { allowEmpty: true }],
  ["IngestSummary, meta from an older import",
   <IngestSummary meta={{ fileName: "old.xls" }} />, { allowEmpty: true }],
  ["Cost section", withApp(<CostModule tab="portfolio" />)],
  ["Cost section / codes", withApp(<CostModule tab="codes" />)],
  ["Cost section / engineering", withApp(<CostModule tab="engineering" />)],
  ["Cost section, nothing loaded", withApp(<CostModule tab="portfolio" />, appEmpty)],
  ["Cost / Job Report list", withApp(<CostModule tab="report" route={{ rest: [] }} />)],
  ["Cost / Job Report, one job", withApp(<CostModule tab="report" route={{ rest: [jcJobs[0].jobNo, jcJobs[0].plant] }} />)],
  ["Cost / Job Report, job but no plant", withApp(<CostModule tab="report" route={{ rest: [jcJobs[0].jobNo] }} />)],
  ["Cost / Job Report, unknown job", withApp(<CostModule tab="report" route={{ rest: ["00000"] }} />)],
  ["Cost / Job Report, nothing loaded", withApp(<CostModule tab="report" route={{ rest: [] }} />, appEmpty)],
  ["JC / JobDetail, no cost lines", <JcJobDetail job={jcJobs[0]} costs={[]} quantities={[]} onBack={noop} />],
  ["Time section", withApp(<TimeModule tab="overview" route={sourceRoute} />)],
  ["Time section / people", withApp(<TimeModule tab="people" route={sourceRoute} />)],
  ["Time section / jobs", withApp(<TimeModule tab="jobs" route={sourceRoute} />)],
  ["Time section, scoped to My Projects", withApp(<TimeModule tab="overview" route={sourceRoute} />, { ...appLoaded, mine: timeMine })],
  ["Time section, scope with nothing starred", withApp(<TimeModule tab="overview" route={sourceRoute} />, { ...appLoaded, mine: timeMineNone })],
  ["Time section / cumulative", withApp(<TimeModule tab="cumulative" route={sourceRoute} />)],
  ["Time / person route", withApp(<TimeModule tab="people" route={{ ...sourceRoute, rest: ["person", person] }} />)],
  ["Time / job route", withApp(<TimeModule tab="jobs" route={{ ...sourceRoute, rest: ["job", job] }} />)],
  ["Time section, nothing loaded", withApp(<TimeModule tab="overview" route={sourceRoute} />, appEmpty)],
  ["JC / SourceDrop empty", <SourceDrop onSource={noop} />],
  ["JC / Portfolio", <JcPortfolio jobs={jcJobs} costs={jcCosts} onOpenJob={noop} />],
  ["JC / ScopeToggle", <ScopeToggle mine={jcMine} />],
  ["JC / ScopeToggle empty", <ScopeToggle mine={jcMineEmpty} />],
  ["JC / StarButton", <StarButton jobNo="50101" on onToggle={noop} />],
  ["JC / NoProjectsYet", <NoProjectsYet onShowAll={noop} />],
  ["JC / CostCodes", <JcCostCodes costs={jcCosts} jobs={jcJobs} search="" onOpenJob={noop} />],
  ["JC / JobDetail", <JcJobDetail job={jcJobs[0]} costs={jcCosts.filter((c) => c.jobKey === jcJobs[0].key)} quantities={jcQtyByJob.get(jcJobs[0].key) || []} mine={jcMine} onBack={noop} />],
  // A job forecast to a loss, and one with no contract at all — every margin
  // and progress figure divides by one of those.
  ["JC / JobDetail loss", <JcJobDetail job={jcLossJob} costs={jcCosts.filter((c) => c.jobKey === jcLossJob.key)} quantities={jcQtyByJob.get(jcLossJob.key) || []} onBack={noop} />],
  ["JC / JobDetail zero contract", <JcJobDetail job={jcZeroJob} costs={jcCosts.filter((c) => c.jobKey === jcZeroJob.key)} quantities={[]} onBack={noop} />],
  ["JC / Engineering", <JcEngineering jobs={jcJobs} costs={jcCosts} quantities={jcQuantities} mine={jcMineEmpty} onOpenJob={noop} onScopeToMine={noop} />],
  ["JC / Engineering scoped", <JcEngineering jobs={jcJobs.filter((j) => jcMine.members.has(j.jobNo))} costs={jcCosts} quantities={jcQuantities} mine={jcMine} onOpenJob={noop} onScopeToMine={noop} />],
  ["JC / Engineering no D&E", <JcEngineering jobs={jcJobs} costs={[]} quantities={[]} mine={jcMineEmpty} onOpenJob={noop} onScopeToMine={noop} />],
  ["JC / Portfolio no jobs", <JcPortfolio jobs={[]} costs={[]} onOpenJob={noop} />],
  ["JC / CostCodes no costs", <JcCostCodes costs={[]} jobs={[]} search="" onOpenJob={noop} />],
  // The shell and the sections that read every source at once.
  ["Home", withApp(<HomeModule />)],
  ["Home, stale files", withApp(<HomeModule />, appStale)],
  ["Home, nothing loaded", withApp(<HomeModule />, appEmpty)],
  ["AppHeader, stale files", <AppHeader section="home" mine={jcMine} summary={sourceSummary(appStale)} />],
  ["Sources", withApp(<SourcesModule />)],
  ["Sources, fresh files", withApp(<SourcesModule />, appFresh)],
  ["Sources, stale files", withApp(<SourcesModule />, appStale)],
  ["Sources, nothing loaded", withApp(<SourcesModule />, appEmpty)],
  ["Projects / All Jobs", withApp(<ProjectsModule tab="jobs" />)],
  ["Projects, nothing loaded", withApp(<ProjectsModule tab="jobs" />, appEmpty)],
  ["Job page with hours", withApp(<JobPage params={[timedJobNo]} tab="summary" />)],
  ["Job page / full cost report", withApp(<JobPage params={[jcJobs[0].jobNo]} tab="cost" />)],
  ["Job page, cost only", withApp(<JobPage params={[jcJobs[0].jobNo]} tab="summary" />)],
  ["Job page, unknown job", withApp(<JobPage params={["00000"]} tab="summary" />)],
  ["Job page, nothing loaded", withApp(<JobPage params={["43134"]} tab="summary" />, appEmpty)],
  ["AppHeader", <AppHeader section="home" mine={jcMine} summary={sourceSummary(appLoaded)} />],
  ["AppHeader, nothing loaded", <AppHeader section="home" mine={jcMineEmpty} summary={sourceSummary(appEmpty)} />],
  ["PageHeader", <PageHeader title="T" subtitle="s" actions={<button className="btn">x</button>} />],
  ["RouteTabs", <RouteTabs section="cost" tabs={tabsFor("cost")} active="portfolio" counts={{ codes: 3 }} />],
  ["NeedsSource", <NeedsSource title="T" file="a file" blurb="b" />],
  ["SourceStrip", <SourceStrip><SourceRow name="n" badge="b" detail="d" fileName="f.xls" actions={<RemoveButton onRemove={noop} what="it" />} /></SourceStrip>],

  // Degenerate inputs: empty and single-row datasets must not throw.
  ["Overview / no rows", <Overview rows={[]} onOpenProject={noop} />],
  ["Cumulative / no rows", <Cumulative rows={[]} />],
  ["Cumulative / one row", <Cumulative rows={[rows[0]]} />],
  ["People / no rows", <People rows={[]} total={0} search="" onOpenPerson={noop} />],
  ["ProjectDetail / unknown job", <ProjectDetail job="nope" rows={rows} onBack={noop} onOpenPerson={noop} />],
];

let failures = 0;
console.log(`\nRendering ${cases.length} cases against ${rows.length} sample rows\n`);
for (const [name, el, opts = {}] of cases) {
  try {
    const html = renderToString(el);
    if (!html.length && !opts.allowEmpty) throw new Error("rendered empty");
    console.log(`  ok   ${name.padEnd(26)} ${String(html.length).padStart(7)} bytes`);
  } catch (err) {
    failures++;
    console.log(`FAIL   ${name}\n        ${err.stack?.split("\n").slice(0, 3).join("\n        ")}`);
  }
}

// The SVG the chart produces should actually contain plotted geometry.
const chartHtml = renderToString(<Cumulative rows={rows} />);
const paths = (chartHtml.match(/<path/g) || []).length;
const circles = (chartHtml.match(/<circle/g) || []).length;
if (paths < 2 || circles < 2) {
  failures++;
  console.log(`FAIL   chart drew geometry (paths=${paths}, end markers=${circles})`);
} else {
  console.log(`  ok   chart drew geometry        ${paths} paths, ${circles} end markers`);
}

// The grouped cost grid: every section and every category gets its own row
// with totals, and the lines stay folded away until one is opened -- the job
// reads as a dozen subtotals first. Counts come from groupReport itself, so a
// view that drops or invents a group fails here.
const jcDetailCosts = jcCosts.filter((c) => c.jobKey === jcJobs[0].key);
const jcDetail = renderToString(
  <JcJobDetail job={jcJobs[0]} costs={jcDetailCosts}
               quantities={jcQtyByJob.get(jcJobs[0].key) || []} onBack={noop} />
);
{
  const want = groupReport(jcDetailCosts);
  const wantGroups = want.sections.reduce((n, x) => n + x.groups.length, 0);
  const sectionRows = (jcDetail.match(/class="sectionrow clickable"/g) || []).length;
  const catRows = (jcDetail.match(/class="catrow clickable"/g) || []).length;
  const lineRows = (jcDetail.match(/class="lineRow"/g) || []).length;
  if (sectionRows !== want.sections.length || catRows !== wantGroups || sectionRows < 2) {
    failures++;
    console.log(`FAIL   grid drew every section and category (sections=${sectionRows}/${want.sections.length}, categories=${catRows}/${wantGroups})`);
  } else {
    console.log(`  ok   grid drew every section and category  ${sectionRows} sections, ${catRows} categories`);
  }
  if (lineRows !== 0) {
    failures++;
    console.log(`FAIL   lines start folded under their category (${lineRows} shown)`);
  } else {
    console.log("  ok   lines start folded under their category");
  }
  // Every total row -- section, category and job -- carries a completion bar
  // wherever something is projected, not just the lines (§13).
  const gridHtml = jcDetail.split("Cost detail by section")[1].split("</table>")[0];
  const bars = (gridHtml.match(/class="minibar"/g) || []).length;
  const wantBars = want.sections.filter((x) => x.totals.projCost > 0).length +
    want.sections.flatMap((x) => x.groups).filter((g) => g.totals.projCost > 0).length +
    (want.totals.projCost > 0 ? 1 : 0);
  if (bars !== wantBars) {
    failures++;
    console.log(`FAIL   every total row carries a completion bar (bars=${bars}, want=${wantBars})`);
  } else {
    console.log(`  ok   every total row carries a completion bar  ${bars} bars`);
  }
  // The grid's own job total must be the report's, to the cent.
  if (!jcDetail.includes(money(jcJobs[0].totals.actCost))) {
    failures++;
    console.log("FAIL   the grid's job total matches the report's Job Totals");
  } else {
    console.log("  ok   the grid's job total matches the report's Job Totals");
  }
}

// The Job Report tab: a list with no job, the full report with one, and a
// plain explanation for a job number no loaded report carries.
{
  const list = renderToString(withApp(<CostModule tab="report" route={{ rest: [] }} />, { ...appLoaded, mine: jcMineEmpty }));
  const listRows = (list.match(/<tr class="clickable"/g) || []).length;
  if (listRows !== jcJobs.length) {
    failures++;
    console.log(`FAIL   the Job Report list offers every job (${listRows} of ${jcJobs.length})`);
  } else {
    console.log(`  ok   the Job Report list offers every job  ${listRows} jobs`);
  }
  const one = renderToString(withApp(<CostModule tab="report" route={{ rest: [jcJobs[0].jobNo, jcJobs[0].plant] }} />));
  if (!/class="sectionrow clickable"/.test(one) || !one.includes(jcJobs[0].jobTitle)) {
    failures++;
    console.log("FAIL   an addressed job opens its full report");
  } else {
    console.log("  ok   an addressed job opens its full report");
  }
  const none = renderToString(withApp(<CostModule tab="report" route={{ rest: ["00000"] }} />));
  if (!/No loaded cost report carries job/.test(none)) {
    failures++;
    console.log("FAIL   an unknown job says so");
  } else {
    console.log("  ok   an unknown job says so");
  }
}

// My Projects must actually isolate the data, not just re-label it. The scope
// narrows the row pool inside the section, so this renders the section rather
// than pre-filtering its input -- pre-filtering would prove nothing.
const projAllHtml = renderToString(withApp(<ProjectsModule tab="jobs" />, { ...appLoaded, mine: jcMineEmpty }));
const projMineHtml = renderToString(withApp(<ProjectsModule tab="jobs" />, appLoaded));
const rowsIn = (h) => (h.match(/<tr class="clickable"/g) || []).length;
if (!(rowsIn(projMineHtml) === 1 && rowsIn(projAllHtml) === projRows.length && rowsIn(projAllHtml) > 1)) {
  failures++;
  console.log(`FAIL   My Projects narrows the table (all=${rowsIn(projAllHtml)}, mine=${rowsIn(projMineHtml)})`);
} else {
  console.log(`  ok   My Projects narrows the table    ${rowsIn(projAllHtml)} jobs -> ${rowsIn(projMineHtml)}`);
}
if (!projMineHtml.includes("★") || !projAllHtml.includes("☆")) {
  failures++;
  console.log("FAIL   star reflects membership");
} else {
  console.log("  ok   star reflects membership");
}

// Every loaded source must state how old its file is -- that is the whole
// point of the page. Three states, three different renderings, and a stale
// file has to be visibly different from a fresh one rather than just later.
{
  const fresh = renderToString(withApp(<SourcesModule />, appFresh));
  const stale = renderToString(withApp(<SourcesModule />, appStale));
  const unknown = renderToString(withApp(<SourcesModule />, appLoaded));
  const dated = (h) => (h.match(/modified \d{4}-\d{2}-\d{2}/g) || []).length;
  // One per source card: cost (its oldest plant) and time.
  if (dated(fresh) < 2) {
    failures++;
    console.log(`FAIL   every loaded source shows a modified date (found ${dated(fresh)})`);
  } else {
    console.log(`  ok   sources show a modified date     ${dated(fresh)} dates on the page`);
  }
  if (/more than \d+ days ago/.test(fresh) || !/more than \d+ days ago/.test(stale)) {
    failures++;
    console.log("FAIL   a stale file is called out and a fresh one is not");
  } else {
    console.log("  ok   stale files are called out      fresh ones are not");
  }
  // A file with no recorded date must say so, not render blank or "Invalid Date".
  if (!/date unknown|modified date was recorded/.test(unknown) || /Invalid Date|NaN/.test(unknown)) {
    failures++;
    console.log("FAIL   an unrecorded date reads as unknown");
  } else {
    console.log("  ok   an unrecorded date reads as unknown");
  }
}

// The unified table must carry both sides: a job the cost reports know and a
// job only the timesheet knows appear in one list, with the absent side dashed
// rather than zeroed. That is the merge this section exists to perform.
{
  // Every row must come from at least one source -- a row belonging to none
  // would mean the merge invented a job.
  const orphan = projRows.filter((r) => !r.costed && !r.timed).length;
  const costed = projRows.filter((r) => r.costed).length;
  const timed = projRows.filter((r) => r.timed).length;
  const only = (k) => projRows.filter((r) => r.sources === k).length;
  if (orphan > 0 || projRows.length < Math.max(costed, timed) || projRows.length <= jcJobs.length) {
    failures++;
    console.log(`FAIL   projects merged both sources (orphans=${orphan}, rows=${projRows.length}, cost=${costed}, time=${timed})`);
  } else {
    console.log(`  ok   projects merged both sources     ${projRows.length} jobs (${costed} costed, ${timed} with hours; ${only("cost")} cost-only, ${only("time")} time-only)`);
  }
  if (!/Not in this source/.test(projAllHtml)) {
    failures++;
    console.log("FAIL   a source that says nothing renders a dash, not a zero");
  } else {
    console.log("  ok   absent source renders a dash");
  }
}

// The engineering tab must draw its charts and keep hours out of the outsourced
// and lump-sum lines -- the numbers that would be silently wrong otherwise.
const jcEngHtml = renderToString(
  <JcEngineering jobs={jcJobs} costs={jcCosts} quantities={jcQuantities} mine={jcMineEmpty} onOpenJob={noop} onScopeToMine={noop} />
);
const engPaths = (jcEngHtml.match(/<path/g) || []).length;
if (engPaths < 8) {
  failures++;
  console.log(`FAIL   engineering charts drew geometry (paths=${engPaths})`);
} else {
  console.log(`  ok   engineering charts drew geometry ${engPaths} paths`);
}
{
  const eng = engineeringRollup(jcJobs, jcCosts, jcQuantities);
  const hourly = jcCosts.filter((c) => c.section === "D&E" && actIsHours(c));
  const expected = hourly.reduce((s2, c) => s2 + c.actQty, 0);
  if (Math.abs(eng.totals.hoursAct - expected) > 0.001 || !eng.lumpSum.length) {
    failures++;
    console.log(`FAIL   engineering hours exclude lump sums (got ${eng.totals.hoursAct}, want ${expected}, lumpSum=${eng.lumpSum.length})`);
  } else {
    console.log(`  ok   engineering hours exclude lump sums  ${eng.totals.hoursAct}h, ${eng.lumpSum.length} lump-sum line(s)`);
  }
}

// An unresolved template placeholder is valid JSX and renders silently as
// literal text, so nothing above would catch it. Every rendered view is checked
// for one.
{
  const leaks = cases
    .map(([name, el, opts = {}]) => {
      let html = "";
      try { html = renderToString(el); } catch { return null; }
      return /\$\{|\{'\{'\}/.test(html) ? name : null;
    })
    .filter(Boolean);
  if (leaks.length) {
    failures++;
    console.log(`FAIL   no unresolved template placeholders (${leaks.join(", ")})`);
  } else {
    console.log("  ok   no unresolved template placeholders");
  }
}

// The retired sections must be gone from the nav, and an old bookmark must not
// render a blank page (docs/cost-and-time-focus.md).
{
  const nav = renderToString(<AppHeader section="home" mine={jcMine} summary={sourceSummary(appLoaded)} />);
  if (/#\/production|#\/drawings|>Production<|>Drawings</.test(nav)) {
    failures++;
    console.log("FAIL   the nav no longer offers Production or Drawings");
  } else {
    console.log("  ok   the nav no longer offers Production or Drawings");
  }
  const home = renderToString(withApp(<HomeModule />));
  if (!/moved to\s+other tools/.test(home)) {
    failures++;
    console.log("FAIL   Home says where the retired sections went");
  } else {
    console.log("  ok   Home says where the retired sections went");
  }
}

console.log(failures ? `\n${failures} FAILURE(S)\n` : `\nAll views rendered.\n`);
process.exit(failures ? 1 : 0);
