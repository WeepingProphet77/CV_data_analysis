/** Grouping and rollup helpers shared across modules. */

/** groupBy(rows, r => r.name) -> Map<key, row[]> (insertion ordered). */
export function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    const bucket = map.get(k);
    if (bucket) bucket.push(r);
    else map.set(k, [r]);
  }
  return map;
}

/** Sum a numeric field over rows. */
export function sumBy(rows, valueFn) {
  let total = 0;
  for (const r of rows) total += valueFn(r) || 0;
  return total;
}

/** Distinct values of a field, sorted, blanks dropped. */
export function distinct(rows, keyFn) {
  return [...new Set(rows.map(keyFn).filter((v) => v !== "" && v != null))].sort();
}

/**
 * Rollup to `{key, value}[]` sorted by value descending.
 * `extra(bucket)` may add per-group fields (headcount, distinct jobs, …).
 */
export function rollup(rows, keyFn, valueFn, extra) {
  const out = [];
  for (const [key, bucket] of groupBy(rows, keyFn)) {
    out.push({ key, value: sumBy(bucket, valueFn), rows: bucket, ...(extra?.(bucket) ?? {}) });
  }
  return out.sort((a, b) => b.value - a.value);
}

/**
 * Cumulative running total over time.
 *
 * Rows are bucketed by date, sorted, then accumulated. `domain` (an ordered
 * list of every date in the chart) makes series comparable: each series is
 * carried flat across dates where it has no activity, so lines don't jump
 * horizontally past each other.
 */
export function cumulativeSeries(rows, dateFn, valueFn, domain) {
  const byDate = new Map();
  for (const r of rows) {
    const d = dateFn(r);
    if (!d) continue;
    byDate.set(d, (byDate.get(d) || 0) + (valueFn(r) || 0));
  }
  const dates = domain?.length ? domain : [...byDate.keys()].sort();
  let running = 0;
  const points = [];
  for (const d of dates) {
    running += byDate.get(d) || 0;
    points.push({ x: d, y: running, step: byDate.get(d) || 0 });
  }
  return points;
}

/** The sorted union of every date present in `rows`. */
export function dateDomain(rows, dateFn) {
  return [...new Set(rows.map(dateFn).filter(Boolean))].sort();
}

/**
 * Keep the top `n` groups by value and fold the rest into one "Other" group.
 * The categorical palette has exactly 8 validated slots, so this is how a
 * chart stays inside it rather than inventing a 9th hue.
 */
export function topNWithOther(groups, n, label = "Other") {
  if (groups.length <= n) return { top: groups, other: null };
  const top = groups.slice(0, n);
  const rest = groups.slice(n);
  return {
    top,
    other: {
      key: label,
      value: rest.reduce((s, g) => s + g.value, 0),
      rows: rest.flatMap((g) => g.rows ?? []),
      memberCount: rest.length,
    },
  };
}
