/**
 * Job Cost data-layer checks.
 *
 * Runs against the synthetic workbooks always, and additionally against the
 * real reports in "weekly job costs/" when that folder happens to be present
 * (it is gitignored, so CI only ever sees the synthetic ones).
 *
 *   node scripts/job-cost-test.mjs
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseJobSheet, buildSource, plantFromFileName, splitJobTitle, asOfToIso, num,
} from "../src/modules/job-cost/parse.js";
import { categoryOf, categoryOptions, SECTIONS } from "../src/modules/job-cost/categories.js";
import { costPlantFor, productionPlantsFor, isUnmappedProductionPlant } from "../src/modules/job-cost/plants.js";
import { money, moneyCompact, ratio } from "../src/core/format.js";
import productionSchema from "../src/modules/production/schema.js";
import { sampleWorkbooks } from "./job-cost-sample.mjs";

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
const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

/* -- Coercion and header parsing ---------------------------------------- */

console.log("\nCoercion");
eq("plain number", num(1234.5), 1234.5);
eq("currency and separators", num("$1,234.50"), 1234.5);
eq("parenthesized negative", num("(1,234)"), -1234);
eq("blank is zero, never NaN", num(""), 0);
eq("unparseable is zero, never NaN", num("n/a"), 0);
eq("null is zero", num(null), 0);

console.log("\nHeader parsing");
eq("as-of to ISO", asOfToIso("As of 8/26/2026"), "2026-08-26");
eq("as-of two-digit year", asOfToIso("As of 8/6/26"), "2026-08-06");
eq("as-of unparseable is blank", asOfToIso("As of whenever"), "");
eq("job number and title split on the space run",
   splitJobTitle("43134   1401 CHURCH STREET MOTLEY T1"),
   { number: "43134", title: "1401 CHURCH STREET MOTLEY T1" });
// The dash inside an "-IN" companion job number must survive: splitting on a
// dash would halve it. (Name fabricated -- real job names stay out of the repo.)
eq("job number keeps its internal dash",
   splitJobTitle("42343-IN   LAKESIDE MEDICAL PAVILION (EX)"),
   { number: "42343-IN", title: "LAKESIDE MEDICAL PAVILION (EX)" });
eq("titleless job degrades to all number", splitJobTitle("91750"), { number: "91750", title: "" });

console.log("\nPlant naming");
eq("plant from filename", plantFromFileName("Ashland City Job Cost Report - Active Jobs.xlsx"), "Ashland City");
eq("plant from a bare filename", plantFromFileName("Kissimmee.xlsx"), "Kissimmee");
eq("CV structural plant rolls up", costPlantFor("Hillsboro Structural"), "Hillsboro");
eq("cost plant covers both CV plants", productionPlantsFor("Hillsboro"), ["Hillsboro", "Hillsboro Structural"]);
eq("unmapped CV plant returns itself", costPlantFor("Pearland"), "Pearland");
ok("unmapped plant is reported as such", isUnmappedProductionPlant("Pearland"));
ok("mapped plant is not", !isUnmappedProductionPlant("Kissimmee"));

console.log("\nCost-code taxonomy");
eq("materials prefix", categoryOf("20.100").label, "Materials");
eq("production labor prefix", categoryOf("30.060").label, "Production Labor");
eq("engineering prefix", categoryOf("60.120").label, "Engineering & Drafting");
eq("suffixed code still classifies", categoryOf("70.000A").label, "Work Orders");
eq("unknown prefix is labelled, not dropped", categoryOf("99.999").label, "Code 99xx");
ok("every category sits in a known section",
   categoryOptions().every((c) => SECTIONS.includes(c.section)));

console.log("\nMoney formatting");
eq("whole dollars", money(1234.56), "$1,235");
eq("negative money keeps the sign", money(-1234), "-$1,234");
eq("compact millions", moneyCompact(7415439.52), "$7.4M");
eq("compact thousands", moneyCompact(12900), "$12.9K");
eq("stored ratio to percent", ratio(0.7752), "77.5%");

console.log("\nProduction job-number split (the join key)");
{
  const d = (job) => productionSchema.derive({ job });
  eq("standard job name", [d("43134 - 1401 CHURCH STREET").jobNo, d("43134 - 1401 CHURCH STREET").jobTitle],
     ["43134", "1401 CHURCH STREET"]);
  // Two distinct admin jobs previously collapsed onto the job number "00".
  eq("dashed job number survives", d("00-006 - Jacksonville Admin/Stock Job").jobNo, "00-006");
  eq("a second dashed job stays distinct", d("00-009 - Pearland Admin/Stock Job").jobNo, "00-009");
  eq("phase-suffixed job number", d("45112P2 - SOMETHING").jobNo, "45112P2");
  eq("P-prefixed job number is not a suffix", d("P10031 - SOMETHING").jobNo, "P10031");
}

/* -- Structural parse ---------------------------------------------------- */

console.log("\nSheet structure");
{
  const [northfield] = sampleWorkbooks();
  const p = parseJobSheet(northfield.sheets[0].aoa, "50101");
  eq("job number", p.job.jobNo, "50101");
  eq("job title", p.job.jobTitle, "RIVERSIDE PARKING DECK");
  eq("as-of date", p.job.asOf, "2026-08-26");
  eq("net contract includes change orders", p.job.netContract, 4_120_000);
  eq("sections found", p.sections.map((s) => s.section), ["D&E", "PRODUCTION", "FIELD", "OTHER"]);
  eq("cost lines", p.costs.length, 10);
  eq("quantity rows kept apart from cost lines", p.quantities.length, 4);
  ok("quantity rows carry no cost", p.quantities.every((q) => q.estQty >= 0 && q.projQty >= 0));
  eq("quantity stage labels", [...new Set(p.quantities.map((q) => q.stageLabel))].sort(),
     ["Delivered", "Designed", "Produced"]);
  // "D&E TASK GROUP TOTAL" begins with a stage prefix; it must not be read as one.
  ok("section banner is not mistaken for a quantity row",
     !p.quantities.some((q) => q.product === "" || /TOTAL/.test(q.product)));
  ok("contingency captured", p.contingency !== null);
  eq("contingency code", p.contingency.code, "90.100");
  ok("contingency excluded from job totals",
     !p.costs.some((c) => c.code === "90.100"), "90.100 must not appear in the cost lines");
  eq("a sheet with no job header is skipped", parseJobSheet([[]], ""), null);
}

console.log("\nSource assembly");
{
  const [nf, eg] = sampleWorkbooks();
  const src = buildSource(nf.sheets, { plant: nf.plant, fileName: nf.fileName });
  eq("source id is the plant", src.id, "Northfield");
  eq("jobs assembled", src.jobs.length, 3);
  eq("source as-of is the latest sheet date", src.asOf, "2026-08-26");
  ok("every cost line is tagged with its job and plant",
     src.costs.every((c) => c.plant === "Northfield" && c.jobKey === `Northfield|${c.jobNo}`));
  ok("job keys are plant-scoped", src.jobs.every((j) => j.key === `Northfield|${j.jobNo}`));

  const other = buildSource(eg.sheets, { plant: eg.plant, fileName: eg.fileName });
  ok("the same job number at two plants keys apart",
     src.jobs[0].key !== other.jobs[0].key || src.jobs[0].jobNo !== other.jobs[0].jobNo);

  let threw = "";
  try { buildSource([{ name: "x", aoa: [[]] }], { plant: "P", fileName: "empty.xlsx" }); }
  catch (e) { threw = e.message; }
  ok("a workbook with no job sheets is rejected with a useful message",
     threw.includes("No job sheets") && threw.includes("empty.xlsx"), threw.slice(0, 60));
}

/* -- Reconciliation: the invariant that makes the numbers trustworthy ----- */

/**
 * A parsed job must reconcile against the report's own arithmetic:
 *   - cost lines sum to the Job Totals row, for every measure
 *   - Job Totals agree with the header block's Actual and Projected Cost
 *   - each section banner equals the sum of its own lines
 *     (except OTHER's Est Cost, which the report inflates by the contingency
 *      it prints below the totals -- see CLAUDE.md §13)
 *   - Est OH & Profit == Net Contract - Projected Cost
 */
function reconcile(label, sheets, plant, fileName) {
  const src = buildSource(sheets, { plant, fileName });
  let bad = 0;
  const fail = (m) => { bad++; if (bad <= 5) console.log(`        ${m}`); };

  for (const j of src.jobs) {
    const lines = src.costs.filter((c) => c.jobKey === j.key);
    for (const m of ["estCost", "projCost", "curMo", "actCost"]) {
      const sum = lines.reduce((t, c) => t + c[m], 0);
      if (!near(sum, j.totals[m])) fail(`${j.jobNo} ${m}: lines ${sum.toFixed(2)} vs totals ${j.totals[m].toFixed(2)}`);
    }
    if (!near(j.totals.actCost, j.actualCost)) fail(`${j.jobNo} actual cost disagrees with the header block`);
    if (!near(j.totals.projCost, j.projectedCost)) fail(`${j.jobNo} projected cost disagrees with the header block`);
    if (!near(j.estOhProfit, j.netContract - j.projectedCost)) fail(`${j.jobNo} Est OH & Profit is not contract - projected`);
    if (!near(j.netContract, j.originalContract + j.changeOrders)) fail(`${j.jobNo} net contract is not original + change orders`);

    for (const s of j.sections) {
      const own = lines.filter((c) => c.section === s.section);
      for (const m of ["projCost", "curMo", "actCost"]) {
        const sum = own.reduce((t, c) => t + c[m], 0);
        if (!near(sum, s[m])) fail(`${j.jobNo} [${s.section}] ${m}: lines ${sum.toFixed(2)} vs banner ${s[m].toFixed(2)}`);
      }
      const estSum = own.reduce((t, c) => t + c.estCost, 0);
      const expected = s.section === "OTHER" ? estSum + (j.contingency?.estCost || 0) : estSum;
      if (!near(expected, s.estCost)) fail(`${j.jobNo} [${s.section}] estCost: ${expected.toFixed(2)} vs banner ${s.estCost.toFixed(2)}`);
    }
  }
  ok(`${label}: ${src.jobs.length} jobs reconcile against the report's own totals`, bad === 0, bad ? `${bad} mismatches` : "");
  return src;
}

console.log("\nReconciliation — synthetic");
for (const wb of sampleWorkbooks()) reconcile(wb.plant, wb.sheets, wb.plant, wb.fileName);

/* -- The real reports, when they are present ----------------------------- */

const REAL_DIR = "weekly job costs";
if (existsSync(REAL_DIR)) {
  console.log("\nReconciliation — real reports");
  const XLSX = await import("xlsx");
  const files = readdirSync(REAL_DIR).filter((f) => /\.xlsx?$/i.test(f) && !f.startsWith("~$")).sort();
  if (!files.length) console.log("  --  no workbooks in the folder; skipped");
  let totalJobs = 0;
  for (const f of files) {
    const wb = XLSX.read(readFileSync(join(REAL_DIR, f)));
    const sheets = wb.SheetNames.map((n) => ({
      name: n,
      aoa: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true }),
    }));
    const plant = plantFromFileName(f);
    const src = reconcile(plant, sheets, plant, f);
    totalJobs += src.jobs.length;
    ok(`${plant}: every sheet became a job`, src.jobs.length === wb.SheetNames.length,
       `${src.jobs.length} of ${wb.SheetNames.length}`);
    ok(`${plant}: every cost line classifies into a known section`,
       src.costs.every((c) => SECTIONS.includes(c.section)));
    ok(`${plant}: no cost line is a quantity row in disguise`,
       !src.costs.some((c) => ["D&E", "PROD", "DELV"].includes(c.code)));
  }
  console.log(`  --  ${totalJobs} real jobs checked across ${files.length} workbook(s)`);
} else {
  console.log(`\n  --  "${REAL_DIR}/" not present; real-report checks skipped`);
}

console.log(`\n${failures ? `${failures} FAILURE(S)` : "All job-cost checks passed"}\n`);
process.exit(failures ? 1 : 0);
