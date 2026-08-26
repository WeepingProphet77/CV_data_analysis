/**
 * Flattening the library into the shapes the views want, plus filter state.
 *
 * The library holds one source per plant; every view works on the union. All
 * of it is memoised on `sources` because a re-aggregation walks every cost
 * line in every plant, and that runs on each filter keystroke.
 */
import { useMemo, useState } from "react";
import { categoryOf } from "./categories.js";
import { deriveJob, quantitiesByJob } from "./jobMetrics.js";

/** Union of every loaded source, with per-job cost lines attached. */
export function useJobCostData(sources) {
  return useMemo(() => {
    const jobs = [];
    const costs = [];
    const quantities = [];

    // Quantity rows are grouped first: a job's footage is needed while its
    // record is being built, not after.
    const qtyForJob = quantitiesByJob(sources.flatMap((s) => s.quantities));

    for (const src of sources) {
      for (const c of src.costs) {
        const cat = categoryOf(c.code);
        costs.push({ ...c, category: cat.label, categoryId: cat.id });
      }
      for (const q of src.quantities) quantities.push(q);
      for (const j of src.jobs) jobs.push(deriveJob(j, qtyForJob.get(j.key)));
    }

    const byJobKey = new Map(jobs.map((j) => [j.key, j]));
    const costsByJob = new Map();
    for (const c of costs) {
      if (!costsByJob.has(c.jobKey)) costsByJob.set(c.jobKey, []);
      costsByJob.get(c.jobKey).push(c);
    }
    const qtyByJob = new Map();
    for (const q of quantities) {
      if (!qtyByJob.has(q.jobKey)) qtyByJob.set(q.jobKey, []);
      qtyByJob.get(q.jobKey).push(q);
    }

    const asOf = sources.map((s) => s.asOf).filter(Boolean).sort();
    return {
      jobs, costs, quantities, byJobKey, costsByJob, qtyByJob,
      // Sources refresh on their own schedules, so the library routinely holds
      // more than one cut-off date. The UI has to say so rather than implying
      // a single point in time.
      asOfRange: { min: asOf[0] || "", max: asOf[asOf.length - 1] || "" },
      mixedAsOf: new Set(asOf).size > 1,
    };
  }, [sources]);
}

/**
 * Plant / job / category / search filter state, mirroring useProductionFilters.
 *
 * `mine` is the My Projects selection. When it is active every tab sees only
 * the starred jobs — it narrows the job pool itself rather than being applied
 * per view, so there is no way for a view to miss it and show company-wide
 * figures under a "My Projects" heading.
 */
export function useJobCostFilters(data, mine) {
  const [plant, setPlant] = useState("All");
  const [category, setCategory] = useState("All");
  const [job, setJob] = useState("All");
  const [search, setSearch] = useState("");

  // Both pickers list only what the current scope can actually show, so
  // choosing an option never lands on an unexplained empty view.
  const inScope = useMemo(
    () => (mine.active ? data.jobs.filter((j) => mine.members.has(j.jobNo)) : data.jobs),
    [data.jobs, mine.active, mine.members]
  );

  const plants = useMemo(
    () => ["All", ...[...new Set(inScope.map((j) => j.plant))].sort()],
    [inScope]
  );

  // Job choices follow the selected plant — a plant only runs some of the jobs.
  const jobOptions = useMemo(() => {
    const forPlant = plant === "All" ? inScope : inScope.filter((j) => j.plant === plant);
    return ["All", ...forPlant.map((j) => j.jobNo).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
  }, [inScope, plant]);

  /** My Projects, then the plant and job pickers — the pool the search narrows further. */
  const pool = useMemo(
    () => data.jobs.filter(
      (j) =>
        (!mine.active || mine.members.has(j.jobNo)) &&
        (plant === "All" || j.plant === plant) &&
        (job === "All" || j.jobNo === job)
    ),
    [data.jobs, plant, job, mine.active, mine.members]
  );

  const jobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((j) => j.jobNo.toLowerCase().includes(q) || j.jobTitle.toLowerCase().includes(q));
  }, [pool, search]);

  const jobKeys = useMemo(() => new Set(jobs.map((j) => j.key)), [jobs]);
  const poolKeys = useMemo(() => new Set(pool.map((j) => j.key)), [pool]);

  const inCategory = (c) => category === "All" || c.category === category;

  const costs = useMemo(
    () => data.costs.filter((c) => jobKeys.has(c.jobKey) && inCategory(c)),
    [data.costs, jobKeys, category]
  );

  /**
   * Cost lines for the Cost Codes tab, which runs the search box against code
   * numbers and descriptions itself. Narrowing by job name first would leave it
   * nothing to search.
   */
  const codeCosts = useMemo(
    () => data.costs.filter((c) => poolKeys.has(c.jobKey) && inCategory(c)),
    [data.costs, poolKeys, category]
  );

  const dirty = plant !== "All" || category !== "All" || job !== "All" || Boolean(search);
  const clear = () => { setPlant("All"); setCategory("All"); setJob("All"); setSearch(""); };

  return {
    jobs, pool, costs, codeCosts, jobKeys, dirty, clear,
    plant, setPlant, plants,
    job, setJob, jobOptions,
    category, setCategory,
    search, setSearch,
  };
}
