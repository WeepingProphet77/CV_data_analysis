/**
 * Production — analysis of Concrete Vision's Scheduled Production Report.
 *
 * The report is forward-looking: these are pours that are *scheduled*. The UI
 * says "scheduled" throughout and never claims anything was produced.
 */
import React, { useMemo, useState } from "react";
import { useDataset } from "../../core/store.js";
import { sumBy } from "../../core/aggregate.js";
import { Tabs } from "../../components/ui.jsx";
import { ImportPrompt } from "../../components/FileImport.jsx";
import { DataBar } from "../../components/DataBar.jsx";
import { FilterBar } from "../../components/Filters.jsx";
import schema from "./schema.js";
import { useProductionFilters } from "./useProductionFilters.js";
import Schedule from "./views/Schedule.jsx";
import Overview from "./views/Overview.jsx";
import Beds from "./views/Beds.jsx";
import Jobs from "./views/Jobs.jsx";
import Pieces from "./views/Pieces.jsx";

export default function ProductionModule() {
  const data = useDataset("production");
  const f = useProductionFilters(data.rows);
  const [tab, setTab] = useState("schedule");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => ({
    beds: new Set(f.filtered.map((r) => r.bedKey)).size,
    jobs: new Set(f.filtered.map((r) => r.job)).size,
    pieces: sumBy(f.filtered, (r) => r.qty),
  }), [f.filtered]);

  if (!data.ready) return null;

  if (!data.rows.length) {
    return (
      <ImportPrompt
        schema={schema}
        title="Production"
        blurb="Upload a Concrete Vision Scheduled Production Report to get started."
        onLoaded={data.load}
      />
    );
  }

  // The Schedule tab owns the plant picker (it drives the calendar), so the
  // shared filter row leaves plant out there to avoid two controls for one thing.
  const searchable = tab === "beds" || tab === "jobs" || tab === "pieces";

  return (
    <div>
      <DataBar
        title="Production"
        meta={data.meta}
        rowCount={data.rows.length}
        schema={schema}
        persistWarning={data.persistWarning}
        onLoaded={(rows, meta) => {
          data.load(rows, meta);
          setTab("schedule"); setSearch(""); f.clear();
        }}
        onClear={data.clear}
      />

      <Tabs
        active={tab}
        onChange={(t) => { setTab(t); setSearch(""); }}
        tabs={[
          { id: "schedule", label: "Schedule" },
          { id: "overview", label: "Charts" },
          { id: "beds", label: `Beds (${counts.beds})` },
          { id: "jobs", label: `Jobs (${counts.jobs})` },
          { id: "pieces", label: "Pieces" },
        ]}
      />

      <FilterBar
        range={f.range}
        dateFrom={f.dateFrom} dateTo={f.dateTo}
        onFrom={f.setDateFrom} onTo={f.setDateTo}
        dimensions={[
          ...(tab === "schedule" ? [] : [{ id: "plant", label: "Plants", value: f.plant, options: f.plants, onChange: f.setPlant }]),
          { id: "job", label: "Jobs", value: f.job, options: f.jobs, onChange: f.setJob },
        ]}
        dirty={f.dirty}
        onClear={f.clear}
        search={searchable ? search : undefined}
        onSearch={searchable ? setSearch : undefined}
        searchPlaceholder={
          tab === "beds" ? "Search beds…" : tab === "jobs" ? "Search jobs…" : "Search marks, jobs, beds…"
        }
      />

      {tab === "schedule" && (
        <Schedule rows={f.filtered} plant={f.plant} plants={f.plants} onPlant={f.setPlant} />
      )}
      {tab === "overview" && <Overview rows={f.filtered} onOpenJob={(job) => { f.setJob(job); setTab("jobs"); }} />}
      {tab === "beds" && <Beds rows={f.filtered} search={search} />}
      {tab === "jobs" && <Jobs rows={f.filtered} search={search} onOpenJob={(job) => { f.setJob(job); setTab("schedule"); }} />}
      {tab === "pieces" && <Pieces rows={f.filtered} search={search} />}
    </div>
  );
}
