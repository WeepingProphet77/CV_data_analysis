/**
 * One job, gathered from every source that mentions it.
 *
 * The job number is the project's identity in both systems here — the cost
 * report and the timesheet both carry it (CLAUDE.md §12, §13) — so it is the
 * key, and the job *name* never is: the two systems write it differently.
 *
 * Pure ESM and node-importable: this is the arithmetic, the page is only its
 * presentation.
 *
 * The two sources answer different questions and are never summed together.
 * Cost is dollars booked to codes, cumulative to date; the timesheet is hours
 * booked by people over whatever window it was run for. Each section carries
 * its own as-of, because reading one as the other is the mistake this page
 * could most easily invite.
 */

/**
 * Timesheet rows for this job.
 *
 * **This is a real join, on the same key as everything else.** The employee
 * time export was profiled on 2026-08-31 and its `Job Name` carries the job
 * number in the same `"<no> - <title>"` shape the other exports use — it parsed on
 * 100.0% of rows. `jobNo` is derived at parse time by the schema, so this is a
 * plain equality match, not a string search.
 *
 * It was a labelled guess before that profile. It is not any more, and the
 * caveats that said so have been removed rather than left to rot.
 */
export function matchTimeRows(timeRows, jobNo) {
  if (!jobNo) return [];
  return (timeRows || []).filter((r) => r.jobNo === jobNo);
}

const sum = (rows, pick) => rows.reduce((a, r) => a + (pick(r) || 0), 0);

const span = (rows, pick) => {
  const vals = rows.map(pick).filter(Boolean).sort();
  return { min: vals[0] || "", max: vals[vals.length - 1] || "" };
};

const uniq = (rows, pick) => [...new Set(rows.map(pick).filter(Boolean))].sort();

/** Hours per key, biggest first. */
const rollup = (rows, pick) => {
  const m = new Map();
  for (const r of rows) m.set(pick(r), (m.get(pick(r)) || 0) + (r.hrs || 0));
  return [...m].map(([key, hrs]) => ({ key, hrs })).sort((a, b) => b.hrs - a.hrs);
};

/**
 * Assemble everything known about one job.
 *
 * Every section is null when its source is not loaded, and `loaded` says which
 * — a section that renders zeros for a file nobody imported is worse than one
 * that says the file is missing.
 */
export function assembleJob({
  jobNo,
  costJobs = [],
  timeRows = [],
  loaded = {},
}) {
  const mine = String(jobNo || "");

  const costs = costJobs.filter((j) => j.jobNo === mine);
  const hours = matchTimeRows(timeRows, mine);

  // The title, from whichever source has one — they disagree on wording, so
  // the cost report's is preferred for being the contract's.
  const title = costs[0]?.jobTitle || hours[0]?.jobTitle || "";

  const cost = costs.length
    ? {
        records: costs,
        // A job number can appear at more than one plant; the page shows each
        // record rather than adding them, since they are separate contracts.
        plants: uniq(costs, (j) => j.plant),
        asOf: span(costs, (j) => j.asOf),
        netContract: sum(costs, (j) => j.netContract),
        amountBilled: sum(costs, (j) => j.amountBilled),
        estCost: sum(costs, (j) => j.totals.estCost),
        projCost: sum(costs, (j) => j.totals.projCost),
        actCost: sum(costs, (j) => j.totals.actCost),
        variance: sum(costs, (j) => j.totals.variance),
        margin: sum(costs, (j) => j.estOhProfit),
        sfJob: sum(costs, (j) => j.sf.job),
        hasSf: costs.some((j) => j.sf.hasSf),
      }
    : null;

  if (cost) {
    cost.marginPct = cost.netContract > 0 ? cost.margin / cost.netContract : null;
    cost.pctBilled = cost.netContract > 0 ? cost.amountBilled / cost.netContract : null;
    cost.costProgress = cost.projCost > 0 ? cost.actCost / cost.projCost : null;
    // Every rate divides by the job square footage, never by area cast to date.
    cost.actualPerSf = cost.hasSf && cost.sfJob > 0 ? cost.actCost / cost.sfJob : null;
    cost.forecastPerSf = cost.hasSf && cost.sfJob > 0 ? cost.projCost / cost.sfJob : null;
    cost.contractPerSf = cost.hasSf && cost.sfJob > 0 ? cost.netContract / cost.sfJob : null;
  }

  return {
    jobNo: mine,
    title,
    loaded,
    cost,
    hours: {
      rows: hours,
      hours: sum(hours, (r) => r.hrs),
      people: uniq(hours, (r) => r.name).length,
      range: span(hours, (r) => r.date),
      // Joined on the job number, like every other source here.
      confident: true,
      // What the work was, which is the question the cost report can't answer
      // per person: 60.x tells you D&E cost, not who spent the day on it.
      byTask: rollup(hours, (r) => r.task || "(no task)"),
      byPerson: rollup(hours, (r) => r.name),
      offices: uniq(hours, (r) => r.loc),
    },
    // Which sources know this job at all — what makes "no hours booked"
    // legible as a fact rather than as a gap in the page.
    seenIn: {
      cost: costs.length > 0,
      time: hours.length > 0,
    },
  };
}

/** Every job number any loaded source knows about, for the Projects list. */
export function allJobNumbers({ costJobs = [], timeRows = [] }) {
  const s = new Set();
  for (const j of costJobs) if (j.jobNo) s.add(j.jobNo);
  for (const r of timeRows) if (r.jobNo) s.add(r.jobNo);
  return [...s].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
