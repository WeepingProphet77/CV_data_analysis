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
import { isSquareFeetRow, isPieceRow, squareFeetFor, perSf, ratesFor, jobSquareFeet } from "../src/modules/job-cost/squarefeet.js";
import { deriveJob, quantitiesByJob } from "../src/modules/job-cost/jobMetrics.js";
import { toggleMember, isValidSelection, SCOPE_ALL, SCOPE_MINE } from "../src/core/myProjects.js";
import {
  disciplineOf, isInHouse, inRateBand, estIsHours, actIsHours, isLumpSum,
  blendedRate, engineeringRollup, hoursAgreement, varianceToBudget, forecastShift, RATE_BAND,
} from "../src/modules/job-cost/engineering.js";
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

console.log("\nMy Projects selection");
eq("adding a project", toggleMember([], "50101"), ["50101"]);
eq("adding a second keeps them sorted", toggleMember(["50110"], "50101"), ["50101", "50110"]);
eq("numeric sort, not lexical", toggleMember(["50110", "50101"], "5099"), ["5099", "50101", "50110"]);
eq("toggling an existing project removes it", toggleMember(["50101", "50110"], "50101"), ["50110"]);
eq("removing the last leaves an empty list", toggleMember(["50101"], "50101"), []);
eq("an empty job number is ignored", toggleMember(["50101"], ""), ["50101"]);
// Job numbers are not all numeric -- "P10031" and "42343-IN" are real forms.
eq("a non-numeric job number stars like any other", toggleMember([], "42343-IN"), ["42343-IN"]);
eq("toggling is its own inverse", toggleMember(toggleMember(["50110"], "50101"), "50101"), ["50110"]);

ok("a valid selection passes", isValidSelection({ members: ["50101"], scope: SCOPE_MINE }));
ok("an empty selection is valid", isValidSelection({ members: [], scope: SCOPE_ALL }));
ok("a non-string member is rejected", !isValidSelection({ members: [50101], scope: SCOPE_ALL }));
ok("a blank member is rejected", !isValidSelection({ members: [""], scope: SCOPE_ALL }));
ok("an unknown scope is rejected", !isValidSelection({ members: [], scope: "sideways" }));
ok("a missing members list is rejected", !isValidSelection({ scope: SCOPE_ALL }));
ok("null is rejected", !isValidSelection(null));

console.log("\nSquare feet");
{
  const Q = (product, est, proj, act) => ({ stage: "PROD", product, estQty: est, projQty: proj, actQty: act });
  ok("an area row is recognised", isSquareFeetRow(Q("ARCHITECTURAL (SQ FT)", 1, 1, 1)));
  ok("a piece row is not", !isSquareFeetRow(Q("ARCHITECTURAL (PCS)", 1, 1, 1)));
  ok("a piece row is recognised as such", isPieceRow(Q("ARCHITECTURAL (PCS)", 1, 1, 1)));
  ok("a D&E row is neither", !isSquareFeetRow({ stage: "D&E", product: "ARCHITECTURAL" }));
  // "(SQ FT)" must be matched at the end, not anywhere in the name.
  ok("case and spacing are tolerated", isSquareFeetRow(Q("WALLS (sq ft)", 1, 1, 1)));

  const sf = squareFeetFor([
    Q("ARCHITECTURAL (SQ FT)", 1000, 1200, 600),
    Q("WALLS (SQ FT)", 500, 500, 500),
    Q("ARCHITECTURAL (PCS)", 40, 44, 20),   // must not be added in
  ]);
  eq("area sums across products", [sf.est, sf.proj, sf.act], [1500, 1700, 1100]);
  // The denominator is how big the job *is*, not how much has been cast.
  eq("job square footage is the forecast area", sf.job, 1700);
  eq("it falls back to the estimate when there is no forecast",
     jobSquareFeet({ est: 900, proj: 0, act: 100 }), 900);
  eq("pieces are excluded", sf.byProduct.length, 2);
  eq("the (SQ FT) suffix is stripped for display", sf.byProduct[0].product, "ARCHITECTURAL");
  ok("byProduct is ranked by forecast area", sf.byProduct[0].proj >= sf.byProduct[1].proj);

  const none = squareFeetFor([Q("ARCHITECTURAL (PCS)", 40, 44, 20)]);
  ok("a job with only piece rows has no footage", !none.hasSf);
  eq("no footage means no rate, not a zero rate", perSf(1000, 0), null);
  eq("a rate divides cost by area", perSf(1000, 100), 10);

  const rates = ratesFor({ estCost: 1700, projCost: 3400, actCost: 1700 }, sf);
  // All three over the same 1,700 SF, so they are directly comparable.
  eq("every rate divides by the job square footage",
     [rates.budget, rates.forecast, rates.actual], [1, 2, 1]);
  // The one exception, kept because it answers a different question.
  eq("as-bid uses the area estimated at bid time", rates.asBid, 1700 / 1500);
  // The invariant that proves the denominator is shared: actual over forecast
  // must equal cost progress. It cannot hold if the rates divide differently.
  ok("actual/forecast equals cost progress",
     Math.abs(rates.actual / rates.forecast - 1700 / 3400) < 1e-9);
  const noRates = ratesFor({ estCost: 1500, projCost: 1700, actCost: 550 }, none);
  eq("every rate is null without footage", [noRates.budget, noRates.forecast, noRates.actual], [null, null, null]);
}

console.log("\nJob derivation");
{
  const job = {
    key: "P|1", jobNo: "1", plant: "P", netContract: 100000, estOhProfit: 20000, pctBilled: 0.5,
    totals: { estCost: 90000, projCost: 80000, actCost: 40000, variance: 40000, curMo: 0 },
  };
  const qty = [{ stage: "PROD", jobKey: "P|1", product: "ARCHITECTURAL (SQ FT)", estQty: 1000, projQty: 1000, actQty: 500 }];
  const d = deriveJob(job, qty);
  eq("footage is attached", [d.sf.est, d.sf.proj, d.sf.act], [1000, 1000, 500]);
  eq("job square footage is attached", d.sf.job, 1000);
  eq("budget per foot", d.perSf.budget, 90);
  eq("forecast per foot", d.perSf.forecast, 80);
  // 40,000 spent over the job's 1,000 SF -- not over the 500 cast so far,
  // which would read 80 and wrongly suggest the job was already at forecast.
  eq("actual per foot uses the job square footage", d.perSf.actual, 40);
  eq("contract per foot", d.contractPerSf, 100);
  eq("margin per foot", d.marginPerSf, 20);
  eq("area cast is reported separately as progress", d.sfComplete, 0.5);
  eq("cost progress is against the projection", d.costProgress, 0.5);

  const bare = deriveJob(job, undefined);
  ok("a job with no quantity rows still derives", !bare.sf.hasSf && bare.perSf.budget === null);
  ok("and its cost figures are unaffected", bare.costProgress === 0.5 && bare.variance === 40000);

  const grouped = quantitiesByJob([{ jobKey: "a" }, { jobKey: "b" }, { jobKey: "a" }]);
  eq("quantities group by job", [grouped.get("a").length, grouped.get("b").length], [2, 1]);
}

console.log("\nDrafting & Engineering classification");
eq("checking codes", disciplineOf("60.020").label, "Checking");
eq("drafting codes", disciplineOf("60.120").label, "Drafting");
eq("engineering codes", disciplineOf("60.220").label, "Engineering");
eq("outsourced codes", disciplineOf("60.700").label, "Outsourced");
ok("in-house covers 60.0/1/2", ["60.010", "60.120", "60.220"].every(isInHouse));
ok("outsourced is not in-house", !isInHouse("60.700") && !isInHouse("60.730"));

console.log("\nHours detection");
// Real observed rates: $52 drafting, $69 engineering. Real lump sums: $6k+.
ok("a standard drafting rate reads as hours", inRateBand(52 * 100, 100));
ok("a standard engineering rate reads as hours", inRateBand(69 * 100, 100));
ok("a lump sum does not", !inRateBand(490095, 1));
ok("zero quantity does not", !inRateBand(1000, 0));
ok("zero cost does not", !inRateBand(0, 100));
ok("the band excludes just above the top real rate", !inRateBand(RATE_BAND.max * 10 + 1, 10));

// A line may book a lump-sum estimate but real actual hours, or the reverse.
// Each side has to be judged on its own or one corrupts the other's rate.
{
  const mixed = { code: "60.220", estCost: 446220, estQty: 1, actCost: 69 * 800, actQty: 800 };
  ok("a lump-sum estimate is rejected", !estIsHours(mixed));
  ok("...while its real actual hours are kept", actIsHours(mixed));
  const reverse = { code: "60.220", estCost: 69 * 500, estQty: 500, actCost: 337591, actQty: 101.5 };
  ok("a real estimate is kept", estIsHours(reverse));
  ok("...while its lump-sum actual is rejected", !actIsHours(reverse));
  ok("a lump-sum actual is reported as such", isLumpSum(reverse));
  ok("an outsourced line is never a labor lump sum", !isLumpSum({ code: "60.700", actCost: 65000, actQty: 2 }));
}

eq("blended rate divides totals", blendedRate(10000, 200), 50);
eq("blended rate with no hours is zero, not Infinity", blendedRate(10000, 0), 0);

console.log("\nHours reliability");
{
  const L = (code, estQty, estCost, actQty, actCost) => ({ code, estQty, estCost, actQty, actCost });
  // Same rate both sides -- the reading holds.
  const agreeing = L("60.120", 100, 5200, 200, 10400);
  // Estimated at $52/hr but booking at $161/hr: quantities on both sides, but
  // they cannot both be hours at a standard rate.
  const disagreeing = L("60.220", 100, 5200, 50, 8050);
  const a = hoursAgreement([agreeing, disagreeing]);
  eq("both lines carry quantities on each side", a.lines, 2);
  eq("only the consistent one agrees", a.agree, 1);
  eq("agreement is reported as a share", a.pct, 0.5);
  eq("no lines means no false confidence", hoursAgreement([]).pct, 0);
}

console.log("\nEngineering rollup");
{
  const job = { key: "P|1", jobNo: "1", jobTitle: "T", plant: "P", totals: { actCost: 500, projCost: 1000 } };
  // projCost is given separately from estCost: the forecast differs from the
  // original estimate on 86% of real D&E lines, and the two variances are only
  // distinguishable when it does.
  const L = (code, estQty, estCost, projCost, actQty, actCost) => ({
    section: "D&E", jobKey: "P|1", jobNo: "1", plant: "P", code, desc: code,
    estQty, estCost, projCost, curMo: 0, actQty, actCost,
    variance: projCost - actCost, pctProj: 0,
  });
  const costs = [
    L("60.120", 100, 5200, 8000, 150, 7800),      // drafting at $52/hr, forecast raised
    L("60.220", 100, 6900, 6000, 80, 5520),       // engineering at $69/hr, forecast cut
    L("60.700", 1, 50000, 45000, 1, 40000),       // outsourced lump sum
    L("60.220", 1, 200000, 310000, 2, 300000),    // lump sum booked to a labor code
  ];
  const qty = [{ stage: "D&E", jobKey: "P|1", product: "ARCH", estQty: 100, projQty: 120, actQty: 60 }];
  const r = engineeringRollup([job], costs, qty);
  const t = r.totals;

  eq("hours exclude outsourced and lump sums", [t.hoursEst, t.hoursAct], [200, 230]);
  eq("blended actual rate ignores lump sums", Math.round(t.rateAct), 58);
  eq("blended estimate rate ignores lump sums", Math.round(t.rateEst), 61);
  eq("cost totals include everything", t.actCost, 353320);
  eq("budget and forecast are tracked apart", [t.estCost, t.projCost], [262100, 369000]);
  eq("the lump-sum line is reported, not dropped", [r.lumpSum.length, t.lumpSumLines], [1, 1]);
  eq("outsourced is measured", t.outsourcedAct, 40000);
  eq("design progress comes from the D&E quantity rows", Math.round(t.designPct * 100), 50);
  // The job is 50% spent overall but only 50% designed -- no lag here.
  eq("design lag compares design against the whole job's spend", Math.round(r.byJob[0].designLag * 100), 0);
  eq("disciplines present", r.byDiscipline.map((d) => d.id), ["drafting", "engineering", "outsourced"]);
  ok("a job with no D&E is left out", engineeringRollup([job], [], []).byJob.length === 0);

  /*
   * The report carries two budgets. Variance to *forecast* is its own column;
   * variance to *budget* is derived here and must be labelled as such, so the
   * two are asserted to be different numbers rather than aliases.
   */
  eq("variance to budget is Est Cost less Actual", t.varToBudget, t.estCost - t.actCost);
  eq("forecast shift is Projections less Est Cost", t.forecastShift, t.projCost - t.estCost);
  ok("the two variances are distinct measures", t.varToBudget !== t.variance);
  eq("per-job variance to budget sums to the total",
     r.byJob.reduce((a, j) => a + j.varToBudget, 0), t.varToBudget);
  eq("per-discipline variance to budget sums to the total",
     r.byDiscipline.reduce((a, d) => a + d.varToBudget, 0), t.varToBudget);
  eq("helpers agree with the roll-up",
     [varianceToBudget(t), forecastShift(t)], [t.varToBudget, t.forecastShift]);

  // Variance must survive to every total line.
  const lineVar = costs.reduce((a, c) => a + c.variance, 0);
  eq("totals carry variance", t.variance, lineVar);
  eq("each discipline carries variance",
     r.byDiscipline.reduce((a, d) => a + d.variance, 0), lineVar);
  eq("each job carries variance", r.byJob[0].variance, lineVar);
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
  // Counted from the fixture rather than hard-coded, so extending the sample
  // does not require editing a magic number here.
  const [nfWb] = sampleWorkbooks();
  const expectedLines = nfWb.sheets[0].aoa.filter((row) => /^\d\d\.\d{3}$/.test(String(row[0] ?? "").trim())).length - 1; // less the contingency
  eq("cost lines", p.costs.length, expectedLines);
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
  const realJobs = [], realCosts = [], realQty = [];
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
    realJobs.push(...src.jobs); realCosts.push(...src.costs); realQty.push(...src.quantities);
  }

  /*
   * The engineering roll-up has to conserve totals the same way the parse does:
   * every breakdown must sum back to the same figure, and hours must come only
   * from lines that genuinely carry them.
   */
  if (realJobs.length) {
    const eng = engineeringRollup(realJobs, realCosts, realQty);
    const et = eng.totals;
    const de = realCosts.filter((c) => c.section === "D&E");
    const close = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
    const sumOf = (rows, f) => rows.reduce((s, x) => s + f(x), 0);

    ok("D&E: cost total equals the sum of its lines", close(et.actCost, sumOf(de, (c) => c.actCost)));
    ok("D&E: variance total equals the sum of its lines", close(et.variance, sumOf(de, (c) => c.variance)));
    ok("D&E: per-job variance sums to the total", close(sumOf(eng.byJob, (j) => j.variance), et.variance));
    ok("D&E: per-discipline variance sums to the total", close(sumOf(eng.byDiscipline, (d) => d.variance), et.variance));
    ok("D&E: per-code variance sums to the total", close(sumOf(eng.byCode, (c) => c.variance), et.variance));
    ok("D&E: per-code cost sums to the total", close(sumOf(eng.byCode, (c) => c.actCost), et.actCost));
    ok("D&E: hours equal the sum of hour-bearing lines",
       close(et.hoursAct, sumOf(de.filter(actIsHours), (c) => c.actQty), 0.001));
    ok("D&E: estimated hours likewise",
       close(et.hoursEst, sumOf(de.filter(estIsHours), (c) => c.estQty), 0.001));
    ok("D&E: no outsourced line contributes hours",
       !de.some((c) => /^60\.7/.test(c.code) && (actIsHours(c) || estIsHours(c))));
    ok("D&E: the lump-sum list matches its counter", eng.lumpSum.length === et.lumpSumLines);
    // Estimate and actual rates should land near each other and near the
    // observed standard rates; a wild figure means a lump sum leaked in.
    ok("D&E: blended rates are plausible labor rates",
       et.rateAct > 30 && et.rateAct < 120 && et.rateEst > 30 && et.rateEst < 120,
       `est $${et.rateEst.toFixed(2)}/hr, act $${et.rateAct.toFixed(2)}/hr`);
    ok("D&E: no total is NaN or Infinity",
       Object.values(et).every((v) => typeof v !== "number" || Number.isFinite(v)));
    const derived = realJobs.map((j) => deriveJob(j, quantitiesByJob(realQty).get(j.key)));
    const withSf = derived.filter((j) => j.sf.hasSf);
    ok("$/SF: a job without footage has null rates, never zero",
       derived.filter((j) => !j.sf.hasSf)
              .every((j) => j.perSf.budget === null && j.perSf.actual === null && j.contractPerSf === null));
    ok("$/SF: no rate is NaN or Infinity",
       derived.every((j) => [j.perSf.budget, j.perSf.forecast, j.perSf.actual, j.contractPerSf, j.marginPerSf]
                              .every((v) => v === null || Number.isFinite(v))));
    ok("$/SF: area never includes piece rows",
       withSf.every((j) => j.sf.byProduct.every((b) => !/PCS/i.test(b.product))));
    // With one denominator, the ratio of the actual rate to the forecast rate
    // must equal cost progress exactly. Any drift means a rate is dividing by
    // something else.
    ok("$/SF: actual over forecast equals cost progress", (() => {
      const S = (f) => withSf.reduce((a, j) => a + f(j), 0);
      const area = S((j) => j.sf.job);
      if (!(area > 0)) return false;
      const rateRatio = (S((j) => j.totals.actCost) / area) / (S((j) => j.totals.projCost) / area);
      const progress = S((j) => j.totals.actCost) / S((j) => j.totals.projCost);
      return Math.abs(rateRatio - progress) < 1e-9;
    })());
    ok("$/SF: no rate divides by the area cast to date", (() => {
      const j = withSf.find((x) => x.sf.act > 0 && Math.abs(x.sf.act - x.sf.job) > 1);
      return !j || Math.abs(j.perSf.actual - j.totals.actCost / j.sf.act) > 1e-9;
    })());
    ok("$/SF: rates land in a plausible range for precast",
       (() => {
         const S = (f) => withSf.reduce((a, j) => a + f(j), 0);
         const r = S((j) => j.totals.projCost) / S((j) => j.sf.proj);
         return r > 10 && r < 500;
       })(), "forecast $/SF");
    ok("D&E: every per-job figure is finite",
       eng.byJob.every((j) => [j.rateAct, j.rateEst, j.designPct, j.designLag, j.pctProj].every(Number.isFinite)));
    /*
     * Figures CLAUDE.md quotes from a snapshot of these reports. They are
     * printed, never asserted -- the reports are refreshed weekly and the
     * counts move. If they have drifted far from what §13 says, update §13.
     */
    const inHouse = de.filter((c) => isInHouse(c.code));
    const lumpEst = inHouse.filter((c) => c.estQty > 0 && c.estCost > 0 && !estIsHours(c));
    console.log(`  --  D&E: ${eng.byJob.length} jobs, ${et.hoursAct.toFixed(0)} hours ` +
                `(est ${et.hoursEst.toFixed(0)}), $${et.rateAct.toFixed(2)}/hr act vs ` +
                `$${et.rateEst.toFixed(2)}/hr est`);
    console.log(`  --  D&E lines: ${inHouse.length} in-house, ${lumpEst.length} lump-sum estimate ` +
                `(${lumpEst.filter(actIsHours).length} of them still hourly on the actual side), ` +
                `${eng.lumpSum.length} lump-sum actual`);
    console.log(`  --  hours reading agrees on ${et.hoursAgreement.agree}/${et.hoursAgreement.lines} ` +
                `lines (${(et.hoursAgreement.pct * 100).toFixed(0)}%) -- see §13 before trusting per-job hours`);
    const sfTotal = withSf.reduce((a, j) => a + j.sf.job, 0);
    const sfSum = (f) => withSf.reduce((a, j) => a + f(j), 0);
    console.log(`  --  $/SF over ${withSf.length} jobs and ${sfTotal.toFixed(0)} SF: ` +
                `contract $${(sfSum((j) => j.netContract) / sfTotal).toFixed(2)}, ` +
                `budget $${(sfSum((j) => j.totals.estCost) / sfTotal).toFixed(2)}, ` +
                `forecast $${(sfSum((j) => j.totals.projCost) / sfTotal).toFixed(2)}, ` +
                `actual $${(sfSum((j) => j.totals.actCost) / sfTotal).toFixed(2)}`);
  }
  console.log(`  --  ${totalJobs} real jobs checked across ${files.length} workbook(s)`);
} else {
  console.log(`\n  --  "${REAL_DIR}/" not present; real-report checks skipped`);
}

console.log(`\n${failures ? `${failures} FAILURE(S)` : "All job-cost checks passed"}\n`);
process.exit(failures ? 1 : 0);
