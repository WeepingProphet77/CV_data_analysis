/**
 * Employee Time — analysis of Concrete Vision's timesheet export.
 *
 * Owns its own dataset (localStorage, per-module key), filter state and
 * drill-down navigation. Other modules follow this same shape.
 */
import React, { useMemo, useState } from "react";
import { useDataset } from "../../core/store.js";
import { sumBy } from "../../core/aggregate.js";
import { Tabs } from "../../components/ui.jsx";
import { ImportPrompt } from "../../components/FileImport.jsx";
import { DataBar } from "../../components/DataBar.jsx";
import { FilterBar } from "../../components/Filters.jsx";
import schema from "./schema.js";
import { useTimeFilters } from "./useTimeFilters.js";
import Overview from "./views/Overview.jsx";
import People from "./views/People.jsx";
import Projects from "./views/Projects.jsx";
import Cumulative from "./views/Cumulative.jsx";
import PersonDetail from "./views/PersonDetail.jsx";
import ProjectDetail from "./views/ProjectDetail.jsx";

const TABS = ["overview", "people", "projects", "cumulative"];

export default function EmployeeTimeModule() {
  const data = useDataset("employee-time");
  const f = useTimeFilters(data.rows);
  const [tab, setTab] = useState("overview");
  const [drill, setDrill] = useState(null); // {kind:'person'|'project', id}
  const [search, setSearch] = useState("");

  const total = useMemo(() => sumBy(f.filtered, (r) => r.hrs), [f.filtered]);
  const peopleCount = useMemo(() => new Set(f.filtered.map((r) => r.name)).size, [f.filtered]);
  const projectCount = useMemo(() => new Set(f.filtered.map((r) => r.job)).size, [f.filtered]);

  const openPerson = (id) => setDrill({ kind: "person", id });
  const openProject = (id) => setDrill({ kind: "project", id });

  if (!data.ready) return null; // avoids flashing the empty state over saved data

  if (!data.rows.length) {
    return (
      <ImportPrompt
        schema={schema}
        title="Employee Time"
        blurb="Upload a Concrete Vision employee time export to get started."
        onLoaded={data.load}
      />
    );
  }

  return (
    <div>
      <DataBar
        title="Employee Time"
        meta={data.meta}
        rowCount={data.rows.length}
        schema={schema}
        persistWarning={data.persistWarning}
        onLoaded={(rows, meta) => {
          data.load(rows, meta);
          setDrill(null); setTab("overview"); setSearch(""); f.clear();
        }}
        onClear={data.clear}
      />

      {drill ? (
        drill.kind === "person" ? (
          <PersonDetail name={drill.id} rows={f.filtered}
                        onBack={() => setDrill(null)} onOpenProject={openProject} />
        ) : (
          <ProjectDetail job={drill.id} rows={f.filtered}
                         onBack={() => setDrill(null)} onOpenPerson={openPerson} />
        )
      ) : (
        <>
          <Tabs
            active={tab}
            onChange={(t) => { setTab(t); setSearch(""); }}
            tabs={[
              { id: "overview", label: "Overview" },
              { id: "people", label: `People (${peopleCount})` },
              { id: "projects", label: `Projects (${projectCount})` },
              { id: "cumulative", label: "Cumulative" },
            ]}
          />

          <FilterBar
            range={f.range}
            dateFrom={f.dateFrom} dateTo={f.dateTo}
            onFrom={f.setDateFrom} onTo={f.setDateTo}
            dimensions={[
              { id: "loc", label: "Locations", value: f.loc, options: f.locs, onChange: f.setLoc },
              { id: "dept", label: "Departments", value: f.dept, options: f.depts, onChange: f.setDept },
            ]}
            dirty={f.dirty}
            onClear={f.clear}
            search={search}
            onSearch={tab === "people" || tab === "projects" ? setSearch : undefined}
            searchPlaceholder={tab === "people" ? "Search people…" : "Search projects…"}
          />

          {tab === "overview" && <Overview rows={f.filtered} onOpenProject={openProject} />}
          {tab === "people" && <People rows={f.filtered} total={total} search={search} onOpenPerson={openPerson} />}
          {tab === "projects" && <Projects rows={f.filtered} total={total} search={search} onOpenProject={openProject} />}
          {tab === "cumulative" && <Cumulative rows={f.filtered} />}
        </>
      )}
    </div>
  );
}
