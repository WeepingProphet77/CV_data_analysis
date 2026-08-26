/**
 * Square footage, and cost per square foot.
 *
 * $/SF is the figure the business is judged on, so it is derived here once and
 * shared by every view rather than recomputed per table.
 *
 * Square feet come from the PROD quantity rows whose product name ends in
 * "(SQ FT)" — the report tracks each product type separately (ARCHITECTURAL,
 * WALLS, DOUBLE TEES, …) and a job's footage is the sum across them. The
 * matching "(PCS)" rows are piece counts and must never be added in.
 *
 * Coverage is partial and that has to stay visible: 82 of the 126 profiled jobs
 * carry square feet, and **Monroeville carries none at all** (0 of 15). A job
 * without footage returns `hasSf: false` and every rate is null, so a view shows
 * a dash rather than a zero or an Infinity that would read as a real number.
 */

/** A PROD quantity row measuring area rather than pieces. */
export const isSquareFeetRow = (q) => q.stage === "PROD" && /\(SQ\s*FT\)\s*$/i.test(q.product || "");

/** A PROD quantity row counting pieces. */
export const isPieceRow = (q) => q.stage === "PROD" && !/\(SQ\s*FT\)/i.test(q.product || "");

/**
 * Square feet for one job's quantity rows, at each of the report's three
 * stages. `byProduct` keeps the split so a detail view can show it.
 */
export function squareFeetFor(quantities) {
  const rows = (quantities || []).filter(isSquareFeetRow);
  const out = { est: 0, proj: 0, act: 0, job: 0, hasSf: rows.length > 0, byProduct: [] };
  for (const q of rows) {
    out.est += q.estQty;
    out.proj += q.projQty;
    out.act += q.actQty;
    out.byProduct.push({
      product: (q.product || "").replace(/\s*\(SQ\s*FT\)\s*$/i, ""),
      est: q.estQty, proj: q.projQty, act: q.actQty,
    });
  }
  out.byProduct.sort((a, b) => b.proj - a.proj);
  out.job = jobSquareFeet(out);
  return out;
}

/**
 * The job's square footage — how big the job *is*, not how much of it has been
 * cast. This is the denominator for every $/SF rate.
 *
 * It is the forecast area (Projections Total), which is the current statement
 * of the job's scope, falling back to the estimate when a job carries no
 * forecast. Dividing by area *produced to date* instead would give a rate that
 * starts enormous and falls as production catches up, which cannot be compared
 * against a budget rate and is not what anyone means by "cost per square foot".
 */
export function jobSquareFeet(sf) {
  return sf.proj > 0 ? sf.proj : sf.est;
}

/**
 * Cost per square foot, or null when there is no footage to divide by.
 *
 * Null rather than 0: a job with no square-feet rows has an *unknown* rate, not
 * a rate of zero, and the two must not look alike in a table.
 */
export const perSf = (cost, sf) => (sf > 0 ? cost / sf : null);

/**
 * Cost per square foot, all three over the **same** denominator: the job's
 * square footage.
 *
 * A common denominator is the point. Budget, forecast and actual are then
 * directly comparable — "we bid $71/SF, we now expect $59/SF, we have spent
 * $44/SF so far" — and actual rises toward forecast as the job completes
 * instead of starting from a meaningless number.
 *
 * `asBid` is the exception and is kept because it answers a different question:
 * the rate at the time of bid, on the area estimated then. Where a job's scope
 * has moved it differs from `budget`, and that difference is worth seeing
 * rather than smoothing away.
 */
export function ratesFor(totals, sf) {
  const area = sf.job || jobSquareFeet(sf);
  return {
    budget: perSf(totals.estCost, area),
    forecast: perSf(totals.projCost, area),
    actual: perSf(totals.actCost, area),
    asBid: perSf(totals.estCost, sf.est),
  };
}

/** Aggregate square feet across many jobs. */
export function totalSquareFeet(jobs) {
  return jobs.reduce(
    (t, j) => {
      const s = j.sf;
      if (!s?.hasSf) return t;
      return {
        est: t.est + s.est, proj: t.proj + s.proj, act: t.act + s.act,
        job: t.job + (s.job || jobSquareFeet(s)),
        jobs: t.jobs + 1, hasSf: true,
      };
    },
    { est: 0, proj: 0, act: 0, job: 0, jobs: 0, hasSf: false }
  );
}
