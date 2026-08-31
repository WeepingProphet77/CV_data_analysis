/**
 * Filter state and derived slices for the production module.
 *
 * `mine` is the app-wide My Projects selection (core/myProjects.js). When it is
 * active it narrows the row pool itself, before any other filter — exactly as
 * job cost does, and for the same reason: a view cannot then forget to apply it
 * and show company-wide figures under a "My Projects" heading.
 */
import { useMemo, useState } from "react";
import { distinct } from "../../core/aggregate.js";

export function useProductionFilters(rows, mine) {
  const [plant, setPlant] = useState("All");
  const [job, setJob] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const active = Boolean(mine?.active);
  const members = mine?.members;

  /** My Projects, applied first — every option list below is drawn from this. */
  const pool = useMemo(
    () => (active ? rows.filter((r) => members.has(r.jobNo)) : rows),
    [rows, active, members]
  );

  const range = useMemo(() => {
    const dates = pool.map((r) => r.date).filter(Boolean).sort();
    return { min: dates[0] || "", max: dates[dates.length - 1] || "" };
  }, [pool]);

  const filtered = useMemo(() => {
    const from = dateFrom || range.min;
    const to = dateTo || range.max;
    return pool.filter(
      (r) =>
        (plant === "All" || r.plant === plant) &&
        (job === "All" || r.job === job) &&
        (!from || r.date >= from) &&
        (!to || r.date <= to)
    );
  }, [pool, plant, job, dateFrom, dateTo, range]);

  // The pickers list only what the current scope can show, so choosing an
  // option never lands on an unexplained empty view.
  const plants = useMemo(() => ["All", ...distinct(pool, (r) => r.plant)], [pool]);

  // Job choices follow the selected plant — a plant only runs some of the jobs.
  const jobs = useMemo(() => {
    const scoped = plant === "All" ? pool : pool.filter((r) => r.plant === plant);
    return ["All", ...distinct(scoped, (r) => r.job)];
  }, [pool, plant]);

  const dirty = Boolean(dateFrom || dateTo || plant !== "All" || job !== "All");
  const clear = () => { setDateFrom(""); setDateTo(""); setPlant("All"); setJob("All"); };

  return {
    pool, filtered, range, dirty, clear,
    plant, setPlant, job, setJob,
    dateFrom, setDateFrom, dateTo, setDateTo,
    plants, jobs,
  };
}
