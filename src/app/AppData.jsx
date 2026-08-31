/**
 * Assembles every dataset the app holds and puts it on one context.
 *
 * The records are unchanged — same keys, same hooks, same storage — but they
 * are now read in one place instead of inside whichever module happened to own
 * them first. Five records:
 *
 *   production            the schedule
 *   production-tickets    the Missing Piece Mark Ticket report
 *   production-baseline   the previous schedule, captured when a new one lands
 *   job-cost (library)    one Job Cost Report per plant
 *   employee-time         the timesheet export
 *
 * plus the app-wide My Projects selection.
 *
 * Deriving here rather than per section also means the expensive joins run
 * once: the ticket index, the schedule diff and the job-cost roll-up are each
 * memoised on their own inputs, and every section reads the same objects. The
 * board and the movement report in particular *must* share one `diff`, because
 * `byRow` is keyed on the row objects themselves (CLAUDE.md §11).
 */
import React, { useCallback, useMemo } from "react";
import { AppDataContext } from "../core/appData.js";
import { useDataset } from "../core/store.js";
import { useLibrary } from "../core/library.js";
import { useMyProjects } from "../core/myProjects.js";
import { useJobCostData } from "../modules/job-cost/useJobCost.js";
import { ticketIndex, ticketCoverage } from "../modules/production/tickets.js";
import { snapshotOf, diffSchedule } from "../modules/production/movement.js";

/** The saved ticket report is one record: the source object the walker returns. */
const EMPTY_TICKETS = {
  fileName: "", rows: [], jobs: [], plants: [], range: { min: "", max: "" }, warnings: [],
};

export function AppDataProvider({ children }) {
  const schedule = useDataset("production");
  const baseline = useDataset("production-baseline");
  const ticketData = useDataset("production-tickets");
  const time = useDataset("employee-time");
  const costLib = useLibrary("job-cost");
  const mine = useMyProjects();

  // useDataset persists { rows, meta }; the ticket walker's per-file figures
  // (ranges, banner counts, import notes) ride along in meta.
  const ticketSource = useMemo(
    () => (ticketData.rows.length
      ? { ...EMPTY_TICKETS, ...(ticketData.meta ?? {}), rows: ticketData.rows }
      : EMPTY_TICKETS),
    [ticketData.rows, ticketData.meta]
  );

  /**
   * Built over the *whole* report, not a filtered slice: a piece is missing its
   * drawing regardless of which plant or week is on screen.
   */
  const ticketIdx = useMemo(() => ticketIndex(ticketSource.rows), [ticketSource.rows]);

  const costData = useJobCostData(costLib.sources);

  /** My Projects narrows the row pool before anything else (CLAUDE.md §14). */
  const schedulePool = useMemo(
    () => (mine.active ? schedule.rows.filter((r) => mine.members.has(r.jobNo)) : schedule.rows),
    [schedule.rows, mine.active, mine.members]
  );

  // Coverage is measured against the My Projects pool rather than any date
  // filter, so narrowing to a week doesn't read as the report having shrunk.
  const coverage = useMemo(
    () => ticketCoverage(schedulePool, ticketSource.rows),
    [schedulePool, ticketSource.rows]
  );

  const diff = useMemo(
    () => diffSchedule(baseline.rows, schedule.rows),
    [baseline.rows, schedule.rows]
  );

  const scheduleRange = useMemo(() => {
    const dates = schedule.rows.map((r) => r.date).filter(Boolean).sort();
    return { min: dates[0] || "", max: dates[dates.length - 1] || "" };
  }, [schedule.rows]);

  const scheduledJobNos = useMemo(
    () => new Set(schedule.rows.map((r) => r.jobNo).filter(Boolean)),
    [schedule.rows]
  );

  /**
   * Replacing the schedule: keep what is on screen now as the baseline, then
   * load the new file. `schedule.rows` still holds the outgoing export at this
   * point, which is the whole reason the capture happens here rather than
   * inside useDataset.
   */
  const replaceSchedule = useCallback(
    (rows, meta) => {
      if (schedule.rows.length) {
        baseline.load(snapshotOf(schedule.rows), {
          fileName: schedule.meta?.fileName || "",
          fileDate: schedule.meta?.fileDate || "",
          replacedOn: new Date().toISOString().slice(0, 10),
          rowCount: schedule.rows.length,
        });
      }
      schedule.load(rows, meta);
    },
    [schedule, baseline]
  );

  // A baseline outliving the data it described would compare a fresh import
  // against a file nobody remembers loading.
  const clearSchedule = useCallback(() => {
    schedule.clear();
    baseline.clear();
  }, [schedule, baseline]);

  const loadTickets = useCallback(
    (src) => {
      const { rows, ...meta } = src;
      ticketData.load(rows, meta);
    },
    [ticketData]
  );

  // Every record must resolve before anything renders, or a saved My Projects
  // choice flashes as "All" and a loaded file flashes as an empty state.
  const ready =
    schedule.ready && baseline.ready && ticketData.ready &&
    time.ready && costLib.ready && mine.ready;

  const value = useMemo(
    () => ({
      ready,
      mine,
      schedule: { ...schedule, pool: schedulePool, load: replaceSchedule, clear: clearSchedule },
      scheduleRange,
      scheduledJobNos,
      baseline,
      diff,
      ticketData,
      tickets: {
        source: ticketSource, rows: ticketSource.rows, index: ticketIdx,
        load: loadTickets, clear: ticketData.clear,
        persistWarning: ticketData.persistWarning,
      },
      coverage,
      costLib,
      cost: { data: costData },
      time,
    }),
    [
      ready, mine, schedule, schedulePool, replaceSchedule, clearSchedule, scheduleRange,
      scheduledJobNos, baseline, diff, ticketData, ticketSource, ticketIdx, loadTickets,
      coverage, costLib, costData, time,
    ]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export default AppDataProvider;
