/**
 * Job Cost — weekly job cost reports, one workbook per plant.
 *
 * These come from a different system than Concrete Vision, but they describe
 * the same jobs, so the module joins to the production schedule on job number
 * (see views/ProductionLink.jsx).
 *
 * Unlike every other module this one persists a *library* rather than a single
 * import: each plant's report refreshes on its own schedule, so replacing the
 * dataset on upload would discard three plants to update a fourth.
 */
import React, { useMemo, useState } from "react";
import { useLibrary } from "../../core/library.js";
import { useDataset } from "../../core/store.js";
import { Tabs } from "../../components/ui.jsx";
import { FilterBar } from "../../components/Filters.jsx";
import { useJobCostData, useJobCostFilters } from "./useJobCost.js";
import { categoryOptions } from "./categories.js";
import SourceLibrary, { SourceDrop } from "./views/SourceLibrary.jsx";
import Portfolio from "./views/Portfolio.jsx";
import Jobs from "./views/Jobs.jsx";
import JobDetail from "./views/JobDetail.jsx";
import CostCodes from "./views/CostCodes.jsx";
import ProductionLink from "./views/ProductionLink.jsx";

export default function JobCostModule() {
  const lib = useLibrary("job-cost");
  // The production module's own saved dataset, read-only. Its rows already
  // carry the derived fields (jobNo, qty, sf), so no schema import is needed
  // and the module boundary stays intact.
  const production = useDataset("production");

  const data = useJobCostData(lib.sources);
  const f = useJobCostFilters(data);
  const [tab, setTab] = useState("portfolio");
  const [openJob, setOpenJob] = useState(null);

  const categories = useMemo(
    () => ["All", ...categoryOptions().map((c) => c.label)],
    []
  );

  const scheduledJobNos = useMemo(
    () => new Set(production.rows.map((r) => r.jobNo).filter(Boolean)),
    [production.rows]
  );

  if (!lib.ready) return null;

  if (!lib.sources.length) return <SourceDrop onSource={lib.upsert} />;

  const job = openJob ? data.byJobKey.get(openJob) : null;

  // The production module owns its own filter state and takes no deep link, so
  // this hands over the route and nothing more.
  const goProduction = () => { window.location.hash = "#/production"; };

  return (
    <div className="jc">
      <SourceLibrary
        sources={lib.sources}
        data={data}
        onSource={lib.upsert}
        onRemove={lib.remove}
        onClear={() => { lib.clear(); setOpenJob(null); f.clear(); }}
        persistWarning={lib.persistWarning}
      />

      {job ? (
        <JobDetail
          job={job}
          costs={data.costsByJob.get(job.key) || []}
          quantities={data.qtyByJob.get(job.key) || []}
          production={scheduledJobNos.has(job.jobNo)}
          onBack={() => setOpenJob(null)}
          onOpenProduction={goProduction}
        />
      ) : (
        <>
          <Tabs
            active={tab}
            onChange={(t) => { setTab(t); f.setSearch(""); }}
            tabs={[
              { id: "portfolio", label: "Portfolio" },
              { id: "jobs", label: `Jobs (${f.jobs.length})` },
              { id: "codes", label: "Cost Codes" },
              { id: "production", label: "vs Production" },
            ]}
          />

          <FilterBar
            dimensions={[
              { id: "plant", label: "Plants", value: f.plant, options: f.plants, onChange: f.setPlant },
              { id: "job", label: "Jobs", value: f.job, options: f.jobOptions, onChange: f.setJob },
              // Category slices cost lines, so it only means anything where
              // cost lines are what is on screen.
              ...(tab === "codes" || tab === "portfolio"
                ? [{ id: "category", label: "Categories", value: f.category, options: categories, onChange: f.setCategory }]
                : []),
            ]}
            dirty={f.dirty}
            onClear={f.clear}
            search={f.search}
            onSearch={f.setSearch}
            searchPlaceholder={tab === "codes" ? "Search codes and descriptions…" : "Search job number or name…"}
          />

          {tab === "portfolio" && <Portfolio jobs={f.jobs} costs={f.costs} onOpenJob={setOpenJob} />}
          {tab === "jobs" && <Jobs jobs={f.jobs} onOpenJob={setOpenJob} />}
          {tab === "codes" && <CostCodes costs={f.codeCosts} jobs={f.scope} search={f.search} onOpenJob={setOpenJob} />}
          {tab === "production" && (
            <ProductionLink
              jobs={f.jobs}
              qtyByJob={data.qtyByJob}
              production={production.ready ? production.rows : []}
              onOpenJob={setOpenJob}
            />
          )}
        </>
      )}
    </div>
  );
}
