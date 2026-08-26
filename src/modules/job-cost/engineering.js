/**
 * Drafting & Engineering roll-up.
 *
 * Plain ESM so the test scripts can import it in node — no JSX, no React.
 *
 * Everything here works on the report's D&E section (the 60.x codes) plus the
 * D&E quantity rows, which track *pieces designed* through the same three
 * stages the production quantities use.
 */

import { perSf } from "./squarefeet.js";

/** Discipline for each D&E code, by its sub-prefix. */
export const DISCIPLINES = {
  checking: { id: "checking", label: "Checking", test: /^60\.0/ },
  drafting: { id: "drafting", label: "Drafting", test: /^60\.1/ },
  engineering: { id: "engineering", label: "Engineering", test: /^60\.2/ },
  outsourced: { id: "outsourced", label: "Outsourced", test: /^60\.7/ },
};

export const DISCIPLINE_ORDER = ["drafting", "engineering", "checking", "outsourced"];

export function disciplineOf(code) {
  for (const id of DISCIPLINE_ORDER) if (DISCIPLINES[id].test.test(code)) return DISCIPLINES[id];
  return { id: "other", label: "Other D&E", test: null };
}

/**
 * Hours.
 *
 * On in-house labor codes the report's Est/Act **Qty** columns are hours: the
 * implied cost-per-unit is quantized to a small set of standard rates ($52
 * drafting, $69 engineering, $16-52 checking) across all 126 profiled jobs. On
 * outsourced codes (60.7x) it is not -- those imply $6,000-$100,000 per unit
 * and are plainly a lump sum against a contract.
 *
 * Some in-house lines also book a lump sum to a labor code, and the estimate
 * and the actual do it independently: 41 lines carry a lump-sum *estimate*
 * (estQty of 1 against six figures) while booking real hours as *actual*, and
 * 14 others do the reverse. So each side is tested on its own -- a line can
 * contribute actual hours without contributing estimated hours.
 *
 * Getting this wrong is not cosmetic. Reading the estimate side uncritically
 * puts the estimated rate at $104/hr against a $59/hr actual, which invents a
 * rate problem; tested properly both sit near $59 and the real story is hours
 * over budget. Excluded lines are never dropped -- they are returned as
 * `lumpSum` and shown.
 *
 * The band is wide on purpose: real rates top out around $69 and the excluded
 * lines start above $220, so nothing sits near either boundary.
 */
export const RATE_BAND = { min: 10, max: 250 };

export const isInHouse = (code) => /^60\.[012]/.test(code);

/** True when this cost and quantity read as a plausible labor booking. */
export function inRateBand(cost, qty) {
  if (!(qty > 0) || !(cost > 0)) return false;
  const rate = cost / qty;
  return rate >= RATE_BAND.min && rate <= RATE_BAND.max;
}

export const estIsHours = (line) => isInHouse(line.code) && inRateBand(line.estCost, line.estQty);
export const actIsHours = (line) => isInHouse(line.code) && inRateBand(line.actCost, line.actQty);

/** An in-house line whose booked cost cannot be tied to hours. */
export const isLumpSum = (line) =>
  isInHouse(line.code) && line.actCost > 0 && !actIsHours(line);

const SUM_KEYS = ["estCost", "projCost", "curMo", "actCost", "variance"];

/**
 * The report carries two budgets and only computes variance against one.
 *
 *   Est Cost (col D)          the original estimate
 *   Projections Total (col E) the current forecast — differs from Est Cost on
 *                             86% of D&E lines, revised up on 157 and down on 98
 *   Act Cost (col I)          booked to date
 *   Variance (col K)          Projections Total − Act Cost   <- the report's own
 *
 * Variance against the *original estimate* is not a column; it is derived here
 * and labelled as derived wherever it is shown, so it is never mistaken for a
 * figure the report states. `forecastShift` is how far the forecast has moved
 * off the estimate, which is the budget story the report never totals.
 */
export const varianceToBudget = (t) => t.estCost - t.actCost;
export const forecastShift = (t) => t.projCost - t.estCost;

const emptyTotals = () => {
  const t = {
    hoursEst: 0, hoursAct: 0,
    // Cost of *only* the lines whose hours count, so a rate is never total D&E
    // cost over in-house hours -- that would divide outsourced lump sums by
    // drafting hours. Estimate and actual are tracked apart because a line can
    // qualify on one side and not the other.
    hourlyEstCost: 0, hourlyActCost: 0,
    lumpSumCost: 0, lumpSumLines: 0,
  };
  for (const k of SUM_KEYS) t[k] = 0;
  return t;
};

function addLine(t, line) {
  for (const k of SUM_KEYS) t[k] += line[k];
  if (estIsHours(line)) { t.hoursEst += line.estQty; t.hourlyEstCost += line.estCost; }
  if (actIsHours(line)) { t.hoursAct += line.actQty; t.hourlyActCost += line.actCost; }
  if (isLumpSum(line)) { t.lumpSumCost += line.actCost; t.lumpSumLines += 1; }
  return t;
}

/** Blended rate. Computed from the totals, never averaged from per-line rates. */
export const blendedRate = (cost, hours) => (hours > 0 ? cost / hours : 0);

const safeRatio = (a, b) => (b > 0 ? a / b : 0);

/**
 * The whole D&E picture for a set of jobs.
 *
 * `costs` and `quantities` may cover more jobs than `jobs` does — they are
 * filtered to the given jobs here, so a caller can always pass the full set.
 */
/**
 * How far the "Qty is hours" reading can be trusted.
 *
 * On a line carrying quantities on both sides, the estimated and actual rates
 * should be close if both really are hours at a standard rate. Across the real
 * reports only about half agree within 15%, so the figure is shown alongside
 * the hours rather than left for the reader to discover.
 */
export function hoursAgreement(lines, tolerance = 0.15) {
  const both = lines.filter((l) => estIsHours(l) && actIsHours(l));
  const agree = both.filter((l) => {
    const est = l.estCost / l.estQty;
    const act = l.actCost / l.actQty;
    return est > 0 && Math.abs(est - act) / est <= tolerance;
  });
  return { lines: both.length, agree: agree.length, pct: both.length ? agree.length / both.length : 0 };
}

export function engineeringRollup(jobs, costs, quantities) {
  const jobKeys = new Set(jobs.map((j) => j.key));
  const deLines = costs.filter((c) => c.section === "D&E" && jobKeys.has(c.jobKey));
  const deQty = quantities.filter((q) => q.stage === "D&E" && jobKeys.has(q.jobKey));

  const linesByJob = new Map();
  for (const c of deLines) {
    if (!linesByJob.has(c.jobKey)) linesByJob.set(c.jobKey, []);
    linesByJob.get(c.jobKey).push(c);
  }
  const qtyByJob = new Map();
  for (const q of deQty) {
    if (!qtyByJob.has(q.jobKey)) qtyByJob.set(q.jobKey, []);
    qtyByJob.get(q.jobKey).push(q);
  }

  const byJob = [];
  for (const j of jobs) {
    const lines = linesByJob.get(j.key) || [];
    const qty = qtyByJob.get(j.key) || [];
    if (!lines.length && !qty.length) continue; // this job has no D&E at all

    const t = lines.reduce(addLine, emptyTotals());
    const outsourced = lines.filter((l) => disciplineOf(l.code).id === "outsourced")
      .reduce((s, l) => s + l.actCost, 0);
    const rework = lines.filter((l) => /REWORK/i.test(l.desc))
      .reduce((s, l) => s + l.actCost, 0);

    const piecesEst = qty.reduce((s, q) => s + q.estQty, 0);
    const piecesProj = qty.reduce((s, q) => s + q.projQty, 0);
    const piecesAct = qty.reduce((s, q) => s + q.actQty, 0);
    const designPct = safeRatio(piecesAct, piecesProj);
    const costPct = safeRatio(t.actCost, t.projCost);
    // The job's overall spend, for the comparison that matters most to
    // engineering: is design keeping ahead of the money going out the door?
    const jobPct = safeRatio(j.totals.actCost, j.totals.projCost);

    byJob.push({
      key: j.key, jobNo: j.jobNo, jobTitle: j.jobTitle, plant: j.plant,
      estCost: t.estCost, projCost: t.projCost, actCost: t.actCost,
      curMo: t.curMo, variance: t.variance,
      varToBudget: varianceToBudget(t),
      forecastShift: forecastShift(t),
      pctBudget: safeRatio(t.actCost, t.estCost),
      overBudget: t.estCost > 0 && t.actCost > t.estCost,
      pctProj: costPct,
      hoursEst: t.hoursEst, hoursAct: t.hoursAct,
      hoursVariance: t.hoursEst - t.hoursAct,
      rateEst: blendedRate(t.hourlyEstCost, t.hoursEst),
      rateAct: blendedRate(t.hourlyActCost, t.hoursAct),
      hourlyActCost: t.hourlyActCost,
      lumpSumCost: t.lumpSumCost, lumpSumLines: t.lumpSumLines,
      outsourced, outsourcedShare: safeRatio(outsourced, t.actCost),
      rework,
      piecesEst, piecesProj, piecesAct, designPct, hasPieces: piecesProj > 0,
      // Engineering cost per square foot -- the same denominator the business
      // is judged on, applied to the D&E slice. Null when the job reports none.
      sf: j.sf || { est: 0, proj: 0, act: 0, hasSf: false },
      perSfBudget: perSf(t.estCost, j.sf?.est),
      perSfForecast: perSf(t.projCost, j.sf?.proj),
      perSfActual: perSf(t.actCost, j.sf?.act),
      jobPct,
      // Design trailing the job's overall spend by more than 10 points is the
      // signal an engineering lead wants surfaced, not buried in a column.
      designLag: piecesProj > 0 ? jobPct - designPct : 0,
      jobProjCost: j.totals.projCost,
      jobActCost: j.totals.actCost,
      overProjection: t.projCost > 0 && t.actCost > t.projCost,
    });
  }

  const totals = deLines.reduce(addLine, emptyTotals());
  const piecesEst = deQty.reduce((s, q) => s + q.estQty, 0);
  const piecesProj = deQty.reduce((s, q) => s + q.projQty, 0);
  const piecesAct = deQty.reduce((s, q) => s + q.actQty, 0);
  const outsourcedAct = deLines.filter((l) => disciplineOf(l.code).id === "outsourced")
    .reduce((s, l) => s + l.actCost, 0);

  const byDiscipline = DISCIPLINE_ORDER
    .map((id) => {
      const lines = deLines.filter((l) => disciplineOf(l.code).id === id);
      const t = lines.reduce(addLine, emptyTotals());
      return {
        id, label: DISCIPLINES[id].label, lines: lines.length,
        estCost: t.estCost, projCost: t.projCost, actCost: t.actCost, variance: t.variance,
        varToBudget: varianceToBudget(t), forecastShift: forecastShift(t),
        pctBudget: safeRatio(t.actCost, t.estCost),
        hoursEst: t.hoursEst, hoursAct: t.hoursAct,
        rateEst: blendedRate(t.hourlyEstCost, t.hoursEst),
        rateAct: blendedRate(t.hourlyActCost, t.hoursAct),
        pctProj: safeRatio(t.actCost, t.projCost),
      };
    })
    .filter((d) => d.lines > 0);

  // Keyed on code AND description: the same number carries different work at
  // different plants, exactly as in the Cost Codes view.
  const codeMap = new Map();
  for (const l of deLines) {
    const key = `${l.code}|${l.desc}`;
    let r = codeMap.get(key);
    if (!r) {
      r = {
        key, code: l.code, desc: l.desc, discipline: disciplineOf(l.code).label,
        jobs: 0, hourly: isInHouse(l.code), ...emptyTotals(),
      };
      codeMap.set(key, r);
    }
    addLine(r, l);
    r.jobs += 1;
  }
  const byCode = [...codeMap.values()]
    .map((r) => ({
      ...r,
      pctProj: safeRatio(r.actCost, r.projCost),
      varToBudget: varianceToBudget(r),
      forecastShift: forecastShift(r),
      rateEst: blendedRate(r.hourlyEstCost, r.hoursEst),
      rateAct: blendedRate(r.hourlyActCost, r.hoursAct),
    }))
    .sort((a, b) => b.actCost - a.actCost);

  const lumpSum = deLines.filter(isLumpSum).sort((a, b) => b.actCost - a.actCost);

  return {
    byJob: byJob.sort((a, b) => b.actCost - a.actCost),
    byDiscipline,
    byCode,
    lumpSum,
    lines: deLines,
    totals: {
      estCost: totals.estCost, projCost: totals.projCost, actCost: totals.actCost,
      curMo: totals.curMo, variance: totals.variance,
      varToBudget: varianceToBudget(totals),
      forecastShift: forecastShift(totals),
      pctProj: safeRatio(totals.actCost, totals.projCost),
      pctBudget: safeRatio(totals.actCost, totals.estCost),
      hoursEst: totals.hoursEst, hoursAct: totals.hoursAct,
      hoursVariance: totals.hoursEst - totals.hoursAct,
      rateEst: blendedRate(totals.hourlyEstCost, totals.hoursEst),
      rateAct: blendedRate(totals.hourlyActCost, totals.hoursAct),
      hourlyEstCost: totals.hourlyEstCost, hourlyActCost: totals.hourlyActCost,
      lumpSumCost: totals.lumpSumCost, lumpSumLines: totals.lumpSumLines,
      piecesEst, piecesProj, piecesAct,
      designPct: safeRatio(piecesAct, piecesProj),
      outsourcedAct, outsourcedShare: safeRatio(outsourcedAct, totals.actCost),
      rework: deLines.filter((l) => /REWORK/i.test(l.desc)).reduce((s, l) => s + l.actCost, 0),
      jobs: byJob.length,
      jobsWithPieces: byJob.filter((j) => j.hasPieces).length,
      ...(() => {
        // $/SF is computed over only the jobs that report footage, so the rate
        // is not diluted by jobs (all of Monroeville) that report none.
        const withSf = jobs.filter((j) => j.sf?.hasSf && linesByJob.has(j.key));
        const area = withSf.reduce(
          (a, j) => ({ est: a.est + j.sf.est, proj: a.proj + j.sf.proj, act: a.act + j.sf.act }),
          { est: 0, proj: 0, act: 0 }
        );
        const cost = withSf.reduce(
          (a, j) => {
            const t = (linesByJob.get(j.key) || []).reduce(addLine, emptyTotals());
            return { est: a.est + t.estCost, proj: a.proj + t.projCost, act: a.act + t.actCost };
          },
          { est: 0, proj: 0, act: 0 }
        );
        return {
          sfJobs: withSf.length,
          sfArea: area,
          perSfBudget: perSf(cost.est, area.est),
          perSfForecast: perSf(cost.proj, area.proj),
          perSfActual: perSf(cost.act, area.act),
        };
      })(),
      hoursAgreement: hoursAgreement(deLines),
    },
  };
}
