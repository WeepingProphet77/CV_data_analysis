/**
 * Time — analysis of Concrete Vision's timesheet export.
 *
 * The one caveat worth repeating wherever this module is touched: unlike the
 * others, its schema was derived from the legacy single-file tool rather than
 * profiled against a real export (CLAUDE.md §12). The column names are believed
 * right and the aliases absorb drift, but nobody has checked.
 *
 * That is also why this section does **not** take part in the app-wide My
 * Projects scope. Membership is keyed on the job number, and this export's job
 * field is free text with no confirmed number in it — scoping on a guess would
 * silently hide rows. The section says so rather than pretending. Profiling a
 * real export is what unblocks it.
 */
import React, { useMemo, useState } from "react";
import { useAppData } from "../../core/appData.js";
import { sumBy } from "../../core/aggregate.js";
import { PageHeader, RouteTabs } from "../../components/Page.jsx";
import { ImportPrompt, ImportButton } from "../../components/FileImport.jsx";
import { RemoveButton } from "../../components/SourceStrip.jsx";
import { FilterBar } from "../../components/Filters.jsx";
import { VERBS } from "../../app/sources.js";
import { hrefFor, go } from "../../core/routing.js";
import { count } from "../../core/format.js";
import { tabsFor } from "../sections.js";
import schema from "./schema.js";
import { useTimeFilters } from "./useTimeFilters.js";
import Overview from "./views/Overview.jsx";
import People from "./views/People.jsx";
import Projects from "./views/Projects.jsx";
import Cumulative from "./views/Cumulative.jsx";
import PersonDetail from "./views/PersonDetail.jsx";
import ProjectDetail from "./views/ProjectDetail.jsx";

export default function TimeModule({ tab, route }) {
  const app = useAppData();
  const data = app.time;
  const f = useTimeFilters(data.rows);
  const [search, setSearch] = useState("");

  const total = useMemo(() => sumBy(f.filtered, (r) => r.hrs), [f.filtered]);
  const peopleCount = useMemo(() => new Set(f.filtered.map((r) => r.name)).size, [f.filtered]);
  const jobCount = useMemo(() => new Set(f.filtered.map((r) => r.job)).size, [f.filtered]);

  if (!data.rows.length) {
    return (
      <ImportPrompt
        schema={schema}
        title="Time"
        blurb="Upload a Concrete Vision employee time export — hours by person, job, task and date."
        onLoaded={data.load}
      />
    );
  }

  // Drill-downs are addressed, not held in state: #/time/person/<name> and
  // #/time/job/<name>. That makes them linkable, and it makes the browser Back
  // button leave a drill-down instead of leaving the app.
  const [kind, ...idParts] = route?.rest ?? [];
  const drillId = idParts.join("/");
  const openPerson = (name) => go("time", "person", name);
  const openJob = (name) => go("time", "job", name);
  const backToList = () => go("time", kind === "person" ? "people" : "jobs");

  if (kind === "person" && drillId) {
    return (
      <PersonDetail name={drillId} rows={f.filtered} onBack={backToList} onOpenProject={openJob} />
    );
  }
  if (kind === "job" && drillId) {
    return (
      <ProjectDetail job={drillId} rows={f.filtered} onBack={backToList} onOpenPerson={openPerson} />
    );
  }

  const searchable = tab === "people" || tab === "jobs";

  return (
    <div>
      <PageHeader
        title="Time"
        subtitle={
          data.meta?.fileName
            ? `${data.meta.fileName} — exported ${data.meta.fileDate} — ${count(data.rows.length)} entries`
            : `${count(data.rows.length)} entries`
        }
        actions={
          <>
            <ImportButton schema={schema} onLoaded={data.load} label={VERBS.replace} />
            <RemoveButton onRemove={data.clear} what="the timesheet export" label={VERBS.remove} ghost={false} />
          </>
        }
      />

      {data.persistWarning && <div className="notice amber">{data.persistWarning}</div>}

      {data.meta?.warnings?.length > 0 && (
        <details style={{ marginBottom: 12, fontSize: 11 }}>
          <summary className="muted" style={{ cursor: "pointer" }}>
            {data.meta.warnings.length} import note(s)
          </summary>
          <ul style={{ margin: "6px 0 0 18px", color: "var(--text-secondary)", lineHeight: 1.7 }}>
            {data.meta.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </details>
      )}

      <RouteTabs
        section="time"
        tabs={tabsFor("time")}
        active={tab}
        counts={{ people: peopleCount, jobs: jobCount }}
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
        search={searchable ? search : undefined}
        onSearch={searchable ? setSearch : undefined}
        searchPlaceholder={tab === "people" ? "Search people…" : "Search jobs…"}
      />

      {tab === "people" && (
        <People rows={f.filtered} total={total} search={search} onOpenPerson={openPerson} />
      )}
      {tab === "jobs" && (
        <>
          <Projects rows={f.filtered} total={total} search={search} onOpenProject={openJob} />
          <p className="hint">
            These are job <em>names</em> exactly as typed on timesheets. They are not matched to
            job numbers, so this list does not join to{" "}
            <a className="link" href={hrefFor("projects", "jobs")}>Projects</a> — the export has
            never been checked against a real file, and guessing the key would hide rows rather
            than miss them visibly.
          </p>
        </>
      )}
      {tab === "cumulative" && <Cumulative rows={f.filtered} />}
      {(tab === "overview" || !tab) && <Overview rows={f.filtered} onOpenProject={openJob} />}
    </div>
  );
}
