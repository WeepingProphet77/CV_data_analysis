/** The measures every production view can be expressed in. */
export const METRICS = [
  { id: "pieces", label: "Pieces", unit: "pc", get: (r) => r.qty, digits: 0 },
  { id: "sf", label: "Square Feet", unit: "SF", get: (r) => r.sf, digits: 0 },
  { id: "cy", label: "Cubic Yards", unit: "CY", get: (r) => r.cy, digits: 1 },
  { id: "lf", label: "Linear Feet", unit: "LF", get: (r) => r.lf, digits: 0 },
];

export const findMetric = (id) => METRICS.find((m) => m.id === id) ?? METRICS[0];

/** Compact axis/cell text: 12,400 -> "12.4K". Pieces stay whole. */
export function metricShort(metric, v) {
  if (v == null) return "—";
  if (metric.id !== "pieces" && Math.abs(v) >= 10_000) return (v / 1000).toFixed(1) + "K";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: metric.digits,
    maximumFractionDigits: metric.digits,
  });
}
