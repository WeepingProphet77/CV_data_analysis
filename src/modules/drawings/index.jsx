/**
 * Drawings — the missing-ticket queue.
 *
 * Promoted out of Production, where it was the seventh of eight tabs. It is a
 * different job from planning the week and it is usually the first thing an
 * engineering manager wants, so it is a section rather than something to find.
 *
 * It reads the Missing Piece Mark Ticket report, and reads the schedule only to
 * say how far the two actually agree. That coverage notice is the reason this
 * module exists: the two reports are pulled over whatever ranges someone picked,
 * and when they don't overlap a board flagging nothing reads as "every piece is
 * drawn" and means the opposite (CLAUDE.md §11).
 */
import React, { useMemo, useState } from "react";
import { useAppData } from "../../core/appData.js";
import { PageHeader, RouteTabs, NeedsSource } from "../../components/Page.jsx";
import { StatCard } from "../../components/ui.jsx";
import { NoProjectsYet } from "../../components/MyProjects.jsx";
import { SCOPE_ALL } from "../../core/myProjects.js";
import { SourceStrip, SourceRow, RemoveButton } from "../../components/SourceStrip.jsx";
import { urgency } from "../production/tickets.js";
import { CoverageNotice, TicketDrop, TicketImportButton } from "../production/views/TicketImport.jsx";
import { count, dateToIso } from "../../core/format.js";
import { go, hrefFor } from "../../core/routing.js";
import { tabsFor } from "../sections.js";
import { VERBS } from "../../app/sources.js";
import Queue from "./views/Queue.jsx";
import ByJob from "./views/ByJob.jsx";
import ByDrafter from "./views/ByDrafter.jsx";

export default function DrawingsModule({ tab }) {
  const app = useAppData();
  const mine = app.mine;
  const [bucket, setBucket] = useState("all");
  const today = dateToIso(new Date());

  // My Projects narrows the ticket list on the same terms as everything else,
  // so a tab count can never disagree with what the table shows.
  const scoped = useMemo(
    () => (mine.active ? app.tickets.rows.filter((t) => mine.members.has(t.jobNo)) : app.tickets.rows),
    [app.tickets.rows, mine.active, mine.members]
  );

  const buckets = useMemo(() => urgency(scoped, today), [scoped, today]);

  const rows = useMemo(
    () => (bucket === "all" ? scoped : buckets.find((b) => b.id === bucket)?.rows ?? []),
    [scoped, buckets, bucket]
  );

  if (!app.tickets.rows.length) {
    return <TicketDrop onSource={app.tickets.load} />;
  }

  const unassigned = rows.filter((t) => !t.drawnBy).length;
  const scheduled = rows.filter((t) => app.scheduledJobNos.has(t.jobNo)).length;
  const openJob = (jobNo) => go("job", jobNo);

  return (
    <div>
      <PageHeader
        title="Drawings"
        subtitle={`${count(app.tickets.rows.length)} pieces with no ticket · ${count(app.tickets.source.jobs.length)} jobs`}
      />

      <SourceStrip>
        <SourceRow
          name="Missing tickets"
          badge={`${count(app.tickets.rows.length)} pieces`}
          badgeTone="amber"
          badgeTitle="Pieces with no ticket drawing"
          detail={
            app.tickets.source.range.min
              ? `bed dates ${app.tickets.source.range.min} → ${app.tickets.source.range.max}`
              : "no bed dates"
          }
          fileName={app.tickets.source.fileName}
          actions={
            <>
              <TicketImportButton onSource={app.tickets.load} label={VERBS.replace} ghost />
              <RemoveButton onRemove={app.tickets.clear} what="the ticket report" />
            </>
          }
        />
      </SourceStrip>

      {app.tickets.persistWarning && <div className="notice amber">{app.tickets.persistWarning}</div>}

      {/* The notice this section exists to show, on every tab. */}
      <CoverageNotice coverage={app.coverage} />

      {mine.scope !== SCOPE_ALL && !mine.count ? (
        <NoProjectsYet onShowAll={() => mine.setScope(SCOPE_ALL)} />
      ) : (
        <>
          <div className="cards">
            <StatCard label="Pieces missing a ticket" value={count(rows.length)}
                      sub={bucket === "all" ? `${new Set(rows.map((r) => r.jobNo)).size} jobs` : `of ${count(scoped.length)} in the report`} />
            <StatCard label="No drafter assigned" value={count(unassigned)}
                      sub={rows.length ? `${Math.round((unassigned / rows.length) * 100)}% of these pieces` : "—"} />
            <StatCard label="On the loaded schedule" value={count(scheduled)}
                      sub="the rest are outside the schedule window" />
            <StatCard label="Bed date already passed"
                      value={count(buckets.find((b) => b.id === "past")?.pieces ?? 0)}
                      sub={`as of ${today}`} />
          </div>

          {/* Urgency is the ordering that makes this a work queue rather than an
              inventory, so it is a primary control above the tabs and applies to
              all three of them. */}
          <div className="filters">
            <span className="filter-label">Bed date</span>
            <div className="scopetoggle" role="group" aria-label="Filter by how soon the piece is cast">
              <button type="button" aria-pressed={bucket === "all"} onClick={() => setBucket("all")}>
                All ({count(scoped.length)})
              </button>
              {buckets.filter((b) => b.pieces > 0).map((b) => (
                <button key={b.id} type="button" aria-pressed={bucket === b.id}
                        onClick={() => setBucket(b.id)}>
                  {b.label} ({b.pieces})
                </button>
              ))}
            </div>
          </div>

          <RouteTabs
            section="drawings"
            tabs={tabsFor("drawings")}
            active={tab}
            counts={{ queue: rows.length }}
          />

          {tab === "jobs" && (
            <ByJob rows={rows} scheduledJobNos={app.scheduledJobNos} mine={mine} onOpenJob={openJob} />
          )}
          {tab === "drafters" && <ByDrafter rows={rows} />}
          {(tab === "queue" || !tab) && (
            <Queue rows={rows} scheduledJobNos={app.scheduledJobNos} today={today} onOpenJob={openJob} />
          )}

          {!app.schedule.rows.length && (
            <p className="hint">
              No schedule is loaded, so nothing here can say which of these pieces is about to be
              cast on a bed. <a className="link" href={hrefFor("sources")}>Add the Scheduled
              Production Report</a> and the board will flag them too.
            </p>
          )}
        </>
      )}
    </div>
  );
}
