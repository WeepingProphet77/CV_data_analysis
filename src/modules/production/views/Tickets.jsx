/**
 * Missing Piece Tickets — the drawings an engineering manager is on the hook for.
 *
 * The report is a list of pieces with no ticket. What makes it actionable is
 * ordering it by *how soon the piece is cast*, not by job: a piece pouring next
 * week and a piece pouring in November are the same row in the export and very
 * different problems.
 *
 * Everything here is a view over ticketRows; the arithmetic lives in
 * ../tickets.js so it can be tested in node (CLAUDE.md §3).
 */
import React, { useMemo, useState } from "react";
import { Badge, MiniBar, Panel, SortableTh, StatCard, useSort, compareBy } from "../../../components/ui.jsx";
import { StarButton } from "../../../components/MyProjects.jsx";
import { count, dateToIso } from "../../../core/format.js";
import { byJob, byDrafter, urgency } from "../tickets.js";
import { CoverageNotice } from "./TicketBar.jsx";

export default function Tickets({
  ticketRows, coverage, scheduledJobNos, mine, today = dateToIso(new Date()), onOpenJob,
}) {
  const [sort, onSort] = useSort("pieces");
  const [bucket, setBucket] = useState("all");

  const buckets = useMemo(() => urgency(ticketRows, today), [ticketRows, today]);

  const shown = useMemo(
    () => (bucket === "all" ? ticketRows : buckets.find((b) => b.id === bucket)?.rows ?? []),
    [ticketRows, buckets, bucket]
  );

  const jobs = useMemo(() => byJob(shown).sort(compareBy(sort.col, sort.dir)), [shown, sort]);
  const drafters = useMemo(() => byDrafter(shown), [shown]);

  const unassigned = shown.filter((t) => !t.drawnBy).length;
  const scheduled = shown.filter((t) => scheduledJobNos?.has(t.jobNo)).length;
  const maxPieces = Math.max(...jobs.map((j) => j.pieces), 1);

  return (
    <div>
      <CoverageNotice coverage={coverage} />

      <div className="cards">
        <StatCard label="Pieces missing a ticket" value={count(shown.length)}
                  sub={bucket === "all" ? `${jobs.length} jobs` : `of ${count(ticketRows.length)} in the report`} />
        <StatCard label="No drafter assigned" value={count(unassigned)}
                  sub={shown.length ? `${Math.round((unassigned / shown.length) * 100)}% of these pieces` : "—"} />
        <StatCard label="On the loaded schedule" value={count(scheduled)}
                  sub="the rest are outside the schedule window" />
        <StatCard label="Bed date already passed"
                  value={count(buckets.find((b) => b.id === "past")?.pieces ?? 0)}
                  sub={`as of ${today}`} />
      </div>

      {/* Urgency is the ordering that makes this list a work queue rather than
          an inventory, so it is the primary control rather than a sort option. */}
      <div className="filters" style={{ marginTop: 12 }}>
        <span className="filter-label">Bed date</span>
        <div className="scopetoggle" role="group" aria-label="Filter by how soon the piece is cast">
          <button type="button" aria-pressed={bucket === "all"} onClick={() => setBucket("all")}>
            All ({count(ticketRows.length)})
          </button>
          {buckets.filter((b) => b.pieces > 0).map((b) => (
            <button key={b.id} type="button" aria-pressed={bucket === b.id} onClick={() => setBucket(b.id)}>
              {b.label} ({b.pieces})
            </button>
          ))}
        </div>
      </div>

      <Panel title={`By job (${jobs.length})`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 34 }} title="Add to My Projects">★</th>
                <SortableTh column="jobNo" label="Job #" sort={sort} onSort={onSort} />
                <SortableTh column="jobTitle" label="Job" sort={sort} onSort={onSort} />
                <SortableTh column="pieces" label="Missing" sort={sort} onSort={onSort} />
                <SortableTh column="unassigned" label="Unassigned" sort={sort} onSort={onSort} />
                <SortableTh column="sf" label="SF" sort={sort} onSort={onSort} />
                <th>Earliest bed date</th>
                <th title="Parsed from the report's job banner; meaning unconfirmed">Drafting group</th>
                <th>Plants</th>
                <th>Scheduled</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.jobNo} className={onOpenJob ? "clickable" : undefined}
                    onClick={() => onOpenJob?.(j.jobNo)}>
                  <td>{mine && <StarButton jobNo={j.jobNo} on={mine.isMember(j.jobNo)} onToggle={mine.toggle} />}</td>
                  <td className="muted nowrap">{j.jobNo}</td>
                  <td className="link" style={{ maxWidth: 280 }} title={j.jobTitle}>{j.jobTitle}</td>
                  <td className="num nowrap">
                    {count(j.pieces)}<MiniBar value={j.pieces} max={maxPieces} color="var(--critical)" />
                  </td>
                  <td className="num">{j.unassigned ? <Badge tone="amber">{j.unassigned}</Badge> : "—"}</td>
                  <td className="num">{count(Math.round(j.sf))}</td>
                  <td className="nowrap muted">{j.range.min || "—"}</td>
                  <td className="muted nowrap">{j.group || "—"}</td>
                  <td>{j.plants.map((p) => <Badge key={p}>{p}</Badge>)}</td>
                  <td>{scheduledJobNos?.has(j.jobNo)
                    ? <Badge tone="blue">on the board</Badge>
                    : <span className="muted">—</span>}</td>
                </tr>
              ))}
              {!jobs.length && (
                <tr><td colSpan={10} className="muted" style={{ padding: 18 }}>
                  Nothing in this bucket.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={`By drafter (${drafters.length})`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Drawn By</th>
                <th className="num">Pieces</th>
                <th className="num">Jobs</th>
                <th>Earliest bed date</th>
              </tr>
            </thead>
            <tbody>
              {drafters.map((d) => (
                <tr key={d.drawnBy || "(unassigned)"}>
                  <td>{d.assigned ? d.drawnBy : <Badge tone="amber">No drafter assigned</Badge>}</td>
                  <td className="num">{count(d.pieces)}</td>
                  <td className="num">{d.jobs}</td>
                  <td className="nowrap muted">{d.range.min || "—"}</td>
                </tr>
              ))}
              {!drafters.length && (
                <tr><td colSpan={4} className="muted" style={{ padding: 18 }}>Nothing in this bucket.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          <strong>Drawn By is blank on most rows</strong> in the reports seen so far. A blank is
          not a person — it is a piece nobody is assigned to, which is why it gets its own row
          rather than being folded into a total.
        </p>
      </Panel>

      <Panel title={`Pieces (${count(shown.length)})`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Bed date</th>
                <th>Job #</th>
                <th>Piece Mark</th>
                <th>Drawn By</th>
                <th>Plant</th>
                <th>Length</th>
                <th>Width</th>
                <th>Depth</th>
                <th className="num">SF</th>
                <th className="num">CY</th>
                <th className="num">Weight</th>
                <th>On the board</th>
              </tr>
            </thead>
            <tbody>
              {[...shown]
                .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999")
                             || a.jobNo.localeCompare(b.jobNo)
                             || a.mark.localeCompare(b.mark, undefined, { numeric: true }))
                .slice(0, 400)
                .map((t) => {
                  const overdue = t.date && t.date < today;
                  return (
                    <tr key={t.key}>
                      <td className={`nowrap${overdue ? "" : " muted"}`}
                          style={overdue ? { color: "var(--critical)", fontWeight: 700 } : undefined}
                          title={overdue ? "Bed date has already passed" : undefined}>
                        {t.date || "—"}
                      </td>
                      <td className="muted nowrap">{t.jobNo}</td>
                      <td style={{ fontWeight: 700 }}>{t.mark}</td>
                      <td>{t.drawnBy || <span className="muted">unassigned</span>}</td>
                      <td className="muted nowrap">{t.plant}</td>
                      <td className="muted nowrap">{t.length || "—"}</td>
                      <td className="muted nowrap">{t.width || "—"}</td>
                      <td className="muted nowrap">{t.depth || "—"}</td>
                      <td className="num">{count(Math.round(t.sf))}</td>
                      <td className="num">{t.cy || "—"}</td>
                      <td className="num">{count(Math.round(t.weight))}</td>
                      <td>{scheduledJobNos?.has(t.jobNo) ? <Badge tone="blue">job scheduled</Badge> : <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              {!shown.length && (
                <tr><td colSpan={12} className="muted" style={{ padding: 18 }}>Nothing in this bucket.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {shown.length > 400 && (
          <p className="hint" style={{ marginTop: 8 }}>
            Showing the 400 earliest of {count(shown.length)}. Narrow with the bed-date buckets above.
          </p>
        )}
        <p className="hint" style={{ marginTop: 8 }}>
          Length, width and depth are feet-and-inches text in the export and are shown verbatim —
          they are not converted to decimals. "On the board" means the <em>job</em> appears in the
          loaded schedule; whether this particular piece does is what the board itself shows.
        </p>
      </Panel>
    </div>
  );
}
