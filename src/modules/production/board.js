/**
 * Column math for the planning board.
 *
 * Plain ESM, no JSX, so the test scripts can import it directly in node —
 * the same rule that put the calendar grid math in core/ (CLAUDE.md §2).
 */
import { dateToIso, isoToDate } from "../../core/format.js";

/**
 * Every calendar day from `from` to `to` inclusive.
 *
 * Contiguous on purpose: the export has no Sunday rows, and skipping them
 * would silently close the gap and misrepresent the week's shape.
 */
export function daySpan(from, to) {
  const out = [];
  const end = isoToDate(to);
  for (let d = isoToDate(from); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(dateToIso(new Date(d)));
  }
  return out;
}

/**
 * Day columns, with a week-total column closing out each Monday–Sunday week.
 * A range ending mid-week still gets a total for its trailing partial week.
 */
export function buildColumns(days) {
  const cols = [];
  let pending = [];
  days.forEach((iso, i) => {
    cols.push({ type: "day", iso });
    pending.push(iso);
    const isWeekEnd = isoToDate(iso).getDay() === 0;   // Sunday closes the week
    if (isWeekEnd || i === days.length - 1) {
      cols.push({ type: "week", days: pending });
      pending = [];
    }
  });
  return cols;
}
