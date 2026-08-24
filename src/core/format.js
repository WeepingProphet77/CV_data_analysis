/** Number, date and label formatting shared by every module. */

/** Hours: always one decimal, thousands separated. 1234.5 -> "1,234.5" */
export function fmt(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Compact form for stat tiles: 1284 -> "1,284", 12900 -> "12.9K". */
export function compact(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (abs >= 10_000) return (n / 1_000).toFixed(1) + "K";
  return fmt(n, abs % 1 === 0 ? 0 : 1);
}

export function pct(part, total, digits = 1) {
  if (!total) return "0%";
  return ((part / total) * 100).toFixed(digits) + "%";
}

/** Integer count with thousands separators. */
export function count(n) {
  return (n ?? 0).toLocaleString();
}

/* -- Dates -------------------------------------------------------------- */

/** Parse an ISO 'YYYY-MM-DD' as *local* midnight (never UTC-shifted). */
export function isoToDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function dateToIso(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** ISO date of the Monday that starts the week containing `iso`. */
export function weekStart(iso) {
  const d = isoToDate(iso);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return dateToIso(d);
}

/** 'YYYY-MM' bucket key. */
export function monthKey(iso) {
  return String(iso).slice(0, 7);
}

/** Short axis label: '2026-03-14' -> 'Mar 14'. */
export function shortDate(iso) {
  const d = isoToDate(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Whole days between two ISO dates, inclusive of both ends. */
export function daysBetween(a, b) {
  return Math.round((isoToDate(b) - isoToDate(a)) / 86_400_000) + 1;
}
