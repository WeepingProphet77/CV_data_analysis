/**
 * Joining the Missing Piece Mark Ticket report to the production schedule.
 *
 * The two reports come from the same database but are pulled independently and
 * over independent date ranges, which is the trap this file exists to make
 * visible. In the exports profiled 2026-08-31 the schedule covered
 * 2026-08-01 → 2026-08-31 and the ticket report 2026-09-01 → 2026-09-30, so
 * only 5 of 213 flagged pieces were even on the board. A board showing no
 * warnings would have read as "every scheduled piece is drawn" when it actually
 * meant "the ticket report doesn't cover this month". `ticketCoverage` computes
 * that overlap so the UI can say which it is.
 *
 * Plain ESM, node-importable (CLAUDE.md §2).
 */
import { ticketKeyOf } from "./ticketParse.js";

export { ticketKeyOf };

/** Map of `jobNo|MARK` -> the ticket row, for an O(1) lookup per board cell. */
export function ticketIndex(ticketRows) {
  const map = new Map();
  for (const t of ticketRows || []) {
    // A duplicate key would mean the same piece listed twice; the real export
    // has none (213 rows, 213 distinct keys). Keep the first either way, so a
    // future duplicate can't make the count disagree with the flagged cards.
    if (!map.has(t.key)) map.set(t.key, t);
  }
  return map;
}

/** The ticket row for a scheduled piece, or undefined if it has its drawing. */
export const ticketFor = (index, row) =>
  row?.mark ? index.get(ticketKeyOf(row.jobNo, row.mark)) : undefined;

const span = (rows, pick) => {
  const vals = (rows || []).map(pick).filter(Boolean).sort();
  return { min: vals[0] || "", max: vals[vals.length - 1] || "" };
};

/**
 * How far the ticket report actually speaks to what is on the board.
 *
 * Returns the flagged count alongside *why* it might be low: dates that don't
 * overlap, and jobs the ticket report has never heard of. "0 flagged" is only
 * good news when `overlapDays > 0` and `jobsNotCovered` is empty.
 */
export function ticketCoverage(prodRows, ticketRows) {
  const prod = prodRows || [];
  const tickets = ticketRows || [];

  const index = ticketIndex(tickets);
  const flagged = prod.filter((r) => ticketFor(index, r));

  const prodRange = span(prod, (r) => r.date);
  const tickRange = span(tickets, (r) => r.date);

  // Overlap of the two windows, in days, inclusive.
  const lo = prodRange.min > tickRange.min ? prodRange.min : tickRange.min;
  const hi = prodRange.max < tickRange.max ? prodRange.max : tickRange.max;
  const overlapDays =
    prodRange.min && tickRange.min && lo <= hi
      ? Math.round((Date.parse(`${hi}T00:00:00Z`) - Date.parse(`${lo}T00:00:00Z`)) / 86400000) + 1
      : 0;

  const prodJobs = new Set(prod.map((r) => r.jobNo).filter(Boolean));
  const tickJobs = new Set(tickets.map((r) => r.jobNo).filter(Boolean));

  return {
    loaded: tickets.length > 0,
    tickets: tickets.length,
    // Scheduled *rows* carrying a flag. Pieces, not rows, is the figure a
    // scheduler reads, so both are given.
    flaggedRows: flagged.length,
    flaggedPieces: flagged.reduce((a, r) => a + (r.qty || 0), 0),
    prodRange,
    tickRange,
    overlapDays,
    overlap: { min: overlapDays ? lo : "", max: overlapDays ? hi : "" },
    /**
     * Ticket rows whose bed date actually falls inside the schedule's window.
     *
     * The date *ranges* can overlap on the strength of a single outlier — the
     * real report carries two pieces whose bed date is years past, which alone
     * stretched its range back over the whole schedule while every other row
     * sat in the following month. This counts rows rather than endpoints, so it
     * cannot be fooled that way, and it is what the UI should lead with.
     */
    ticketsInWindow: prodRange.min
      ? tickets.filter((t) => t.date && t.date >= prodRange.min && t.date <= prodRange.max).length
      : 0,
    // Ticket rows that name a job the schedule has, but that never matched a
    // scheduled piece — the drawing is missing for a piece not in this window.
    unscheduled: tickets.filter((t) => !prodJobs.has(t.jobNo)).length,
    jobsNotCovered: [...prodJobs].filter((j) => !tickJobs.has(j)),
    jobsCovered: [...prodJobs].filter((j) => tickJobs.has(j)),
  };
}

/** Missing tickets grouped by job, ordered worst-first. */
export function byJob(ticketRows) {
  const map = new Map();
  for (const t of ticketRows || []) {
    let g = map.get(t.jobNo);
    if (!g) {
      g = { jobNo: t.jobNo, jobTitle: t.jobTitle, group: t.group, plants: new Set(), rows: [], unassigned: 0 };
      map.set(t.jobNo, g);
    }
    g.rows.push(t);
    g.plants.add(t.plant);
    if (!t.drawnBy) g.unassigned++;
    if (!g.group && t.group) g.group = t.group;
  }
  return [...map.values()]
    .map((g) => ({
      ...g,
      plants: [...g.plants].sort(),
      pieces: g.rows.length,
      sf: g.rows.reduce((a, r) => a + (r.sf || 0), 0),
      range: span(g.rows, (r) => r.date),
    }))
    .sort((a, b) => b.pieces - a.pieces || a.jobNo.localeCompare(b.jobNo));
}

/**
 * Missing tickets grouped by whoever the report names in "Drawn By".
 *
 * A blank is not a person — it is a piece with no drafter assigned, which for
 * an engineering manager is a different and usually worse problem than one that
 * is assigned and late. It gets its own bucket rather than being dropped.
 */
export function byDrafter(ticketRows) {
  const map = new Map();
  for (const t of ticketRows || []) {
    const who = t.drawnBy || "";
    let g = map.get(who);
    if (!g) { g = { drawnBy: who, assigned: Boolean(who), rows: [] }; map.set(who, g); }
    g.rows.push(t);
  }
  return [...map.values()]
    .map((g) => ({
      ...g,
      pieces: g.rows.length,
      jobs: new Set(g.rows.map((r) => r.jobNo)).size,
      range: span(g.rows, (r) => r.date),
    }))
    // Unassigned first: it is the bucket that needs a decision, not a nudge.
    .sort((a, b) => Number(a.assigned) - Number(b.assigned) || b.pieces - a.pieces);
}

/**
 * Buckets by how soon the piece is due to be cast, against `today`.
 *
 * The report carries pieces whose bed date has already passed — two of them
 * sat in 2023 in the profiled export — and those are the most urgent thing on
 * it, not the least. They are surfaced as their own bucket rather than being
 * sorted to the bottom of a date list.
 */
export function urgency(ticketRows, today) {
  const day = 86400000;
  const now = Date.parse(`${today}T00:00:00Z`);
  const buckets = [
    { id: "past", label: "Bed date passed", rows: [] },
    { id: "week", label: "Within 7 days", rows: [] },
    { id: "month", label: "8–30 days", rows: [] },
    { id: "later", label: "More than 30 days", rows: [] },
    { id: "undated", label: "No bed date", rows: [] },
  ];
  const at = (id) => buckets.find((b) => b.id === id);
  for (const t of ticketRows || []) {
    if (!t.date) { at("undated").rows.push(t); continue; }
    const days = Math.round((Date.parse(`${t.date}T00:00:00Z`) - now) / day);
    at(days < 0 ? "past" : days <= 7 ? "week" : days <= 30 ? "month" : "later").rows.push(t);
  }
  return buckets.map((b) => ({ ...b, pieces: b.rows.length }));
}
