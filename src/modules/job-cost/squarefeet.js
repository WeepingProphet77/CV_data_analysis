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
  const out = { est: 0, proj: 0, act: 0, hasSf: rows.length > 0, byProduct: [] };
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
  return out;
}

/**
 * Cost per square foot, or null when there is no footage to divide by.
 *
 * Null rather than 0: a job with no square-feet rows has an *unknown* rate, not
 * a rate of zero, and the two must not look alike in a table.
 */
export const perSf = (cost, sf) => (sf > 0 ? cost / sf : null);

/**
 * The three rates for a set of cost totals and square feet.
 *
 * Each rate divides a cost by the footage from the *same* stage — budget cost
 * over estimated feet, forecast over forecast, actual over actual — so no rate
 * mixes a numerator and denominator that were measured at different times.
 *
 * `actual` is the one to read carefully: cost front-loads onto engineering and
 * materials before any panel is cast, so early in a job it runs high and only
 * converges on the forecast as production catches up. It is a rate achieved to
 * date, not a projection.
 */
export function ratesFor(totals, sf) {
  return {
    budget: perSf(totals.estCost, sf.est),
    forecast: perSf(totals.projCost, sf.proj),
    actual: perSf(totals.actCost, sf.act),
  };
}

/** Aggregate square feet across many jobs. */
export function totalSquareFeet(jobs) {
  return jobs.reduce(
    (t, j) => {
      const s = j.sf;
      if (!s?.hasSf) return t;
      return { est: t.est + s.est, proj: t.proj + s.proj, act: t.act + s.act, jobs: t.jobs + 1, hasSf: true };
    },
    { est: 0, proj: 0, act: 0, jobs: 0, hasSf: false }
  );
}
