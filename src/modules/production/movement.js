/**
 * Schedule movement — what changed between the previous upload and this one.
 *
 * When a new Scheduled Production Report replaces the one already loaded, the
 * old dates are kept as a snapshot and every piece is compared against it: did
 * it move up, move back, appear, or disappear.
 *
 * ## The hard part: this export has no piece id
 *
 * Profiled 2026-08-31 against the real 4,358-row export. **Nothing in it is
 * unique per row** — not `Cast No.` (2,347 distinct of 4,358), not
 * `CTRL Num` (1,343, and blank on 781 rows), not `Pour No.` (1,171), not even
 * `Cast No.` and `CTRL Num` together (4,328). `Plant|Bed|Date|Pos` reaches
 * 3,890 and still collides. So a row-level join across two uploads is not
 * available at any price, and the stability of those identifiers across pulls
 * cannot even be tested — there is nothing to test it against.
 *
 * What the export does support is a *piece* key: **job number + piece mark**.
 * 1,669 such groups, and **1,412 of them (85%) hold exactly one instance**, so
 * for the large majority the comparison is exact and unambiguous. The job
 * number is required in the key because 45 marks are used by more than one job.
 * No group spans more than one plant.
 *
 * ## Repeated marks, and why instances are aligned rather than paired off
 *
 * The remaining 257 groups hold the same mark scheduled several times (up to 99
 * for one mark), which is a piece *type* cast repeatedly, not one piece. Those
 * instances carry no id to match on either, so they are matched by date:
 * `alignInstances` finds the order-preserving pairing that **minimises total
 * movement**, leaving the surplus on either side as added or removed.
 *
 * Minimising is the honest choice, and it differs from the obvious shortcut —
 * pair by rank, truncate the longer side — precisely where instances were added
 * or removed. Given old [Aug 3, Aug 10, Aug 20] and new [Aug 10], rank pairing
 * reports the piece sliding 7 days later; the alignment matches Aug 10 to
 * Aug 10, reports nothing as moved, and reports the other two as dropped, which
 * is what the dates actually say. Where the counts are equal the pairing is
 * forced and both approaches agree.
 *
 * Matches are maximised before movement is minimised, so a piece is assumed to
 * persist and slide rather than to vanish and be replaced. That is the right
 * default for a schedule, where the piece list is stable and the dates are what
 * move. It does mean a genuine swap reads as a large move — unavoidable without
 * a piece id, and the reason `alignInstances` is documented rather than buried.
 *
 * Plain ESM, node-importable (CLAUDE.md §2).
 */
import { isoToDate } from "../../core/format.js";

const DAY = 86_400_000;

/** Signed whole days from `a` to `b`. Negative = earlier. */
export const dayDelta = (a, b) => Math.round((isoToDate(b) - isoToDate(a)) / DAY);

/** The piece key. Job number *and* mark: 45 marks are shared across jobs. */
export const pieceKeyOf = (jobNo, mark) =>
  `${String(jobNo ?? "").trim()}|${String(mark ?? "").trim().toUpperCase()}`;

/**
 * The compact form kept as the baseline.
 *
 * Only what the comparison and its report need — a full copy of the previous
 * rows would double the stored dataset for no gain. Rows with no piece mark are
 * dropped here: those are bed activity (mold builds, maintenance), not pieces,
 * and they carry nothing to track across uploads.
 */
export function snapshotOf(rows) {
  return (rows || [])
    .filter((r) => r.mark && r.date)
    .map((r) => ({
      jobNo: r.jobNo || "",
      job: r.job || "",
      mark: r.mark,
      date: r.date,
      plant: r.plant || "",
      bed: r.bed || "",
      qty: r.qty || 0,
    }));
}

/**
 * Order-preserving minimum-movement matching between two date-sorted instance
 * lists of the same piece.
 *
 * Returns { pairs: [[prevIdx, nextIdx]], prevOnly: [idx], nextOnly: [idx] }.
 *
 * Both lists are sorted, so the number of pairs is always min(n, m); the DP
 * chooses *which* instances to leave out so the total absolute movement is as
 * small as the dates allow. O(n·m), and the largest group in the real export is
 * 99 instances, so the worst case is a few thousand cells for one mark.
 */
export function alignInstances(prevDates, nextDates) {
  const n = prevDates.length;
  const m = nextDates.length;

  // dp[i][j] = { matches, cost } for prev[0..i) against next[0..j).
  const dp = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => ({ matches: 0, cost: 0, from: null }))
  );

  // More matches always wins; among equal counts, less total movement wins.
  const better = (a, b) =>
    a.matches !== b.matches ? a.matches > b.matches : a.cost < b.cost;

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      if (!i && !j) continue;
      let best = { matches: -1, cost: Infinity, from: null };
      if (i) {
        const c = { ...dp[i - 1][j], from: "skipPrev" };
        if (better(c, best)) best = c;
      }
      if (j) {
        const c = { ...dp[i][j - 1], from: "skipNext" };
        if (better(c, best)) best = c;
      }
      if (i && j) {
        const prev = dp[i - 1][j - 1];
        const c = {
          matches: prev.matches + 1,
          cost: prev.cost + Math.abs(dayDelta(prevDates[i - 1], nextDates[j - 1])),
          from: "match",
        };
        if (better(c, best)) best = c;
      }
      dp[i][j] = best;
    }
  }

  const pairs = [];
  const prevOnly = [];
  const nextOnly = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const step = dp[i][j].from;
    if (step === "match") { pairs.push([i - 1, j - 1]); i--; j--; }
    else if (step === "skipPrev") { prevOnly.push(--i); }
    else { nextOnly.push(--j); }
  }
  pairs.reverse(); prevOnly.reverse(); nextOnly.reverse();
  return { pairs, prevOnly, nextOnly };
}

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/**
 * diffSchedule(baselineRows, currentRows) -> the movement report.
 *
 * `byRow` is keyed by the **current row object itself**, not by a synthetic
 * string. Within a repeated mark the instances are told apart only by their
 * position in the alignment, so any string key would have to encode that
 * position and would break the moment two instances shared a date. The board
 * and the report both read from the same `rows` array in the same render pass,
 * so object identity is exactly the right key and costs no lookup.
 */
export function diffSchedule(baselineRows, currentRows) {
  const empty = {
    ready: false, moved: [], added: [], removed: [], unchanged: 0,
    byRow: new Map(), earlier: 0, later: 0, stats: null,
  };
  if (!baselineRows?.length || !currentRows?.length) return empty;

  const group = (rows, pick) => {
    const m = new Map();
    for (const r of rows) {
      if (!r.mark || !r.date) continue;
      const k = pieceKeyOf(pick(r), r.mark);
      const b = m.get(k);
      if (b) b.push(r); else m.set(k, [r]);
    }
    for (const b of m.values()) b.sort(byDate);
    return m;
  };

  const prev = group(baselineRows, (r) => r.jobNo);
  const next = group(currentRows, (r) => r.jobNo);

  const moved = [];
  const added = [];
  const removed = [];
  const byRow = new Map();
  let unchanged = 0;

  for (const [key, nextRows] of next) {
    const prevRows = prev.get(key);
    if (!prevRows) {
      // The whole piece is new to the schedule — not a move, and saying "moved
      // 0 days" about it would be false.
      for (const r of nextRows) {
        const entry = { kind: "added", key, row: r, days: null, from: null, to: r.date };
        added.push(entry);
        byRow.set(r, entry);
      }
      continue;
    }

    const { pairs, prevOnly, nextOnly } = alignInstances(
      prevRows.map((r) => r.date),
      nextRows.map((r) => r.date)
    );

    for (const [pi, ni] of pairs) {
      const p = prevRows[pi];
      const r = nextRows[ni];
      const days = dayDelta(p.date, r.date);
      const entry = {
        kind: days === 0 ? "same" : days < 0 ? "earlier" : "later",
        key, row: r, days,
        from: p.date, to: r.date,
        fromBed: p.bed, fromPlant: p.plant,
        bedChanged: Boolean(p.bed && r.bed && p.bed !== r.bed),
        plantChanged: Boolean(p.plant && r.plant && p.plant !== r.plant),
      };
      byRow.set(r, entry);
      if (days === 0) unchanged++; else moved.push(entry);
    }
    for (const ni of nextOnly) {
      const r = nextRows[ni];
      const entry = { kind: "added", key, row: r, days: null, from: null, to: r.date };
      added.push(entry);
      byRow.set(r, entry);
    }
    for (const pi of prevOnly) {
      const p = prevRows[pi];
      removed.push({ kind: "removed", key, row: null, prev: p, days: null, from: p.date, to: null });
    }
  }

  // Pieces that were scheduled before and are not in the new export at all.
  for (const [key, prevRows] of prev) {
    if (next.has(key)) continue;
    for (const p of prevRows) {
      removed.push({ kind: "removed", key, row: null, prev: p, days: null, from: p.date, to: null });
    }
  }

  const earlier = moved.filter((m) => m.days < 0);
  const later = moved.filter((m) => m.days > 0);
  const absDays = moved.map((m) => Math.abs(m.days));

  return {
    ready: true,
    moved, added, removed, unchanged,
    byRow,
    earlier: earlier.length,
    later: later.length,
    stats: {
      pieces: currentRows.filter((r) => r.mark && r.date).length,
      moved: moved.length,
      earlier: earlier.length,
      later: later.length,
      added: added.length,
      removed: removed.length,
      unchanged,
      maxEarlier: earlier.length ? Math.min(...earlier.map((m) => m.days)) : 0,
      maxLater: later.length ? Math.max(...later.map((m) => m.days)) : 0,
      // Mean absolute movement over the pieces that actually moved. Averaging
      // over every piece instead would bury a big slip under the unchanged ones.
      avgAbs: absDays.length ? absDays.reduce((a, d) => a + d, 0) / absDays.length : 0,
    },
  };
}

/** Movement rolled up per job, worst-first. */
export function movementByJob(diff) {
  const m = new Map();
  const touch = (jobNo, job) => {
    let g = m.get(jobNo);
    if (!g) {
      g = { jobNo, job: job || "", jobTitle: "", earlier: 0, later: 0, added: 0, removed: 0,
            days: [], worstEarlier: 0, worstLater: 0 };
      m.set(jobNo, g);
    }
    return g;
  };
  for (const e of diff.moved) {
    const g = touch(e.row.jobNo, e.row.job);
    g.jobTitle = g.jobTitle || e.row.jobTitle || "";
    g.days.push(e.days);
    if (e.days < 0) { g.earlier++; g.worstEarlier = Math.min(g.worstEarlier, e.days); }
    else { g.later++; g.worstLater = Math.max(g.worstLater, e.days); }
  }
  for (const e of diff.added) {
    const g = touch(e.row.jobNo, e.row.job);
    g.jobTitle = g.jobTitle || e.row.jobTitle || "";
    g.added++;
  }
  for (const e of diff.removed) {
    const g = touch(e.prev.jobNo, e.prev.job);
    g.removed++;
  }
  return [...m.values()]
    .map((g) => ({
      ...g,
      moved: g.earlier + g.later,
      changed: g.earlier + g.later + g.added + g.removed,
      avgAbs: g.days.length ? g.days.reduce((a, d) => a + Math.abs(d), 0) / g.days.length : 0,
      // The signed net tells you whether a job as a whole pulled in or slipped;
      // the counts alone can't, because they cancel.
      net: g.days.length ? g.days.reduce((a, d) => a + d, 0) / g.days.length : 0,
    }))
    .sort((a, b) => b.changed - a.changed || a.jobNo.localeCompare(b.jobNo));
}
