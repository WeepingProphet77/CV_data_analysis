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
import ProdOverview from "../src/modules/production/views/Overview.jsx";
import ProdBeds from "../src/modules/production/views/Beds.jsx";
import ProdJobs from "../src/modules/production/views/Jobs.jsx";
import ProdPieces from "../src/modules/production/views/Pieces.jsx";
import DayDetail from "../src/modules/production/views/DayDetail.jsx";
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

const total = sumBy(rows, (r) => r.hrs);
const person = distinct(rows, (r) => r.name)[0];
const job = distinct(rows, (r) => r.job)[0];
const noop = () => {};

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

console.log(failures ? `\n${failures} FAILURE(S)\n` : `\nAll views rendered.\n`);
process.exit(failures ? 1 : 0);
