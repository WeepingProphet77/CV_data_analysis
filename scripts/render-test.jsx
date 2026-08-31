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
import ProductionModule from "../src/modules/production/index.jsx";
import prodSchema from "../src/modules/production/schema.js";
import ProdSchedule from "../src/modules/production/views/Schedule.jsx";
import PlanningBoard from "../src/modules/production/views/PlanningBoard.jsx";
import PieceDetail from "../src/modules/production/views/PieceDetail.jsx";
import ProdOverview from "../src/modules/production/views/Overview.jsx";
import ProdBeds from "../src/modules/production/views/Beds.jsx";
import ProdPieces from "../src/modules/production/views/Pieces.jsx";
import DayDetail from "../src/modules/production/views/DayDetail.jsx";
import { TicketDrop, TicketImportButton, CoverageNotice } from "../src/modules/production/views/TicketImport.jsx";
import { buildTicketSource } from "../src/modules/production/ticketParse.js";
import { ticketIndex, ticketCoverage } from "../src/modules/production/tickets.js";
import { ticketSheet } from "./production-ticket-sample.mjs";
import ProdMovement from "../src/modules/production/views/Movement.jsx";
import BaselineBar from "../src/modules/production/views/BaselineBar.jsx";
import { snapshotOf, diffSchedule } from "../src/modules/production/movement.js";
import CostModule from "../src/modules/job-cost/index.jsx";
import TimeModule from "../src/modules/employee-time/index.jsx";
import HomeModule from "../src/modules/home/index.jsx";
import SourcesModule from "../src/modules/sources/index.jsx";
import ProjectsModule from "../src/modules/projects/index.jsx";
import DrawingsModule from "../src/modules/drawings/index.jsx";
import JobPage from "../src/modules/job/index.jsx";
import DrawQueue from "../src/modules/drawings/views/Queue.jsx";
import DrawByJob from "../src/modules/drawings/views/ByJob.jsx";
import DrawByDrafter from "../src/modules/drawings/views/ByDrafter.jsx";
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
import JcProductionLink from "../src/modules/job-cost/views/ProductionLink.jsx";
import JcEngineering from "../src/modules/job-cost/views/Engineering.jsx";
import { SourceDrop } from "../src/modules/job-cost/views/SourceLibrary.jsx";
import { StarButton, ScopeToggle, NoProjectsYet } from "../src/components/MyProjects.jsx";
import { buildSource } from "../src/modules/job-cost/parse.js";
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

// Production module fixtures, built the same way from its own sample.
const prodCsv = csvToRecords(readFileSync("samples/production.sample.csv", "utf8"));
const prodMap = mapColumns(prodCsv.headers, prodSchema).mapping;
const prodRows = prodCsv.records.map((rec) => {
  const row = {};
  for (const f of prodSchema.fields) {
    const v = rec[prodMap[f.key]];
    row[f.key] = f.type === "date" ? toIsoDate(v) : f.type === "number" ? toNumber(v) : String(v ?? "").trim();
  }
  return { ...row, ...prodSchema.derive(row) };
}).filter((r) => !prodSchema.isEmptyRow(r));

const prodPlants = ["All", ...distinct(prodRows, (r) => r.plant)];
const prodDay = prodRows[0].date;
const prodScheduledJobNos = new Set(prodRows.map((r) => r.jobNo).filter(Boolean));

/*
 * A missing-ticket report built over the *production sample's own* pieces, so
 * the board actually flags something and the marker is exercised rather than
 * merely imported. Real reports may never be committed (CLAUDE.md §1), so this
 * is generated in memory like the job cost workbooks.
 */
const prodFlagged = prodRows.filter((r) => r.isPour && r.jobNo && r.mark).slice(0, 12);
const ticketSource = buildTicketSource(
  ticketSheet([{
    plant: prodFlagged[0].plant,
    jobs: [...new Map(prodFlagged.map((r) => [r.jobNo, r])).keys()].map((jobNo) => ({
      jobNo,
      jobName: prodFlagged.find((r) => r.jobNo === jobNo).jobTitle,
      group: "Grp - A",
      // Half the rows are left unassigned so the "no drafter" bucket renders.
      pieces: prodFlagged.filter((r) => r.jobNo === jobNo)
        .map((r, i) => [r.mark, i % 2 ? "adrafter" : "", 46235 + i, Math.round(r.sf) || 1]),
    })),
  }]),
  { fileName: "tickets.sample.xlsx" }
);
/*
 * A "previous upload" for the movement report: the same sample with a share of
 * the pieces shifted, some withheld so they read as new, and one invented so it
 * reads as dropped.
 */
const prodBaseline = snapshotOf(
  prodRows
    .filter((_, i) => i % 37 !== 0)
    .map((r, i) => {
      if (!r.mark || !r.date) return r;
      if (i % 11 === 0) return { ...r, date: `2026-0${r.date[6] === "8" ? "8" : "8"}-${String(((+r.date.slice(8) + 3) % 28) + 1).padStart(2, "0")}` };
      return r;
    })
).concat([{ jobNo: prodRows[0].jobNo, job: prodRows[0].job, mark: "ZZ-DROPPED", date: prodRows[0].date, plant: prodRows[0].plant, bed: prodRows[0].bed, qty: 1 }]);
const prodDiff = diffSchedule(prodBaseline, prodRows);
const prodBaselineMeta = { fileName: "ScheduledProdRptDtl-prev.xls", fileDate: "2026-08-18", replacedOn: "2026-08-31", rowCount: prodBaseline.length };
const prodNoDiff = diffSchedule(snapshotOf(prodRows), prodRows);

const prodTicketIdx = ticketIndex(ticketSource.rows);
const prodCoverage = ticketCoverage(prodRows, ticketSource.rows);
// A report whose dates miss the schedule entirely — the state the coverage
// notice exists to shout about.
const prodCoverageMiss = ticketCoverage(
  prodRows,
  ticketSource.rows.map((t) => ({ ...t, date: "2029-01-05" }))
);

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
// A job that exists in the production sample too, so the join has something to
// match: the sample job numbers differ, so one is grafted on deliberately.
const jcJoinRows = prodRows.map((r) => ({ ...r, jobNo: "50101" }));
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
// The same selection shape, over production job numbers — My Projects is now
// app-wide, so production mounts the very same controls.
const prodMine = {
  ready: true, members: new Set([prodFlagged[0].jobNo]), memberList: [prodFlagged[0].jobNo],
  count: 1, scope: "mine", active: true,
  isMember: (n) => n === prodFlagged[0].jobNo, toggle: noop, setScope: noop, clearMembers: noop,
};


/*
 * A stand-in for the app-wide data context.
 *
 * The sections that read every source at once — Home, Sources, Projects, the
 * job page — cannot be handed props, so they get a fixture context instead.
 * Two of them: everything loaded, and nothing loaded, because "no file yet" is
 * a state each of those pages is supposed to explain rather than render blank.
 */
const emptyDataset = { rows: [], meta: null, ready: true, persistWarning: "", load: noop, clear: noop };

const appLoaded = {
  ready: true,
  mine: prodMine,
  schedule: {
    ...emptyDataset, rows: prodRows, pool: prodRows,
    meta: { fileName: "ScheduledProdRptDtl.xls", fileDate: "2026-08-31", warnings: ["a note"] },
  },
  scheduleRange: { min: prodRows[0].date, max: prodRows[prodRows.length - 1].date },
  scheduledJobNos: prodScheduledJobNos,
  baseline: { ...emptyDataset, rows: prodBaseline, meta: prodBaselineMeta },
  diff: prodDiff,
  ticketData: { ...emptyDataset, rows: ticketSource.rows },
  tickets: {
    source: ticketSource, rows: ticketSource.rows, index: prodTicketIdx,
    load: noop, clear: noop, persistWarning: "",
  },
  coverage: prodCoverage,
  costLib: { sources: jcSources, ready: true, persistWarning: "", upsert: noop, remove: noop, clear: noop },
  cost: { data: { ...jcData, costs: jcCosts, quantities: jcQuantities, costsByJob: new Map(), qtyByJob: jcQtyByJob, byJobKey: new Map(jcJobs.map((j) => [j.key, j])) } },
  time: { ...emptyDataset, rows, meta: { fileName: "time.csv", fileDate: "2026-08-31" } },
};

const appEmpty = {
  ready: true,
  mine: jcMineEmpty,
  schedule: { ...emptyDataset, pool: [] },
  scheduleRange: { min: "", max: "" },
  scheduledJobNos: new Set(),
  baseline: emptyDataset,
  diff: diffSchedule([], []),
  ticketData: emptyDataset,
  tickets: { source: { fileName: "", rows: [], jobs: [], plants: [], range: { min: "", max: "" }, warnings: [] }, rows: [], index: new Map(), load: noop, clear: noop, persistWarning: "" },
  coverage: ticketCoverage([], []),
  costLib: { sources: [], ready: true, persistWarning: "", upsert: noop, remove: noop, clear: noop },
  cost: { data: { jobs: [], costs: [], quantities: [], byJobKey: new Map(), costsByJob: new Map(), qtyByJob: new Map(), asOfRange: { min: "", max: "" }, mixedAsOf: false } },
  time: emptyDataset,
};

const withApp = (el, value = appLoaded) => (
  <AppDataContext.Provider value={value}>{el}</AppDataContext.Provider>
);

const projRows = projectRows({
  costJobs: jcJobs, scheduleRows: prodRows, ticketRows: ticketSource.rows,
});
const jobFixture = assembleJob({
  jobNo: prodFlagged[0].jobNo,
  costJobs: jcJobs, scheduleRows: prodRows, ticketRows: ticketSource.rows,
  timeRows: rows, diff: prodDiff,
  loaded: { cost: true, schedule: true, drawings: true, time: true },
});
const sourceRoute = { section: "time", params: [], tab: "overview", rest: [] };

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
  ["Prod / Board", <PlanningBoard rows={prodRows} plant="All" plants={prodPlants} onPlant={noop} />],
  ["Prod / Board + tickets", <PlanningBoard rows={prodRows} plant="All" plants={prodPlants} onPlant={noop} tickets={prodTicketIdx} />],
  ["Prod / Board + movement", <PlanningBoard rows={prodRows} plant="All" plants={prodPlants} onPlant={noop} movement={prodDiff.byRow} />],
  ["Prod / Board + tickets and movement", <PlanningBoard rows={prodRows} plant="All" plants={prodPlants} onPlant={noop} tickets={prodTicketIdx} movement={prodDiff.byRow} />],
  ["Prod / Board + movement, nothing moved", <PlanningBoard rows={prodRows} plant="All" plants={prodPlants} onPlant={noop} movement={prodNoDiff.byRow} />],
  ["Prod / Board + empty ticket index", <PlanningBoard rows={prodRows} plant="All" plants={prodPlants} onPlant={noop} tickets={new Map()} />],
  ["Prod / Board + tickets, none matching", <PlanningBoard rows={prodRows} plant="All" plants={prodPlants} onPlant={noop} tickets={ticketIndex([{ jobNo: "00000", mark: "NOPE", key: "00000|NOPE" }])} />],
  ["Prod / Board (1 plant)", <PlanningBoard rows={prodRows.filter((r) => r.plant === prodPlants[1])} plant={prodPlants[1]} plants={prodPlants} onPlant={noop} />],
  ["Prod / Board no rows", <PlanningBoard rows={[]} plant="All" plants={["All"]} onPlant={noop} />],
  ["Prod / PieceDetail", <PieceDetail piece={prodRows.find((r) => r.isPour)} siblings={prodRows.slice(0, 4)} onClose={noop} onSelect={noop} />],
  ["Prod / PieceDetail bed activity", <PieceDetail piece={prodRows.find((r) => !r.isPour)} siblings={[]} onClose={noop} onSelect={noop} />],
  ["Prod / PieceDetail missing ticket", <PieceDetail piece={prodFlagged[0]} siblings={[]} ticket={prodTicketIdx.get(ticketSource.rows[0].key)} ticketsLoaded onClose={noop} onSelect={noop} />],
  ["Prod / PieceDetail ticket present", <PieceDetail piece={prodRows.find((r) => r.isPour)} siblings={[]} ticketsLoaded onClose={noop} onSelect={noop} />],
  ["Prod / Schedule", <ProdSchedule rows={prodRows} plant="All" plants={prodPlants} onPlant={noop} />],
  ["Prod / Schedule (1 plant)", <ProdSchedule rows={prodRows.filter((r) => r.plant === prodPlants[1])} plant={prodPlants[1]} plants={prodPlants} onPlant={noop} />],
  ["Prod / Overview", <ProdOverview rows={prodRows} onOpenJob={noop} />],
  ["Prod / Beds", <ProdBeds rows={prodRows} search="" />],
  ["Draw / Queue", <DrawQueue rows={ticketSource.rows} scheduledJobNos={prodScheduledJobNos} today="2026-08-10" onOpenJob={noop} />],
  ["Draw / Queue no rows", <DrawQueue rows={[]} scheduledJobNos={prodScheduledJobNos} today="2026-08-10" onOpenJob={noop} />],
  ["Draw / Queue one row", <DrawQueue rows={ticketSource.rows.slice(0, 1)} scheduledJobNos={new Set()} today="2026-08-10" onOpenJob={noop} />],
  ["Draw / ByJob", <DrawByJob rows={ticketSource.rows} scheduledJobNos={prodScheduledJobNos} mine={prodMine} onOpenJob={noop} />],
  ["Draw / ByJob no stars", <DrawByJob rows={ticketSource.rows} scheduledJobNos={new Set()} onOpenJob={noop} />],
  ["Draw / ByJob no rows", <DrawByJob rows={[]} scheduledJobNos={new Set()} mine={prodMine} onOpenJob={noop} />],
  ["Draw / ByDrafter", <DrawByDrafter rows={ticketSource.rows} />],
  ["Draw / ByDrafter no rows", <DrawByDrafter rows={[]} />],
  ["Draw / section", withApp(<DrawingsModule tab="queue" />)],
  ["Draw / section by job", withApp(<DrawingsModule tab="jobs" />)],
  ["Draw / section by drafter", withApp(<DrawingsModule tab="drafters" />)],
  ["Draw / section, nothing loaded", withApp(<DrawingsModule tab="queue" />, appEmpty)],
  ["Prod / TicketDrop", <TicketDrop onSource={noop} />],
  ["Prod / TicketImportButton", <TicketImportButton onSource={noop} />],
  ["Prod / Movement", <ProdMovement diff={prodDiff} baselineMeta={prodBaselineMeta} currentMeta={{ fileName: "ScheduledProdRptDtl.xls" }} mine={prodMine} onOpenJob={noop} />],
  ["Prod / Movement, nothing moved", <ProdMovement diff={prodNoDiff} baselineMeta={prodBaselineMeta} currentMeta={{ fileName: "x.xls" }} mine={prodMine} onOpenJob={noop} />],
  ["Prod / Movement, no stars", <ProdMovement diff={prodDiff} baselineMeta={prodBaselineMeta} currentMeta={{}} onOpenJob={noop} />],
  ["Prod / Movement, no baseline", <ProdMovement diff={diffSchedule([], prodRows)} baselineMeta={null} currentMeta={{}} onOpenJob={noop} />],
  ["Prod / BaselineBar", <BaselineBar meta={prodBaselineMeta} stats={prodDiff.stats} onDiscard={noop} />],
  ["Prod / BaselineBar, nothing moved", <BaselineBar meta={prodBaselineMeta} stats={prodNoDiff.stats} onDiscard={noop} />],
  ["Prod / BaselineBar, no meta", <BaselineBar meta={null} stats={null} onDiscard={noop} />, { allowEmpty: true }],
  ["Prod / PieceDetail moved", <PieceDetail piece={prodRows.find((r) => prodDiff.byRow.get(r)?.kind === "later") || prodRows[0]} siblings={[]} move={prodDiff.byRow.get(prodRows.find((r) => prodDiff.byRow.get(r)?.kind === "later") || prodRows[0])} onClose={noop} onSelect={noop} />],
  ["Prod / CoverageNotice (windows miss)", <CoverageNotice coverage={prodCoverageMiss} />],
  ["Prod / CoverageNotice (none loaded)", <CoverageNotice coverage={ticketCoverage(prodRows, [])} />, { allowEmpty: true }],
  ["Prod / Pieces", <ProdPieces rows={prodRows} search="" />],
  ["Prod / DayDetail", <DayDetail date={prodDay} rows={prodRows.filter((r) => r.date === prodDay)} onClose={noop} />],
  ["Prod / Schedule no rows", <ProdSchedule rows={[]} plant="All" plants={["All"]} onPlant={noop} />],
  ["Prod / Overview no rows", <ProdOverview rows={[]} onOpenJob={noop} />],
  ["Prod / Beds no rows", <ProdBeds rows={[]} search="" />],
  ["Prod / DayDetail bed-activity only", <DayDetail date={prodDay} rows={prodRows.filter((r) => !r.isPour).slice(0, 3)} onClose={noop} />],
  ["Cost section", withApp(<CostModule tab="portfolio" />)],
  ["Cost section / codes", withApp(<CostModule tab="codes" />)],
  ["Cost section / engineering", withApp(<CostModule tab="engineering" />)],
  ["Cost section, nothing loaded", withApp(<CostModule tab="portfolio" />, appEmpty)],
  ["Time section", withApp(<TimeModule tab="overview" route={sourceRoute} />)],
  ["Time section / people", withApp(<TimeModule tab="people" route={sourceRoute} />)],
  ["Time section / jobs", withApp(<TimeModule tab="jobs" route={sourceRoute} />)],
  ["Time section / cumulative", withApp(<TimeModule tab="cumulative" route={sourceRoute} />)],
  ["Time / person route", withApp(<TimeModule tab="people" route={{ ...sourceRoute, rest: ["person", person] }} />)],
  ["Time / job route", withApp(<TimeModule tab="jobs" route={{ ...sourceRoute, rest: ["job", job] }} />)],
  ["Time section, nothing loaded", withApp(<TimeModule tab="overview" route={sourceRoute} />, appEmpty)],
  ["Production section", withApp(<ProductionModule tab="board" />)],
  ["Production / calendar", withApp(<ProductionModule tab="calendar" />)],
  ["Production / changes", withApp(<ProductionModule tab="changes" />)],
  ["Production section, nothing loaded", withApp(<ProductionModule tab="board" />, appEmpty)],
  ["JC / SourceDrop empty", <SourceDrop onSource={noop} />],
  ["JC / Portfolio", <JcPortfolio jobs={jcJobs} costs={jcCosts} onOpenJob={noop} />],
  ["JC / ScopeToggle", <ScopeToggle mine={jcMine} />],
  ["JC / ScopeToggle empty", <ScopeToggle mine={jcMineEmpty} />],
  ["JC / StarButton", <StarButton jobNo="50101" on onToggle={noop} />],
  ["JC / NoProjectsYet", <NoProjectsYet onShowAll={noop} />],
  ["JC / CostCodes", <JcCostCodes costs={jcCosts} jobs={jcJobs} search="" onOpenJob={noop} />],
  ["JC / JobDetail", <JcJobDetail job={jcJobs[0]} costs={jcCosts.filter((c) => c.jobKey === jcJobs[0].key)} quantities={jcQtyByJob.get(jcJobs[0].key) || []} production mine={jcMine} onBack={noop} onOpenProduction={noop} />],
  // A job forecast to a loss, and one with no contract at all — every margin
  // and progress figure divides by one of those.
  ["JC / JobDetail loss", <JcJobDetail job={jcLossJob} costs={jcCosts.filter((c) => c.jobKey === jcLossJob.key)} quantities={jcQtyByJob.get(jcLossJob.key) || []} production={false} onBack={noop} onOpenProduction={noop} />],
  ["JC / JobDetail zero contract", <JcJobDetail job={jcZeroJob} costs={jcCosts.filter((c) => c.jobKey === jcZeroJob.key)} quantities={[]} production={false} onBack={noop} onOpenProduction={noop} />],
  ["Projects / vs Schedule", <JcProductionLink jobs={jcJobs} qtyByJob={jcQtyByJob} production={jcJoinRows} onOpenJob={noop} />],
  ["Projects / vs Schedule, none loaded", <JcProductionLink jobs={jcJobs} qtyByJob={jcQtyByJob} production={[]} onOpenJob={noop} />],
  ["Projects / vs Schedule, no match", <JcProductionLink jobs={jcJobs} qtyByJob={jcQtyByJob} production={prodRows} onOpenJob={noop} />],
  ["JC / Engineering", <JcEngineering jobs={jcJobs} costs={jcCosts} quantities={jcQuantities} mine={jcMineEmpty} onOpenJob={noop} onScopeToMine={noop} />],
  ["JC / Engineering scoped", <JcEngineering jobs={jcJobs.filter((j) => jcMine.members.has(j.jobNo))} costs={jcCosts} quantities={jcQuantities} mine={jcMine} onOpenJob={noop} onScopeToMine={noop} />],
  ["JC / Engineering no D&E", <JcEngineering jobs={jcJobs} costs={[]} quantities={[]} mine={jcMineEmpty} onOpenJob={noop} onScopeToMine={noop} />],
  ["JC / Portfolio no jobs", <JcPortfolio jobs={[]} costs={[]} onOpenJob={noop} />],
  ["JC / CostCodes no costs", <JcCostCodes costs={[]} jobs={[]} search="" onOpenJob={noop} />],
  // The shell and the sections that read every source at once.
  ["Home", withApp(<HomeModule />)],
  ["Home, nothing loaded", withApp(<HomeModule />, appEmpty)],
  ["Sources", withApp(<SourcesModule />)],
  ["Sources, nothing loaded", withApp(<SourcesModule />, appEmpty)],
  ["Projects / All Jobs", withApp(<ProjectsModule tab="jobs" />)],
  ["Projects / Cost vs Schedule", withApp(<ProjectsModule tab="vs-schedule" />)],
  ["Projects, nothing loaded", withApp(<ProjectsModule tab="jobs" />, appEmpty)],
  ["Job page", withApp(<JobPage params={[prodFlagged[0].jobNo]} tab="summary" />)],
  ["Job page / full cost report", withApp(<JobPage params={[jcJobs[0].jobNo]} tab="cost" />)],
  ["Job page, cost only", withApp(<JobPage params={[jcJobs[0].jobNo]} tab="summary" />)],
  ["Job page, unknown job", withApp(<JobPage params={["00000"]} tab="summary" />)],
  ["Job page, nothing loaded", withApp(<JobPage params={["43134"]} tab="summary" />, appEmpty)],
  ["AppHeader", <AppHeader section="home" mine={prodMine} summary={sourceSummary(appLoaded)} />],
  ["AppHeader, nothing loaded", <AppHeader section="home" mine={jcMineEmpty} summary={sourceSummary(appEmpty)} />],
  ["PageHeader", <PageHeader title="T" subtitle="s" actions={<button className="btn">x</button>} />],
  ["RouteTabs", <RouteTabs section="production" tabs={tabsFor("production")} active="board" counts={{ beds: 3 }} />],
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

// The calendar must actually emit a full rectangular grid of day cells.
const calHtml = renderToString(<ProdSchedule rows={prodRows} plant="All" plants={prodPlants} onPlant={noop} />);
const dayCells = (calHtml.match(/min-height:92px/g) || []).length;
if (dayCells === 0 || dayCells % 7 !== 0) {
  failures++;
  console.log(`FAIL   calendar rendered a whole grid (got ${dayCells} cells)`);
} else {
  console.log(`  ok   calendar rendered a whole grid   ${dayCells} cells (${dayCells / 7} weeks)`);
}

// Charts in the production module must draw geometry too.
const prodChart = renderToString(<ProdOverview rows={prodRows} onOpenJob={noop} />);
const prodPaths = (prodChart.match(/<path/g) || []).length;
if (prodPaths < 10) {
  failures++;
  console.log(`FAIL   production charts drew geometry (paths=${prodPaths})`);
} else {
  console.log(`  ok   production charts drew geometry  ${prodPaths} paths`);
}

// The board must emit a real grid: one row per bed, cards that are buttons.
const boardHtml = renderToString(<PlanningBoard rows={prodRows} plant="All" plants={prodPlants} onPlant={noop} />);
const cards = (boardHtml.match(/class="pcard"/g) || []).length;
const wkCols = (boardHtml.match(/class="wk"/g) || []).length;
if (cards < 100 || wkCols === 0) {
  failures++;
  console.log(`FAIL   board rendered cards + week totals (cards=${cards}, wk cells=${wkCols})`);
} else {
  console.log(`  ok   board rendered its grid          ${cards} piece cards, ${wkCols} week-total cells`);
}

// The missing-ticket marker must actually reach the grid: a flagged card gets
// the .noticket class AND the words, because a color alone is not identity
// (CLAUDE.md §5) and the board is read by people who need it to be obvious.
const flaggedHtml = renderToString(
  <PlanningBoard rows={prodRows} plant="All" plants={prodPlants} onPlant={noop} tickets={prodTicketIdx} />
);
const flaggedCards = (flaggedHtml.match(/class="pcard noticket"/g) || []).length;
const flagChips = (flaggedHtml.match(/class="tflag"/g) || []).length;
const plainCards = (flaggedHtml.match(/class="pcard"/g) || []).length;
if (flaggedCards === 0 || flagChips < flaggedCards || plainCards === 0) {
  failures++;
  console.log(`FAIL   board flagged missing tickets (flagged=${flaggedCards}, chips=${flagChips}, plain=${plainCards})`);
} else {
  console.log(`  ok   board flagged missing tickets  ${flaggedCards} flagged, ${plainCards} not, ${flagChips} chips`);
}

// ...and an unflagged board must be genuinely unflagged, so the marker can't be
// something that renders on every card regardless.
const unflagged = renderToString(
  <PlanningBoard rows={prodRows} plant="All" plants={prodPlants} onPlant={noop} />
);
if (/noticket|tflag/.test(unflagged)) {
  failures++;
  console.log("FAIL   board without a ticket report flags nothing");
} else {
  console.log("  ok   board without tickets flags none");
}

// The movement chip must reach the card, and must NOT appear on a board with no
// baseline — a chip on every card would make "moved" meaningless.
// Only the grid counts: the footnote carries a legend of the same chips, and
// counting those would let a board that draws none still pass.
const gridOf = (html) => html.split("</table>")[0];
const movedHtml = renderToString(
  <PlanningBoard rows={prodRows} plant="All" plants={prodPlants} onPlant={noop} movement={prodDiff.byRow} />
);
const movedGrid = gridOf(movedHtml);
const upChips = (movedGrid.match(/class="mvchip up"/g) || []).length;
const backChips = (movedGrid.match(/class="mvchip back"/g) || []).length;
const newChips = (movedGrid.match(/class="mvchip new"/g) || []).length;
if (upChips + backChips === 0 || newChips === 0) {
  failures++;
  console.log(`FAIL   board drew movement chips (up=${upChips}, back=${backChips}, new=${newChips})`);
} else {
  console.log(`  ok   board drew movement chips     ${upChips} earlier, ${backChips} later, ${newChips} new`);
}

// A chip carries an arrow and a day count, so it survives being read without
// color — the board already spends color on the job and on missing tickets.
if (!/▲|▼/.test(movedGrid)) {
  failures++;
  console.log("FAIL   movement chips carry a direction glyph, not color alone");
} else {
  console.log("  ok   movement chips are not color-alone");
}

const noBaselineHtml = renderToString(
  <PlanningBoard rows={prodRows} plant="All" plants={prodPlants} onPlant={noop} />
);
if (/mvchip/.test(noBaselineHtml)) {
  failures++;
  console.log("FAIL   board with no baseline draws no movement chip");
} else {
  console.log("  ok   no baseline, no movement chips");
}

// An unchanged piece must not get a zero chip; only a real change earns space.
const calmHtml = renderToString(
  <PlanningBoard rows={prodRows} plant="All" plants={prodPlants} onPlant={noop} movement={prodNoDiff.byRow} />
);
const calmChips = (gridOf(calmHtml).match(/class="mvchip/g) || []).length;
if (calmChips > 0) {
  failures++;
  console.log(`FAIL   an unmoved piece draws no chip (${calmChips} in the grid)`);
} else {
  console.log("  ok   unmoved pieces draw no chip   legend still shown");
}

// The coverage notice is the one thing that must never be silent when the two
// reports don't line up — a quiet board would read as "everything is drawn".
const missHtml = renderToString(<CoverageNotice coverage={prodCoverageMiss} />);
if (!/notice red/.test(missHtml) || !/every piece is drawn/.test(missHtml)) {
  failures++;
  console.log(`FAIL   coverage notice warns on a window miss (${missHtml.slice(0, 90)})`);
} else {
  console.log("  ok   coverage notice warns loudly   on a date-window miss");
}

// The job cost grid must reproduce the report's sections and subtotals, and
// the join view must actually match a job rather than silently rendering none.
const jcDetail = renderToString(
  <JcJobDetail job={jcJobs[0]} costs={jcCosts.filter((c) => c.jobKey === jcJobs[0].key)}
               quantities={jcQtyByJob.get(jcJobs[0].key) || []} production onBack={noop} onOpenProduction={noop} />
);
const groupRows = (jcDetail.match(/class="grouprow"/g) || []).length;
const subtotals = (jcDetail.match(/class="subtotalrow"/g) || []).length;
if (groupRows < 4 || groupRows !== subtotals) {
  failures++;
  console.log(`FAIL   job cost grid drew its sections (groups=${groupRows}, subtotals=${subtotals})`);
} else {
  console.log(`  ok   job cost grid drew its sections  ${groupRows} sections, ${subtotals} subtotals`);
}

// Every section subtotal and the job total must now carry a completion bar,
// not just the detail lines.
const jcBars = (jcDetail.match(/class="minibar"/g) || []).length;
const jcLines = (jcDetail.match(/class="subtotalrow"/g) || []).length;
const jcDetailLines = jcCosts.filter((c) => c.jobKey === jcJobs[0].key).filter((c) => c.projCost > 0).length;
if (jcBars < jcDetailLines + jcLines + 1) {
  failures++;
  console.log(`FAIL   subtotals carry completion bars (bars=${jcBars}, lines=${jcDetailLines}, subtotals=${jcLines})`);
} else {
  console.log(`  ok   subtotals carry completion bars  ${jcBars} bars over ${jcLines} subtotals + total`);
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

// The unified table must carry both sides: a job the cost reports know and a
// job only the schedule knows appear in one list, with the absent side dashed
// rather than zeroed. That is the merge this section exists to perform.
{
  const costed = projRows.filter((r) => r.costed && !r.scheduled).length;
  const sched = projRows.filter((r) => r.scheduled && !r.costed).length;
  const both = projRows.filter((r) => r.scheduled && r.costed).length;
  if (costed + sched + both !== projRows.length || projRows.length <= Math.max(jcJobs.length, 1)) {
    failures++;
    console.log(`FAIL   projects merged both sources (cost-only=${costed}, sched-only=${sched}, both=${both}, rows=${projRows.length})`);
  } else {
    console.log(`  ok   projects merged both sources     ${projRows.length} jobs (${costed} cost-only, ${sched} schedule-only, ${both} both)`);
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

const jcJoin = renderToString(<JcProductionLink jobs={jcJobs} qtyByJob={jcQtyByJob} production={jcJoinRows} onOpenJob={noop} />);
if (!jcJoin.includes("50101") || jcJoin.includes("No job number appears in both")) {
  failures++;
  console.log("FAIL   cost/production join matched a job");
} else {
  console.log("  ok   cost/production join matched a job");
}

console.log(failures ? `\n${failures} FAILURE(S)\n` : `\nAll views rendered.\n`);
process.exit(failures ? 1 : 0);
