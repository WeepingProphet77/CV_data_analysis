/**
 * Month-grid date math.
 *
 * Lives in core/ rather than beside the calendar component so it stays plain
 * ESM that node can import directly in the test scripts — see CLAUDE.md §2.
 */
import { dateToIso } from "./format.js";

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Every day in `month` ('YYYY-MM'), padded out to whole Sunday–Saturday weeks
 * so the grid is always rectangular.
 */
export function weeksOf(month) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());          // back to Sunday
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay()));        // on to Saturday

  const weeks = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 7)) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(cursor);
      day.setDate(cursor.getDate() + i);
      week.push(day);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Sorted 'YYYY-MM' keys present in a list of ISO dates. */
export function monthsIn(isoDates) {
  return [...new Set(isoDates.filter(Boolean).map((d) => d.slice(0, 7)))].sort();
}

export function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** ISO dates covered by a month grid, including its padding days. */
export const gridDates = (month) => weeksOf(month).flat().map(dateToIso);
