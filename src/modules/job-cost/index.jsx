/**
 * Cost — the weekly job cost reports, one workbook per plant.
 *
 * These come from a different system than Concrete Vision, but they describe
 * the same jobs, which is what makes the join possible (on the job **number**,
 * never the name).
 *
 * Two things that were tabs here have moved: the job table and the
 * cost-versus-schedule comparison are both about the *job population* rather
 * than about money, so they live in **Projects** with the schedule columns
 * beside them. What stays is the analysis the source system cannot give them:
 * a portfolio roll-up, a cross-job cost-code view, and the D&E dashboard.
 *
 * The library itself is app-wide now (src/app/AppData.jsx) — same record, same
 * one-entry-per-plant shape. It has to be, because Projects and the job page
 * read it too.
 */
import React, { useMemo } from "react";
import { useAppData } from "../../core/appData.js";
import { useJobCostFilters } from "./useJobCost.js";
import { PageHeader, RouteTabs } from "../../components/Page.jsx";
import { FilterBar } from "../../components/Filters.jsx";
import { SourceStrip, SourceRow, RemoveButton } from "../../components/SourceStrip.jsx";
import { NoProjectsYet } from "../../components/MyProjects.jsx";
import { SCOPE_ALL, SCOPE_MINE } from "../../core/myProjects.js";
import { VERBS } from "../../app/sources.js";
import { hrefFor, go } from "../../core/routing.js";
import { count, ago } from "../../core/format.js";
import { tabsFor } from "../sections.js";
import { categoryOptions } from "./categories.js";
import { SourceDrop } from "./views/SourceLibrary.jsx";
import Portfolio from "./views/Portfolio.jsx";
import CostCodes from "./views/CostCodes.jsx";
import Engineering from "./views/Engineering.jsx";

/** Cost views address a job by its plant-scoped key; the app addresses it by number. */
const openJob = (key) => go("job", String(key).split("|")[1] || key);

export default function CostModule({ tab }) {
  const app = useAppData();
  const mine = app.mine;
  const data = app.cost.data;
  const f = useJobCostFilters(data, mine);

  const categories = useMemo(
    () => ["All", ...categoryOptions().map((c) => c.label)],
    []
  );

  if (!app.costLib.sources.length) return <SourceDrop onSource={app.costLib.upsert} />;

  const loadedJobNos = new Set(data.jobs.map((j) => j.jobNo));
  const missingFromLibrary = mine.active
    ? mine.memberList.filter((n) => !loadedJobNos.has(n))
    : [];

  return (
    <div className="jc">
      <PageHeader
        title="Cost"
        subtitle={
          `${count(data.jobs.length)} active jobs across ${app.costLib.sources.length} plant` +
          `${app.costLib.sources.length === 1 ? "" : "s"}` +
          (data.asOfRange.max
            ? data.mixedAsOf
              ? ` — as of ${data.asOfRange.min} to ${data.asOfRange.max}`
              : ` — as of ${data.asOfRange.max}`
            : "")
        }
        actions={
          <>
            <SourceDrop onSource={app.costLib.upsert} compact />
            <RemoveButton onRemove={app.costLib.clear} what="every plant's cost report"
                          label={VERBS.removeAll} ghost={false} />
          </>
        }
      />

      <SourceStrip>
        {app.costLib.sources.map((s) => (
          <SourceRow
            key={s.id}
            name={s.plant}
            badge={`as of ${s.asOf || "unknown"}`}
            // A plant refreshed later than another is the trap this strip
            // exists to prevent: comparing plants across different cut-offs.
            badgeTone={data.mixedAsOf && s.asOf !== data.asOfRange.max ? "amber" : "blue"}
            badgeTitle={
              data.mixedAsOf && s.asOf !== data.asOfRange.max
                ? `Older than the newest report loaded (${data.asOfRange.max})`
                : "Report cut-off date"
            }
            // Two dates, deliberately distinct: the badge carries the report's
            // own cut-off, this carries how old the file is.
            detail={
              `${count(s.jobs.length)} jobs · modified ` +
              (s.fileDate ? `${s.fileDate} (${ago(s.fileDate)})` : "unknown")
            }
            fileName={s.fileName}
            actions={<RemoveButton onRemove={() => app.costLib.remove(s.id)} what={s.plant} />}
          />
        ))}
      </SourceStrip>

      {data.mixedAsOf && (
        <div className="notice amber">
          Plants were exported on different dates ({data.asOfRange.min} — {data.asOfRange.max}).
          Company-wide totals mix those cut-offs; refresh the older plants before reading them as
          one number.
        </div>
      )}

      {app.costLib.persistWarning && <div className="notice amber">{app.costLib.persistWarning}</div>}

      <RouteTabs section="cost" tabs={tabsFor("cost")} active={tab} />

      <FilterBar
        dimensions={[
          { id: "plant", label: "Plants", value: f.plant, options: f.plants, onChange: f.setPlant },
          { id: "job", label: "Jobs", value: f.job, options: f.jobOptions, onChange: f.setJob },
          // Category slices cost lines, so it only means anything where cost
          // lines are what is on screen.
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

      {mine.scope !== SCOPE_ALL && !mine.count ? (
        <NoProjectsYet onShowAll={() => mine.setScope(SCOPE_ALL)} />
      ) : (
        <>
          {missingFromLibrary.length > 0 && (
            <div className="notice amber">
              {missingFromLibrary.length} of your {mine.count} starred projects{" "}
              {missingFromLibrary.length === 1 ? "is" : "are"} not in the loaded reports
              ({missingFromLibrary.slice(0, 8).join(", ")}
              {missingFromLibrary.length > 8 ? "…" : ""}) — that plant's file may not be
              imported. They stay in your list.
            </div>
          )}

          {tab === "engineering" && (
            <Engineering
              jobs={f.jobs}
              costs={data.costs}
              quantities={data.quantities}
              mine={mine}
              onOpenJob={openJob}
              onScopeToMine={() => mine.setScope(SCOPE_MINE)}
            />
          )}
          {tab === "codes" && (
            <CostCodes costs={f.codeCosts} jobs={f.pool} search={f.search} onOpenJob={openJob} />
          )}
          {(tab === "portfolio" || !tab) && (
            <Portfolio jobs={f.jobs} costs={f.costs} onOpenJob={openJob} />
          )}

          <p className="hint">
            The job table and the cost-versus-schedule comparison moved to{" "}
            <a className="link" href={hrefFor("projects", "jobs")}>Projects</a>, where the
            schedule columns sit beside them.
          </p>
        </>
      )}
    </div>
  );
}
