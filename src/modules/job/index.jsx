/**
 * The Job page — one project, every source, one address.
 *
 * This is the page the application was missing. A job was previously scattered
 * across several screens with one lossy link between them, and the job was
 * forgotten on arrival. Now every job number in every table in the app links
 * here, and the URL carries the job.
 *
 * The arithmetic is in assemble.js so it can be tested in node; this file is
 * presentation only. Every section states its source and its as-of, because the
 * figures are not comparable: cost is dollars to date, the timesheet is hours
 * over whatever window it was run for.
 */
import React from "react";
import { useAppData } from "../../core/appData.js";
import { assembleJob } from "./assemble.js";
import { PageHeader, RouteTabs } from "../../components/Page.jsx";
import { Panel, StatCard, Badge, BackLink } from "../../components/ui.jsx";
import { StarButton } from "../../components/MyProjects.jsx";
import { hrefFor, go } from "../../core/routing.js";
import { money, ratio, fmt, perSf, sqft } from "../../core/format.js";
import { tabsFor } from "../sections.js";
import JobDetail from "../job-cost/views/JobDetail.jsx";

export default function JobPage({ params, tab }) {
  const app = useAppData();
  const jobNo = params[0] || "";

  const job = assembleJob({
    jobNo,
    costJobs: app.cost.data.jobs,
    timeRows: app.time.rows,
    loaded: {
      cost: app.costLib.sources.length > 0,
      time: app.time.rows.length > 0,
    },
  });

  const known = job.cost || job.hours.rows.length;

  return (
    <div className="jc">
      <BackLink onClick={() => go("projects", "jobs")}>All projects</BackLink>

      <PageHeader
        title={jobNo || "No job selected"}
        subtitle={
          job.title
            ? `${job.title}${job.cost ? ` · ${job.cost.plants.join(", ")}` : ""}`
            : "Not found in any loaded source"
        }
        actions={
          jobNo && (
            <StarButton jobNo={jobNo} on={app.mine.isMember(jobNo)} onToggle={app.mine.toggle} size="lg" />
          )
        }
      />

      {!known ? (
        <div className="panel">
          <p className="muted" style={{ lineHeight: 1.8 }}>
            No loaded source mentions job <strong>{jobNo}</strong>. It may be costed at a plant
            whose report isn't imported, or have hours outside the timesheet's date range.
            {" "}<a className="link" href={hrefFor("sources")}>Check the loaded files</a>.
          </p>
        </div>
      ) : (
        <>
          <RouteTabs
            section="job"
            tabs={tabsFor("job")}
            active={tab}
            // The full report is only a tab when there is a report to show.
            hidden={job.cost ? [] : ["cost"]}
          />

          {tab === "cost" && job.cost ? (
            <FullCostReport app={app} job={job} />
          ) : (
            <Summary app={app} job={job} />
          )}
        </>
      )}
    </div>
  );
}

/** The two sources, each on its own terms, never added together. */
function Summary({ app, job }) {
  return (
    <>
      <SourceSection
        title="Cost"
        source="Weekly Job Cost Report"
        asOf={job.cost ? (job.cost.asOf.min === job.cost.asOf.max ? job.cost.asOf.max : `${job.cost.asOf.min} – ${job.cost.asOf.max}`) : ""}
        note="Cumulative to date."
        loaded={job.loaded.cost}
        present={Boolean(job.cost)}
        missingFile="the weekly Job Cost Report for this plant"
        absent="No cost report loaded mentions this job."
        action={job.cost && <a className="btn ghost" href={hrefFor("job", job.jobNo, "cost")}>Full cost report</a>}
      >
        {job.cost && (
          <>
            <div className="cards">
              <StatCard label="Net Contract" value={money(job.cost.netContract)} />
              <StatCard label="Actual Cost" value={money(job.cost.actCost)}
                        sub={job.cost.costProgress == null ? "—" : `${ratio(job.cost.costProgress)} of forecast`} />
              <StatCard label="Projected Cost" value={money(job.cost.projCost)} />
              <StatCard label="Est. OH & Profit" value={money(job.cost.margin)}
                        sub={job.cost.marginPct == null ? "margin at completion" : `${ratio(job.cost.marginPct)} margin at completion`} />
              <StatCard label="% Billed" value={job.cost.pctBilled == null ? "—" : ratio(job.cost.pctBilled)} small />
            </div>
            {job.cost.hasSf ? (
              <div className="cards">
                <StatCard label="Job Square Feet" value={sqft(job.cost.sfJob)} small />
                <StatCard label="Contract / SF" value={perSf(job.cost.contractPerSf)} small />
                <StatCard label="Forecast / SF" value={perSf(job.cost.forecastPerSf)} small />
                <StatCard label="Actual / SF" value={perSf(job.cost.actualPerSf)} small />
              </div>
            ) : (
              <p className="hint">
                This job reports no square footage, so every $/SF rate is unknown rather than zero.
              </p>
            )}
            {job.cost.records.length > 1 && (
              <p className="hint">
                Costed at {job.cost.records.length} plants ({job.cost.plants.join(", ")}). The
                figures above add those records; they are separate contracts, so read them per
                plant on the full report.
              </p>
            )}
          </>
        )}
      </SourceSection>

      <SourceSection
        title="Hours"
        source="Employee time export"
        asOf={job.hours.range.min ? `${job.hours.range.min} → ${job.hours.range.max}` : ""}
        note="Timesheet hours booked to this job, joined on the job number."
        loaded={job.loaded.time}
        present={job.hours.rows.length > 0}
        missingFile="the employee time export"
        absent={job.loaded.time ? "No timesheet hours are booked to this job." : ""}
        action={
          job.hours.rows.length > 0 &&
          <a className="btn ghost" href={hrefFor("time", "job", job.hours.rows[0].job)}>Open in Time</a>
        }
      >
        {job.hours.rows.length > 0 && (
          <>
            <div className="cards">
              <StatCard label="Hours" value={fmt(job.hours.hours)} />
              <StatCard label="People" value={job.hours.people} small />
              <StatCard label="Offices" value={job.hours.offices.join(", ") || "—"} small
                        sub="where the people sit, not the plant" />
            </div>

            {/* What the time went on. The cost report has D&E dollars per code
                but cannot say who spent the day, or on what. */}
            <div className="grid-2">
              <div>
                <div className="section-label">Hours by task</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Labor Task</th><th className="num">Hours</th><th className="num">Share</th></tr></thead>
                    <tbody>
                      {job.hours.byTask.slice(0, 8).map((t) => (
                        <tr key={t.key}>
                          <td>{t.key}</td>
                          <td className="num">{fmt(t.hrs)}</td>
                          <td className="num">{ratio(t.hrs / job.hours.hours)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <div className="section-label">Hours by person</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Name</th><th className="num">Hours</th><th className="num">Share</th></tr></thead>
                    <tbody>
                      {job.hours.byPerson.slice(0, 8).map((t) => (
                        <tr key={t.key} className="clickable" onClick={() => go("time", "person", t.key)}>
                          <td className="link">{t.key}</td>
                          <td className="num">{fmt(t.hrs)}</td>
                          <td className="num">{ratio(t.hrs / job.hours.hours)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* These are hours, not dollars. The cost report books D&E labor in
                its own 60.x lines, and the two are not the same measure -- one
                is time booked by people, the other is cost booked to codes. */}
            <p className="hint">
              Hours, not dollars, and not the same measure as the cost report's D&amp;E lines —
              those book cost to a code, these book time to a person. Shown side by side, never
              added.
            </p>
          </>
        )}
      </SourceSection>
    </>
  );
}

/**
 * A section per source, so "not loaded" and "loaded but says nothing about this
 * job" are visibly different states. Rendering zeros for either would be a lie.
 */
function SourceSection({ title, source, asOf, note, loaded, present, missingFile, absent, action, children }) {
  return (
    <Panel
      title={title}
      actions={
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="hint">{source}{asOf ? ` · ${asOf}` : ""}</span>
          {action}
        </span>
      }
    >
      {present ? (
        <>
          {children}
          <p className="hint">{note}</p>
        </>
      ) : loaded ? (
        <p className="muted" style={{ fontSize: 12 }}>{absent}</p>
      ) : (
        <p className="muted" style={{ fontSize: 12 }}>
          Not loaded — needs {missingFile}.{" "}
          <a className="link" href={hrefFor("sources")}>Add it</a>.
        </p>
      )}
    </Panel>
  );
}

/** The whole cost report for this job, reproduced — unchanged from before. */
function FullCostReport({ app, job }) {
  // A job number can be costed at more than one plant; each is its own report.
  return (
    <>
      {job.cost.records.map((rec) => (
        <JobDetail
          key={rec.key}
          job={rec}
          costs={app.cost.data.costsByJob.get(rec.key) || []}
          quantities={app.cost.data.qtyByJob.get(rec.key) || []}
          mine={app.mine}
          onBack={() => go("job", job.jobNo)}
          backLabel="Job summary"
        />
      ))}
    </>
  );
}
