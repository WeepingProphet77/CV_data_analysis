/**
 * Flattening the library into the shapes the views want, plus filter state.
 *
 * The library holds one source per plant; every view works on the union. All
 * of it is memoised on `sources` because a re-aggregation walks every cost
 * line in every plant, and that runs on each filter keystroke.
 */
import { useMemo, useState } from "react";
import { categoryOf } from "./categories.js";

/** Union of every loaded source, with per-job cost lines attached. */
export function useJobCostData(sources) {
  return useMemo(() => {
    const jobs = [];
    const costs = [];
    const quantities = [];

    for (const src of sources) {
      for (const c of src.costs) {
        const cat = categoryOf(c.code);
        costs.push({ ...c, category: cat.label, categoryId: cat.id });
      }
      for (const q of src.quantities) quantities.push(q);
      for (const j of src.jobs) {
        const t = j.totals;
        jobs.push({
          ...j,
          // Cost progress is measured against the *projection*, not the
          // estimate: the estimate is what was bid, the projection is what the
          // job is now expected to cost, and progress against a stale bid
          // reads as if a job were further along than it is.
          costProgress: t.projCost > 0 ? t.actCost / t.projCost : 0,
          // Negative variance means the job is tracking over its projection.
          variance: t.variance,
          overProjection: t.projCost > 0 && t.actCost > t.projCost,
          // A job billed well behind its cost is spending money it has not
          // invoiced — the cash question, distinct from the margin question.
          billedVsCost: j.pctBilled - (t.projCost > 0 ? t.actCost / t.projCost : 0),
        });
      }
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

/** Plant / job / category / search filter state, mirroring useProductionFilters. */
export function useJobCostFilters(data) {
  const [plant, setPlant] = useState("All");
  const [category, setCategory] = useState("All");
  const [job, setJob] = useState("All");
  const [search, setSearch] = useState("");

  const plants = useMemo(
    () => ["All", ...[...new Set(data.jobs.map((j) => j.plant))].sort()],
    [data.jobs]
  );

  // Job choices follow the selected plant — a plant only runs some of the jobs.
  const jobOptions = useMemo(() => {
    const pool = plant === "All" ? data.jobs : data.jobs.filter((j) => j.plant === plant);
    return ["All", ...pool.map((j) => j.jobNo).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
  }, [data.jobs, plant]);

  /** Plant and job pickers only — the scope the search narrows further. */
  const scope = useMemo(
    () => data.jobs.filter((j) => (plant === "All" || j.plant === plant) && (job === "All" || j.jobNo === job)),
    [data.jobs, plant, job]
  );

  const jobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scope;
    return scope.filter((j) => j.jobNo.toLowerCase().includes(q) || j.jobTitle.toLowerCase().includes(q));
  }, [scope, search]);

  const jobKeys = useMemo(() => new Set(jobs.map((j) => j.key)), [jobs]);
  const scopeKeys = useMemo(() => new Set(scope.map((j) => j.key)), [scope]);

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
    () => data.costs.filter((c) => scopeKeys.has(c.jobKey) && inCategory(c)),
    [data.costs, scopeKeys, category]
  );

  const dirty = plant !== "All" || category !== "All" || job !== "All" || Boolean(search);
  const clear = () => { setPlant("All"); setCategory("All"); setJob("All"); setSearch(""); };

  return {
    jobs, scope, costs, codeCosts, jobKeys, dirty, clear,
    plant, setPlant, plants,
    job, setJob, jobOptions,
    category, setCategory,
    search, setSearch,
  };
}
