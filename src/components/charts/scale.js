/** Axis math shared by the chart components. */

/** Round a range up to human-readable tick values (0 / 250 / 500 / …). */
export function niceTicks(min, max, target = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
    return { ticks: [0, Math.max(1, max || 1)], min: 0, max: Math.max(1, max || 1) };
  }
  const span = max - min;
  const rawStep = span / target;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  // Guard against float drift accumulating across many steps.
  for (let i = 0; lo + i * step <= hi + step * 1e-9; i++) ticks.push(+(lo + i * step).toFixed(10));
  return { ticks, min: lo, max: hi };
}

/** Evenly spaced sample of `values`, always keeping the first and last. */
export function sampleTicks(values, target = 6) {
  if (values.length <= target) return values.slice();
  const out = [];
  const stride = (values.length - 1) / (target - 1);
  for (let i = 0; i < target; i++) out.push(values[Math.round(i * stride)]);
  return [...new Set(out)];
}

/** Linear scale factory. */
export function linear(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}
