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
import ProdJobs from "../src/modules/production/views/Jobs.jsx";
import ProdPieces from "../src/modules/production/views/Pieces.jsx";
import DayDetail from "../src/modules/production/views/DayDetail.jsx";
import JobCostModule from "../src/modules/job-cost/index.jsx";
import JcPortfolio from "../src/modules/job-cost/views/Portfolio.jsx";
import JcJobs from "../src/modules/job-cost/views/Jobs.jsx";
import JcJobDetail from "../src/modules/job-cost/views/JobDetail.jsx";
import JcCostCodes from "../src/modules/job-cost/views/CostCodes.jsx";
import JcProductionLink from "../src/modules/job-cost/views/ProductionLink.jsx";
import JcSourceLibrary, { SourceDrop } from "../src/modules/job-cost/views/SourceLibrary.jsx";
import { StarButton, ScopeToggle, NoProjectsYet } from "../src/modules/job-cost/views/MyProjects.jsx";
import { buildSource } from "../src/modules/job-cost/parse.js";
import { categoryOf } from "../src/modules/job-cost/categories.js";
import { sampleWorkbooks } from "./job-cost-sample.mjs";
import ScheduleModule from "../src/modules/schedule/index.jsx";
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

/*
 * Job cost fixtures. The sample workbooks are generated rather than read: a
 * Job Cost Report is a binary multi-sheet workbook, and no real one may be
 * committed (CLAUDE.md §1).
 */
const jcSources = sampleWorkbooks().map((wb) => buildSource(wb.sheets, { plant: wb.plant, fileName: wb.fileName }));
const jcJobs = jcSources.flatMap((s) => s.jobs).map((j) => ({
  ...j,
  costProgress: j.totals.projCost > 0 ? j.totals.actCost / j.totals.projCost : 0,
  overProjection: j.totals.projCost > 0 && j.totals.actCost > j.totals.projCost,
}));
const jcCosts = jcSources.flatMap((s) => s.costs).map((c) => ({ ...c, category: categoryOf(c.code).label }));
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


const cases = [
  // A module returns null until useDataset resolves, and effects never run
  // when server-rendering — so rendering nothing is correct here, not a fault.
  // allowEmpty says "must not throw" rather than "must produce output".
  ["App shell", <App />],
  ["Overview", <Overview rows={rows} onOpenProject={noop} />],
  ["People", <People rows={rows} total={total} search="" onOpenPerson={noop} />],
  ["Projects", <Projects rows={rows} total={total} search="" onOpenProject={noop} />],
  ["Cumulative", <Cumulative rows={rows} />],
  ["PersonDetail", <PersonDetail name={person} rows={rows} onBack={noop} onOpenProject={noop} />],
  ["ProjectDetail", <ProjectDetail job={job} rows={rows} onBack={noop} onOpenPerson={noop} />],
  ["Production module", <ProductionModule />, { allowEmpty: true }],
  ["Prod / Board", <PlanningBoard rows={prodRows} plant="All" plants={prodPlants} onPlant={noop} />],
  ["Prod / Board (1 plant)", <PlanningBoard rows={prodRows.filter((r) => r.plant === prodPlants[1])} plant={prodPlants[1]} plants={prodPlants} onPlant={noop} />],
  ["Prod / Board no rows", <PlanningBoard rows={[]} plant="All" plants={["All"]} onPlant={noop} />],
  ["Prod / PieceDetail", <PieceDetail piece={prodRows.find((r) => r.isPour)} siblings={prodRows.slice(0, 4)} onClose={noop} onSelect={noop} />],
  ["Prod / PieceDetail bed activity", <PieceDetail piece={prodRows.find((r) => !r.isPour)} siblings={[]} onClose={noop} onSelect={noop} />],
  ["Prod / Schedule", <ProdSchedule rows={prodRows} plant="All" plants={prodPlants} onPlant={noop} />],
  ["Prod / Schedule (1 plant)", <ProdSchedule rows={prodRows.filter((r) => r.plant === prodPlants[1])} plant={prodPlants[1]} plants={prodPlants} onPlant={noop} />],
  ["Prod / Charts", <ProdOverview rows={prodRows} onOpenJob={noop} />],
  ["Prod / Beds", <ProdBeds rows={prodRows} search="" />],
  ["Prod / Jobs", <ProdJobs rows={prodRows} search="" onOpenJob={noop} />],
  ["Prod / Pieces", <ProdPieces rows={prodRows} search="" />],
  ["Prod / DayDetail", <DayDetail date={prodDay} rows={prodRows.filter((r) => r.date === prodDay)} onClose={noop} />],
  ["Prod / Schedule no rows", <ProdSchedule rows={[]} plant="All" plants={["All"]} onPlant={noop} />],
  ["Prod / Charts no rows", <ProdOverview rows={[]} onOpenJob={noop} />],
  ["Prod / Beds no rows", <ProdBeds rows={[]} search="" />],
  ["Prod / DayDetail bed-activity only", <DayDetail date={prodDay} rows={prodRows.filter((r) => !r.isPour).slice(0, 3)} onClose={noop} />],
  ["Schedule (stub)", <ScheduleModule />],
  ["JobCost module", <JobCostModule />, { allowEmpty: true }],
  ["JC / SourceDrop empty", <SourceDrop onSource={noop} />],
  ["JC / SourceLibrary", <JcSourceLibrary sources={jcSources} data={jcData} onSource={noop} onRemove={noop} onClear={noop} persistWarning="" />],
  ["JC / Portfolio", <JcPortfolio jobs={jcJobs} costs={jcCosts} onOpenJob={noop} />],
  ["JC / Jobs", <JcJobs jobs={jcJobs} onOpenJob={noop} mine={jcMineEmpty} />],
  ["JC / Jobs starred", <JcJobs jobs={jcJobs} onOpenJob={noop} mine={jcMine} />],
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
  ["JC / vs Production", <JcProductionLink jobs={jcJobs} qtyByJob={jcQtyByJob} production={jcJoinRows} onOpenJob={noop} />],
  ["JC / vs Production, none loaded", <JcProductionLink jobs={jcJobs} qtyByJob={jcQtyByJob} production={[]} onOpenJob={noop} />],
  ["JC / vs Production, no match", <JcProductionLink jobs={jcJobs} qtyByJob={jcQtyByJob} production={prodRows} onOpenJob={noop} />],
  ["JC / Portfolio no jobs", <JcPortfolio jobs={[]} costs={[]} onOpenJob={noop} />],
  ["JC / Jobs no jobs", <JcJobs jobs={[]} onOpenJob={noop} mine={jcMineEmpty} />],
  ["JC / CostCodes no costs", <JcCostCodes costs={[]} jobs={[]} search="" onOpenJob={noop} />],
  ["JC / Jobs one job", <JcJobs jobs={[jcJobs[0]]} onOpenJob={noop} mine={jcMineEmpty} />],
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

// My Projects must actually isolate the data, not just re-label it.
const jcAllHtml = renderToString(<JcJobs jobs={jcJobs} onOpenJob={noop} mine={jcMineEmpty} />);
const jcMineHtml = renderToString(<JcJobs jobs={jcJobs.filter((j) => jcMine.members.has(j.jobNo))} onOpenJob={noop} mine={jcMine} />);
const rowsIn = (h) => (h.match(/<tr class="clickable"/g) || []).length;
if (!(rowsIn(jcMineHtml) === 1 && rowsIn(jcAllHtml) === jcJobs.length && rowsIn(jcAllHtml) > 1)) {
  failures++;
  console.log(`FAIL   My Projects narrows the table (all=${rowsIn(jcAllHtml)}, mine=${rowsIn(jcMineHtml)})`);
} else {
  console.log(`  ok   My Projects narrows the table    ${rowsIn(jcAllHtml)} jobs -> ${rowsIn(jcMineHtml)}`);
}
if (!jcMineHtml.includes("★") || !jcAllHtml.includes("☆")) {
  failures++;
  console.log("FAIL   star reflects membership");
} else {
  console.log("  ok   star reflects membership");
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
