/**
 * Home — the front door.
 *
 * The app used to open on a module, which meant a first-time viewer landed
 * mid-way inside one subsection of it, facing a dropzone for a file they may
 * not have, with four unexplained words in the nav and no statement of what any
 * of it was for. This page answers the three questions in order: what is this,
 * what is loaded, and where do I start.
 *
 * It also carries the warnings that belong to the whole app rather than to one
 * tab — a ticket report that doesn't cover the schedule, plants exported on
 * different dates — because those change how every number below them should be
 * read (CLAUDE.md §11, §13).
 */
import React from "react";
import { useAppData } from "../../core/appData.js";
import { describeSources, VERBS } from "../../app/sources.js";
import { PageHeader } from "../../components/Page.jsx";
import { Panel, Badge } from "../../components/ui.jsx";
import { hrefFor } from "../../core/routing.js";
import { count, ago } from "../../core/format.js";

/**
 * The entry points, as tasks rather than as module names, each stating the file
 * it needs. An entry whose file is missing is still shown — learning that the
 * app can do this, and which export to run for it, is the whole point.
 */
const TASKS = [
  {
    label: "Plan the week's pours",
    detail: "The bed × day planning board, with missing drawings and schedule slips marked on the cards.",
    href: hrefFor("production", "board"),
    needs: ["schedule"],
  },
  {
    label: "Find pieces with no drawing",
    detail: "Every piece missing its ticket, ordered by how soon it is cast.",
    href: hrefFor("drawings", "queue"),
    needs: ["tickets"],
  },
  {
    label: "See what moved since last week",
    detail: "Each schedule upload compared against the one it replaced — moved, added, dropped.",
    href: hrefFor("production", "changes"),
    needs: ["schedule"],
  },
  {
    label: "Check margin across the portfolio",
    detail: "Contract, billing, forecast margin and $/SF, by plant and by job.",
    href: hrefFor("cost", "portfolio"),
    needs: ["cost"],
  },
  {
    label: "Look up one job",
    detail: "Cost, schedule, drawings and hours for a single project, on one page.",
    href: hrefFor("projects", "jobs"),
    needs: ["cost", "schedule"],
  },
  {
    label: "See where hours are going",
    detail: "Timesheet hours by person, job and task, with cumulative burn.",
    href: hrefFor("time", "overview"),
    needs: ["time"],
  },
];

export default function Home() {
  const app = useAppData();
  const sources = describeSources(app);
  const have = new Set(sources.filter((s) => s.loaded).map((s) => s.id));
  const loadedCount = have.size;

  return (
    <div>
      <PageHeader
        title="CV Data Analysis"
        subtitle="Concrete Vision and job cost reports, read in your browser"
      />

      <p style={{ color: "var(--text-secondary)", lineHeight: 1.9, maxWidth: 700, marginBottom: 18 }}>
        Export a report, drop it on this page, and read it. Everything is parsed and stored
        <strong> in this browser only</strong> — there is no server, nothing is uploaded, and
        nothing leaves your machine. Your files stay loaded between visits.
      </p>

      <Panel
        title={`Loaded here (${loadedCount} of ${sources.length})`}
        actions={<a className="btn ghost" href={hrefFor("sources")}>Manage files</a>}
      >
        <div className="srclist">
          {sources.map((s) => (
            <div className="srcrow" key={s.id}>
              <span className="srcplant">{s.label}</span>
              {s.loaded
                ? <Badge tone={s.warn || s.stale ? "amber" : "blue"}>
                    {s.warn ? "check this" : s.stale ? "may be stale" : "loaded"}
                  </Badge>
                : <Badge tone="gray">not loaded</Badge>}
              <span className="muted">
                {s.loaded ? s.detail : s.file}
              </span>
              {/* How old the copy is — the question asked most often of this
                  strip, so it sits in the strip rather than one click away. */}
              <span className="muted nowrap"
                    style={s.stale ? { color: "var(--warning)", fontWeight: 700 } : undefined}
                    title={s.modified ? `File last modified ${s.modified}` : undefined}>
                {s.loaded
                  ? (s.modified ? `modified ${s.modified} · ${ago(s.modified)}` : "modified date unknown")
                  : ""}
              </span>
              <span className="muted" title={s.fileName}
                    style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.loaded ? s.fileName : ""}
              </span>
              <a className="btn ghost" href={hrefFor("sources")}>
                {s.loaded ? VERBS.replace : VERBS.add}
              </a>
            </div>
          ))}
        </div>

        {/* The warnings that change how every figure below should be read.
            They belong at the top of the app, not inside the one tab that
            happens to compute them. */}
        {sources.filter((s) => s.loaded && s.warn).map((s) => (
          <div className="notice amber" key={s.id}>
            <strong>{s.label}:</strong> {s.warn}
          </div>
        ))}

        {sources.some((s) => s.loaded && s.stale) && (
          <div className="notice amber">
            <strong>Some files are getting old.</strong>{" "}
            {sources.filter((s) => s.loaded && s.stale)
              .map((s) => `${s.label} (${ago(s.modified)})`).join(", ")}
            . <a className="link" href={hrefFor("sources")}>Replace them</a> if the figures
            need to be current.
          </div>
        )}
      </Panel>

      <Panel title="Start here">
        <div className="tasklist">
          {TASKS.map((t) => {
            const missing = t.needs.filter((n) => !have.has(n));
            const ready = missing.length === 0;
            return (
              <a className={`taskcard${ready ? "" : " pending"}`} href={t.href} key={t.label}>
                <span className="taskname">{t.label}</span>
                <span className="taskdetail">{t.detail}</span>
                <span className="taskneeds">
                  {ready ? (
                    <Badge tone="blue">ready</Badge>
                  ) : (
                    <>
                      <Badge tone="gray">needs</Badge>{" "}
                      {missing.map((m) => sources.find((s) => s.id === m)?.label).join(" + ")}
                    </>
                  )}
                </span>
              </a>
            );
          })}
        </div>
      </Panel>

      {app.mine.count > 0 && (
        <Panel title={`My Projects (${app.mine.count})`}>
          <p className="hint" style={{ marginBottom: 10 }}>
            The switch in the header narrows every section to these. The list is saved in this
            browser and is never pruned against the loaded files — a starred job whose plant
            isn't imported is still a project you picked.
          </p>
          <div>
            {app.mine.memberList.map((n) => (
              <a className="badge blue" key={n} href={hrefFor("job", n)} style={{ textDecoration: "none" }}>
                {n}
              </a>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Not built yet">
        <p className="hint" style={{ lineHeight: 1.9, marginBottom: 10 }}>
          <strong style={{ color: "var(--text-secondary)" }}>Plan vs actual.</strong> Concrete
          Vision's scheduling export would give planned against actual dates, slip by job and
          phase, weekly load against capacity, and a cross-link to timesheet hours. It would
          arrive as a tab under Production.
        </p>
        <div className="section-label">Expected export columns (to confirm)</div>
        <div>
          {["Job Name", "Phase / Activity", "Scheduled Start", "Scheduled Finish",
            "Actual Start", "Actual Finish", "Crew / Resource", "Status"].map((c) => (
            <span className="badge" key={c}>{c}</span>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          That column list is a guess and has not been checked against a real export.
        </p>
      </Panel>

      <p className="hint">
        {count(app.schedule.rows.length)} scheduled rows · {count(app.tickets.rows.length)} pieces
        missing a ticket · {count(app.cost.data.jobs.length)} costed jobs ·{" "}
        {count(app.time.rows.length)} timesheet entries currently in this browser.
      </p>
    </div>
  );
}
