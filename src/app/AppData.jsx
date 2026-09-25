/**
 * Assembles every dataset the app holds and puts it on one context.
 *
 * The records are read in one place instead of inside whichever module
 * happened to own them first, because Projects, the job page and Home need
 * both of them at once. Two records:
 *
 *   job-cost (library)    one Job Cost Report per plant
 *   employee-time         the timesheet export
 *
 * plus the app-wide My Projects selection.
 *
 * The schedule, the missing-ticket report and the schedule baseline were held
 * here until 2026-09-25, when Production and Drawings were retired
 * (docs/cost-and-time-focus.md). Their stored records are deleted on startup
 * by `dropRetiredRecords` in core/store.js.
 */
import React, { useEffect, useMemo } from "react";
import { AppDataContext } from "../core/appData.js";
import { useDataset, dropRetiredRecords } from "../core/store.js";
import { useLibrary } from "../core/library.js";
import { useMyProjects } from "../core/myProjects.js";
import { useJobCostData } from "../modules/job-cost/useJobCost.js";

export function AppDataProvider({ children }) {
  const time = useDataset("employee-time");
  const costLib = useLibrary("job-cost");
  const mine = useMyProjects();

  useEffect(() => { dropRetiredRecords(); }, []);

  const costData = useJobCostData(costLib.sources);

  // Every record must resolve before anything renders, or a saved My Projects
  // choice flashes as "All" and a loaded file flashes as an empty state.
  const ready = time.ready && costLib.ready && mine.ready;

  const value = useMemo(
    () => ({
      ready,
      mine,
      costLib,
      cost: { data: costData },
      time,
    }),
    [ready, mine, costLib, costData, time]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export default AppDataProvider;
