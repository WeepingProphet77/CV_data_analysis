/**
 * The unified project list — one row per job number, across every source.
 *
 * There used to be two Jobs tables: one over the cost reports, one over the
 * schedule, listing the same entity with different columns and no way to get
 * from one to the other. This builds a single row per job, filled in from
 * whichever sources know about it, so "costed but not scheduled" and
 * "scheduled but not costed" are visible states of one list rather than two
 * lists that happen not to overlap.
 *
 * A blank cell here means "this source says nothing about this job", which is
 * information. It is never rendered as a zero.
 *
 * Plain ESM, node-importable — the roll-up is testable without a browser.
 */

const add = (a, b) => (a || 0) + (b || 0);

/**
 * Build the rows.
 *
 * Keyed on job **number**, which is the project's identity in all three systems
 * (CLAUDE.md §13, §14). A job costed at two plants is one row; its plants are
 * listed and its cost figures added, because they are the same project even
 * when they are separate contracts — the job page breaks them out again.
 */
export function projectRows({ costJobs = [], scheduleRows = [], ticketRows = [], timeRows = [] }) {
  const map = new Map();

  const at = (jobNo) => {
    let r = map.get(jobNo);
    if (!r) {
      r = {
        jobNo, title: "", plants: new Set(),
        costed: false, scheduled: false, drawn: false,
        netContract: 0, amountBilled: 0, estCost: 0, projCost: 0, actCost: 0, margin: 0,
        sfJob: 0, hasSf: false,
        pieces: 0, sfScheduled: 0, cy: 0, beds: new Set(), days: new Set(),
        missingTickets: 0, unassigned: 0,
        timed: false, hours: 0, people: new Set(),
      };
      map.set(jobNo, r);
    }
    return r;
  };

  for (const j of costJobs) {
    if (!j.jobNo) continue;
    const r = at(j.jobNo);
    r.costed = true;
    r.title = r.title || j.jobTitle;
    r.plants.add(j.plant);
    r.netContract = add(r.netContract, j.netContract);
    r.amountBilled = add(r.amountBilled, j.amountBilled);
    r.estCost = add(r.estCost, j.totals.estCost);
    r.projCost = add(r.projCost, j.totals.projCost);
    r.actCost = add(r.actCost, j.totals.actCost);
    r.margin = add(r.margin, j.estOhProfit);
    if (j.sf.hasSf) { r.hasSf = true; r.sfJob = add(r.sfJob, j.sf.job); }
  }

  for (const row of scheduleRows) {
    if (!row.jobNo) continue;
    const r = at(row.jobNo);
    r.scheduled = true;
    // The schedule's title is the one a scheduler reads, so it wins.
    if (row.jobTitle) r.title = row.jobTitle;
    r.plants.add(row.plant);
    r.pieces = add(r.pieces, row.qty);
    r.sfScheduled = add(r.sfScheduled, row.sf);
    r.cy = add(r.cy, row.cy);
    if (row.bedKey) r.beds.add(row.bedKey);
    if (row.date) r.days.add(row.date);
  }

  for (const t of ticketRows) {
    if (!t.jobNo) continue;
    const r = at(t.jobNo);
    r.drawn = true;
    r.title = r.title || t.jobTitle;
    r.missingTickets += 1;
    if (!t.drawnBy) r.unassigned += 1;
  }

  // Timesheet hours join on the job number like everything else — the export
  // carries it in "<no> - <title>", profiled 2026-08-31 (§12).
  for (const t of timeRows) {
    if (!t.jobNo) continue;
    const r = at(t.jobNo);
    r.timed = true;
    r.title = r.title || t.jobTitle;
    r.hours += t.hrs || 0;
    if (t.name) r.people.add(t.name);
  }

  return [...map.values()]
    .map((r) => ({
      ...r,
      plants: [...r.plants].filter(Boolean).sort(),
      beds: r.beds.size,
      days: r.days.size,
      people: r.people.size,
      // Rates and ratios are null, never zero, when their denominator is
      // unknown — a zero would read as "costs nothing per foot".
      marginPct: r.netContract > 0 ? r.margin / r.netContract : null,
      pctBilled: r.netContract > 0 ? r.amountBilled / r.netContract : null,
      costProgress: r.projCost > 0 ? r.actCost / r.projCost : null,
      actualPerSf: r.hasSf && r.sfJob > 0 ? r.actCost / r.sfJob : null,
      forecastPerSf: r.hasSf && r.sfJob > 0 ? r.projCost / r.sfJob : null,
      // Sorting on presence needs a value the generic comparator understands.
      // Cost per booked hour is only meaningful where both sides exist.
      costPerHour: r.costed && r.hours > 0 ? r.actCost / r.hours : null,
      sources: [r.costed && "cost", r.scheduled && "schedule", r.drawn && "drawings",
                r.timed && "time"].filter(Boolean).join("+"),
    }))
    .sort((a, b) => a.jobNo.localeCompare(b.jobNo, undefined, { numeric: true }));
}

/** The presence filters offered above the table. */
export const PRESENCE = [
  { id: "all", label: "All" },
  { id: "costed", label: "Costed", test: (r) => r.costed },
  { id: "scheduled", label: "Scheduled", test: (r) => r.scheduled },
  { id: "both", label: "Costed + scheduled", test: (r) => r.costed && r.scheduled },
  { id: "cost-only", label: "Costed, not scheduled", test: (r) => r.costed && !r.scheduled },
  { id: "sched-only", label: "Scheduled, not costed", test: (r) => r.scheduled && !r.costed },
  { id: "missing", label: "Missing drawings", test: (r) => r.missingTickets > 0 },
  { id: "timed", label: "Has booked hours", test: (r) => r.timed },
  // Hours booked against a job no cost report covers — either the report isn't
  // loaded, or the job is not an active one. Worth being able to find.
  { id: "time-only", label: "Hours, no cost report", test: (r) => r.timed && !r.costed },
];

export const applyPresence = (rows, id) => {
  const p = PRESENCE.find((x) => x.id === id);
  return p?.test ? rows.filter(p.test) : rows;
};
