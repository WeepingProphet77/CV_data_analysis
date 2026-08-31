/**
 * Time — analysis of Concrete Vision's timesheet export.
 *
 * Profiled against a real export on 2026-08-31, which closed the last standing
 * caveat in the app: the schema was right, and `Job Name` carries the job
 * number in the same shape the schedule uses. So these hours join to cost, to
 * the schedule and to the ticket report on the job number like everything else,
 * and this section takes part in the app-wide My Projects scope (§12, §14).
 */
import React, { useMemo, useState } from "react";
import { useAppData } from "../../core/appData.js";
import { sumBy } from "../../core/aggregate.js";
import { PageHeader, RouteTabs } from "../../components/Page.jsx";
import { ImportPrompt, ImportButton } from "../../components/FileImport.jsx";
import { RemoveButton } from "../../components/SourceStrip.jsx";
import { FilterBar } from "../../components/Filters.jsx";
import { NoProjectsYet } from "../../components/MyProjects.jsx";
import { SCOPE_ALL } from "../../core/myProjects.js";
import { VERBS } from "../../app/sources.js";
import { hrefFor, go } from "../../core/routing.js";
import { count, ago } from "../../core/format.js";
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
  const mine = app.mine;
  const data = app.time;
  const f = useTimeFilters(data.rows, mine);
  const [search, setSearch] = useState("");

  const total = useMemo(() => sumBy(f.filtered, (r) => r.hrs), [f.filtered]);
  const peopleCount = useMemo(() => new Set(f.filtered.map((r) => r.name)).size, [f.filtered]);
  const jobCount = useMemo(() => new Set(f.filtered.map((r) => r.job)).size, [f.filtered]);

  // Starred jobs nobody has booked time to. Reported, never pruned (§14).
  const bookedJobNos = useMemo(
    () => new Set(data.rows.map((r) => r.jobNo).filter(Boolean)),
    [data.rows]
  );
  const stranded = mine.active
    ? mine.memberList.filter((n) => !bookedJobNos.has(n))
    : [];

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
            ? `${data.meta.fileName} — modified ${data.meta.fileDate} (${ago(data.meta.fileDate)}) — ${count(data.rows.length)} entries`
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

      {mine.scope !== SCOPE_ALL && !mine.count ? (
        <NoProjectsYet onShowAll={() => mine.setScope(SCOPE_ALL)} />
      ) : (
        <>
          {stranded.length > 0 && (
            <div className="notice amber">
              {stranded.length} of your {mine.count} starred projects{" "}
              {stranded.length === 1 ? "has" : "have"} no hours booked to them
              ({stranded.slice(0, 8).join(", ")}{stranded.length > 8 ? "…" : ""}) — nobody has
              charged time to them in this export. They stay in your list.
            </div>
          )}

          {tab === "people" && (
            <People rows={f.filtered} total={total} search={search} onOpenPerson={openPerson} />
          )}
          {tab === "jobs" && (
            <>
              <Projects rows={f.filtered} total={total} search={search} onOpenProject={openJob}
                        onOpenJobNo={(jobNo) => go("job", jobNo)} />
              <p className="hint">
                Every job here carries its number, so clicking through to the whole project —
                cost, schedule and drawings alongside these hours — works from{" "}
                <a className="link" href={hrefFor("projects", "jobs")}>Projects</a> or from the
                arrow on any row.
              </p>
            </>
          )}
          {tab === "cumulative" && <Cumulative rows={f.filtered} />}
          {(tab === "overview" || !tab) && <Overview rows={f.filtered} onOpenProject={openJob} />}
        </>
      )}
    </div>
  );
}
