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

/* -- Money -------------------------------------------------------------- */

/** Whole dollars with separators: 1234.56 -> "$1,235". Negatives keep the sign. */
export function money(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Math.round(Number(n));
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString();
}

/** Compact money for stat tiles: 7415439 -> "$7.4M", 12900 -> "$12.9K". */
export function moneyCompact(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Number(n);
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** A stored ratio (0.7752) as a percentage string. Not to be confused with
 *  pct(), which divides a part by a total. */
export function ratio(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return "—";
  return (Number(n) * 100).toFixed(digits) + "%";
}

/**
 * Cost per square foot: 71.0341 -> "$71.03/SF". Null means "no footage to
 * divide by", which is not the same as zero and must not render as "$0.00/SF".
 */
export function perSf(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${Number(n).toFixed(2)}/SF`;
}

/** Square feet, whole numbers with separators: 94717 -> "94,717 SF". */
export function sqft(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(Number(n)).toLocaleString()} SF`;
}
