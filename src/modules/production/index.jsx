/**
 * Production — the schedule: what is being poured, on which bed, on which day.
 *
 * The report is forward-looking: these are pours that are *scheduled*. The UI
 * says "scheduled" throughout and never claims anything was produced.
 *
 * Two things that used to live here have moved out, because they were different
 * jobs sharing a tab row: the missing-ticket queue is now its own **Drawings**
 * section, and the per-job roll-up is part of **Projects**. What the ticket
 * report still does here is mark the board — a scheduled piece with no drawing
 * gets flagged where the scheduler is already looking.
 *
 * The datasets themselves are held app-wide (src/app/AppData.jsx). They are the
 * same three records under the same keys; they are just no longer private to
 * this module, which is what lets the job page and Home speak about them too.
 */
import React, { useMemo, useState } from "react";
import { useAppData } from "../../core/appData.js";
import { sumBy } from "../../core/aggregate.js";
import { PageHeader, RouteTabs } from "../../components/Page.jsx";
import { ImportButton, ImportPrompt } from "../../components/FileImport.jsx";
import { FilterBar } from "../../components/Filters.jsx";
import { SourceStrip, SourceRow, RemoveButton } from "../../components/SourceStrip.jsx";
import { NoProjectsYet } from "../../components/MyProjects.jsx";
import { SCOPE_ALL } from "../../core/myProjects.js";
import { VERBS } from "../../app/sources.js";
import { hrefFor, go } from "../../core/routing.js";
import { count, ago } from "../../core/format.js";
import { tabsFor } from "../sections.js";
import schema from "./schema.js";
import { useProductionFilters } from "./useProductionFilters.js";
import PlanningBoard from "./views/PlanningBoard.jsx";
import Schedule from "./views/Schedule.jsx";
import Overview from "./views/Overview.jsx";
import Beds from "./views/Beds.jsx";
import Pieces from "./views/Pieces.jsx";
import Movement from "./views/Movement.jsx";
import BaselineBar from "./views/BaselineBar.jsx";

export default function ProductionModule({ tab }) {
  const app = useAppData();
  const mine = app.mine;
  const f = useProductionFilters(app.schedule.rows, mine);
  const [search, setSearch] = useState("");

  const counts = useMemo(() => ({
    beds: new Set(f.filtered.map((r) => r.bedKey)).size,
    pieces: sumBy(f.filtered, (r) => r.qty),
  }), [f.filtered]);

  const scopedMoved = useMemo(
    () => app.diff.moved.filter((e) => !mine.active || mine.members.has(e.row.jobNo)),
    [app.diff.moved, mine.active, mine.members]
  );

  if (!app.schedule.rows.length) {
    return (
      <ImportPrompt
        schema={schema}
        title="Production"
        blurb="Upload a Concrete Vision Scheduled Production Report — a month of scheduled pours, bed by bed."
        onLoaded={app.schedule.load}
      />
    );
  }

  // Board and Calendar own the plant picker (it drives what they render), so
  // the shared filter row leaves plant out there to avoid two controls for one
  // thing. Schedule Changes is scoped by job, not by bed or day.
  const ownsPlant = tab === "board" || tab === "calendar";
  const isChanges = tab === "changes";
  const searchable = tab === "beds" || tab === "pieces";

  const stranded = mine.active
    ? mine.memberList.filter((n) => !app.scheduledJobNos.has(n))
    : [];

  const scopedDiff = {
    ...app.diff,
    moved: scopedMoved,
    added: app.diff.added.filter((e) => !mine.active || mine.members.has(e.row.jobNo)),
    removed: app.diff.removed.filter((e) => !mine.active || mine.members.has(e.prev.jobNo)),
  };

  return (
    <div>
      <PageHeader
        title="Production"
        subtitle={
          app.schedule.meta?.fileName
            ? `${app.schedule.meta.fileName} — modified ${app.schedule.meta.fileDate} (${ago(app.schedule.meta.fileDate)}) — ${count(app.schedule.rows.length)} scheduled rows`
            : `${count(app.schedule.rows.length)} scheduled rows`
        }
        actions={
          <>
            <ImportButton schema={schema} onLoaded={app.schedule.load} label={VERBS.replace} />
            <RemoveButton onRemove={app.schedule.clear} what="the schedule" label={VERBS.remove} ghost={false} />
          </>
        }
      />

      {app.schedule.persistWarning && <div className="notice amber">{app.schedule.persistWarning}</div>}

      {app.schedule.meta?.warnings?.length > 0 && (
        <details style={{ marginBottom: 12, fontSize: 11 }}>
          <summary className="muted" style={{ cursor: "pointer" }}>
            {app.schedule.meta.warnings.length} import note(s)
          </summary>
          <ul style={{ margin: "6px 0 0 18px", color: "var(--text-secondary)", lineHeight: 1.7 }}>
            {app.schedule.meta.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </details>
      )}

      {/* Shown on every tab: the board is quietly drawing movement chips from
          this, and a reader has to be able to see what "moved 3 days" is
          measured from without hunting for it. */}
      {app.diff.ready && (
        <BaselineBar meta={app.baseline.meta} stats={app.diff.stats} onDiscard={app.baseline.clear} />
      )}

      <RouteTabs
        section="production"
        tabs={tabsFor("production")}
        active={tab}
        counts={{ beds: counts.beds, changes: app.diff.ready ? scopedMoved.length : undefined }}
        // Nothing to compare against yet, and an empty tab reads as a broken one.
        hidden={app.diff.ready ? [] : ["changes"]}
      />

      <FilterBar
        range={isChanges ? undefined : f.range}
        dateFrom={f.dateFrom} dateTo={f.dateTo}
        onFrom={f.setDateFrom} onTo={f.setDateTo}
        dimensions={
          isChanges
            ? []
            : [
                ...(ownsPlant ? [] : [{ id: "plant", label: "Plants", value: f.plant, options: f.plants, onChange: f.setPlant }]),
                { id: "job", label: "Jobs", value: f.job, options: f.jobs, onChange: f.setJob },
              ]
        }
        dirty={f.dirty}
        onClear={f.clear}
        search={searchable ? search : undefined}
        onSearch={searchable ? setSearch : undefined}
        searchPlaceholder={tab === "beds" ? "Search beds…" : "Search marks, jobs, beds…"}
      />

      {mine.scope !== SCOPE_ALL && !mine.count ? (
        <NoProjectsYet onShowAll={() => mine.setScope(SCOPE_ALL)} />
      ) : (
        <>
          {stranded.length > 0 && (
            <div className="notice amber">
              {stranded.length} of your {mine.count} starred projects{" "}
              {stranded.length === 1 ? "is" : "are"} not in the loaded schedule
              ({stranded.slice(0, 8).join(", ")}{stranded.length > 8 ? "…" : ""}) — nothing
              is scheduled for them in this export. They stay in your list.
            </div>
          )}

          {(tab === "board" || !tab) && (
            <PlanningBoard rows={f.filtered} plant={f.plant} plants={f.plants} onPlant={f.setPlant}
                           tickets={app.tickets.index} movement={app.diff.ready ? app.diff.byRow : null} />
          )}
          {tab === "calendar" && (
            <Schedule rows={f.filtered} plant={f.plant} plants={f.plants} onPlant={f.setPlant} />
          )}
          {tab === "overview" && (
            <Overview rows={f.filtered} onOpenJob={(job) => f.setJob(job)} />
          )}
          {tab === "beds" && <Beds rows={f.filtered} search={search} />}
          {tab === "pieces" && <Pieces rows={f.filtered} search={search} />}
          {tab === "changes" && (
            <Movement
              diff={scopedDiff}
              baselineMeta={app.baseline.meta}
              currentMeta={app.schedule.meta}
              mine={mine}
              onOpenJob={(jobNo) => go("job", jobNo)}
            />
          )}

          {(tab === "board" || !tab) && !app.tickets.rows.length && (
            <p className="hint">
              No ticket report is loaded, so no card can be marked as missing its drawing.{" "}
              <a className="link" href={hrefFor("sources")}>Add the Missing Piece Mark Ticket
              report</a> and the board flags them.
            </p>
          )}

          <p className="hint">
            Looking for a job's totals? Every job across cost, schedule and drawings is on{" "}
            <a className="link" href={hrefFor("projects", "jobs")}>Projects</a>.
          </p>
        </>
      )}
    </div>
  );
}
