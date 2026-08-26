/**
 * The derived fields every view expects on a job.
 *
 * Pure and node-importable on purpose: `useJobCostData` applies this, and so do
 * the test fixtures. Deriving it in the hook alone let the render fixtures build
 * jobs that were missing fields the views required — a drift that only showed up
 * as a crash. One function, one definition.
 */
import { squareFeetFor, ratesFor } from "./squarefeet.js";

const safeRatio = (a, b) => (b > 0 ? a / b : 0);

/** Decorate one parsed job with its progress, margin and $/SF figures. */
export function deriveJob(job, quantities) {
  const t = job.totals;
  const sf = squareFeetFor(quantities);
  return {
    ...job,
    sf,
    // Every $/SF rate divides by the *job's* square footage, so budget,
    // forecast and actual are directly comparable.
    perSf: ratesFor(t, sf),
    contractPerSf: sf.job > 0 ? job.netContract / sf.job : null,
    marginPerSf: sf.job > 0 ? job.estOhProfit / sf.job : null,
    // How much of the job's area has actually been cast — progress, kept
    // separate from the cost rates rather than buried in their denominator.
    sfComplete: sf.job > 0 ? sf.act / sf.job : null,
    // Cost progress is measured against the *projection*, not the estimate: the
    // estimate is what was bid, the projection is what the job is now expected
    // to cost, and progress against a stale bid reads as further along than it is.
    costProgress: safeRatio(t.actCost, t.projCost),
    variance: t.variance,
    overProjection: t.projCost > 0 && t.actCost > t.projCost,
    // A job billed well behind its cost is spending money it has not invoiced —
    // the cash question, distinct from the margin question.
    billedVsCost: job.pctBilled - safeRatio(t.actCost, t.projCost),
  };
}

/** Group quantity rows by job key, ready for deriveJob. */
export function quantitiesByJob(quantities) {
  const m = new Map();
  for (const q of quantities) {
    if (!m.has(q.jobKey)) m.set(q.jobKey, []);
    m.get(q.jobKey).push(q);
  }
  return m;
}
