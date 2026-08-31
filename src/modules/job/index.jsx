/**
 * The Job page — one project, every source, one address.
 *
 * This is the page the application was missing. A job was previously scattered
 * across four screens with one lossy link between them: job cost could jump to
 * `#/production` and the job was forgotten on arrival. Now every job number in
 * every table in the app links here, and the URL carries the job.
 *
 * The arithmetic is in assemble.js so it can be tested in node; this file is
 * presentation only. Every section states its source and its as-of, because the
 * figures are not comparable: cost is cumulative to date, the schedule is a
 * forward month, the ticket report is a snapshot.
 */
import React from "react";
import { useAppData } from "../../core/appData.js";
import { assembleJob } from "./assemble.js";
import { PageHeader, RouteTabs } from "../../components/Page.jsx";
import { Panel, StatCard, Badge, BackLink } from "../../components/ui.jsx";
import { StarButton } from "../../components/MyProjects.jsx";
import { hrefFor, go } from "../../core/routing.js";
import { money, ratio, count, fmt, perSf, sqft } from "../../core/format.js";
import { tabsFor } from "../sections.js";
import JobDetail from "../job-cost/views/JobDetail.jsx";

export default function JobPage({ params, tab }) {
  const app = useAppData();
  const jobNo = params[0] || "";

  const job = assembleJob({
    jobNo,
    costJobs: app.cost.data.jobs,
    scheduleRows: app.schedule.rows,
    ticketRows: app.tickets.rows,
    timeRows: app.time.rows,
    diff: app.diff,
    loaded: {
      cost: app.costLib.sources.length > 0,
      schedule: app.schedule.rows.length > 0,
      drawings: app.tickets.rows.length > 0,
      time: app.time.rows.length > 0,
    },
  });

  const known = job.cost || job.schedule || job.drawings.pieces || job.hours.rows.length;

  return (
    <div className="jc">
      <BackLink onClick={() => go("projects", "jobs")}>All projects</BackLink>

      <PageHeader
        title={jobNo || "No job selected"}
        subtitle={
          job.title
            ? `${job.title}${job.cost ? ` · ${job.cost.plants.join(", ")}` : job.schedule ? ` · ${job.schedule.plants.join(", ")}` : ""}`
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
            whose report isn't imported, or scheduled in a month this export doesn't cover.
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

/** The four sources, each on its own terms, never added together. */
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
        title="Schedule"
        source="Scheduled Production Report"
        asOf={job.schedule ? `${job.schedule.range.min} → ${job.schedule.range.max}` : ""}
        note="Forward-looking — pours that are scheduled, not produced."
        loaded={job.loaded.schedule}
        present={Boolean(job.schedule)}
        missingFile="the Scheduled Production Report"
        absent="Nothing is scheduled for this job in the loaded export."
        action={job.schedule && <a className="btn ghost" href={hrefFor("production", "board")}>Open the board</a>}
      >
        {job.schedule && (
          <>
            <div className="cards">
              <StatCard label="Pieces Scheduled" value={count(job.schedule.pieces)} />
              <StatCard label="SF Scheduled" value={count(Math.round(job.schedule.sf))} />
              <StatCard label="Cubic Yards" value={fmt(job.schedule.cy)} />
              <StatCard label="Beds" value={job.schedule.beds} small />
              <StatCard label="Pour Days" value={job.schedule.days} small />
            </div>
            {job.movement && (job.movement.moved.length || job.movement.added.length || job.movement.removed.length) ? (
              <p className="hint">
                Since the previous upload:{" "}
                <strong style={{ color: "var(--warning)" }}>{job.movement.moved.length} moved</strong>,{" "}
                {job.movement.added.length} new, {job.movement.removed.length} dropped —{" "}
                <a className="link" href={hrefFor("production", "changes")}>see what changed</a>.
              </p>
            ) : job.movement ? (
              <p className="hint">Nothing on this job moved since the previous upload.</p>
            ) : null}
          </>
        )}
      </SourceSection>

      <SourceSection
        title="Drawings"
        source="Missing Piece Mark Ticket report"
        asOf={job.drawings.range.min ? `bed dates ${job.drawings.range.min} → ${job.drawings.range.max}` : ""}
        note="Pieces with no ticket drawing."
        loaded={job.loaded.drawings}
        present={job.drawings.pieces > 0}
        missingFile="the Missing Piece Mark Ticket report"
        absent={
          job.loaded.drawings
            ? "This job has no pieces in the ticket report — either fully drawn, or outside the range it was run over."
            : ""
        }
        action={job.drawings.pieces > 0 && <a className="btn ghost" href={hrefFor("drawings", "jobs")}>Open the queue</a>}
      >
        {job.drawings.pieces > 0 && (
          <div className="cards">
            <StatCard label="Pieces missing a ticket" value={count(job.drawings.pieces)} />
            <StatCard label="No drafter assigned" value={count(job.drawings.unassigned)} />
            <StatCard label="Earliest bed date" value={job.drawings.range.min || "—"} small />
          </div>
        )}
      </SourceSection>

      <SourceSection
        title="Hours"
        source="Employee time export"
        asOf={job.hours.range.min ? `${job.hours.range.min} → ${job.hours.range.max}` : ""}
        note="Matched by job number found in the timesheet's job name — a guess, not a confirmed join."
        loaded={job.loaded.time}
        present={job.hours.rows.length > 0}
        missingFile="the employee time export"
        absent={job.loaded.time ? "No timesheet rows name this job number." : ""}
        action={job.hours.rows.length > 0 && <a className="btn ghost" href={hrefFor("time", "jobs")}>Open Time</a>}
      >
        {job.hours.rows.length > 0 && (
          <>
            <div className="cards">
              <StatCard label="Hours" value={fmt(job.hours.hours)} />
              <StatCard label="People" value={job.hours.people} small />
            </div>
            <div className="notice amber">
              <strong>This match is not verified.</strong> The employee time export has never been
              profiled against a real file, so its job field is free text with no confirmed job
              number in it. These rows were matched because{" "}
              <strong>{job.jobNo}</strong> appears in their job name
              {job.hours.names.length > 0 && <> ({job.hours.names.slice(0, 3).join("; ")}{job.hours.names.length > 3 ? "…" : ""})</>}
              . Do not read these hours against the cost figures above.
            </div>
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
          production={app.scheduledJobNos.has(rec.jobNo)}
          mine={app.mine}
          onBack={() => go("job", job.jobNo)}
          onOpenProduction={() => go("production", "board")}
        />
      ))}
    </>
  );
}
