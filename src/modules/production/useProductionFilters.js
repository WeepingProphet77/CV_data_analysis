/** Filter state and derived slices for the production module. */
import { useMemo, useState } from "react";
import { distinct } from "../../core/aggregate.js";

export function useProductionFilters(rows) {
  const [plant, setPlant] = useState("All");
  const [job, setJob] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const range = useMemo(() => {
    const dates = rows.map((r) => r.date).filter(Boolean).sort();
    return { min: dates[0] || "", max: dates[dates.length - 1] || "" };
  }, [rows]);

  const filtered = useMemo(() => {
    const from = dateFrom || range.min;
    const to = dateTo || range.max;
    return rows.filter(
      (r) =>
        (plant === "All" || r.plant === plant) &&
        (job === "All" || r.job === job) &&
        (!from || r.date >= from) &&
        (!to || r.date <= to)
    );
  }, [rows, plant, job, dateFrom, dateTo, range]);

  const plants = useMemo(() => ["All", ...distinct(rows, (r) => r.plant)], [rows]);

  // Job choices follow the selected plant — a plant only runs some of the jobs.
  const jobs = useMemo(() => {
    const pool = plant === "All" ? rows : rows.filter((r) => r.plant === plant);
    return ["All", ...distinct(pool, (r) => r.job)];
  }, [rows, plant]);

  const dirty = Boolean(dateFrom || dateTo || plant !== "All" || job !== "All");
  const clear = () => { setDateFrom(""); setDateTo(""); setPlant("All"); setJob("All"); };

  return {
    filtered, range, dirty, clear,
    plant, setPlant, job, setJob,
    dateFrom, setDateFrom, dateTo, setDateTo,
    plants, jobs,
  };
}
