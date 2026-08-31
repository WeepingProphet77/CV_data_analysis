/**
 * Schedule movement — what moved between the previous upload and this one.
 *
 * The arithmetic is all in ../movement.js so it can be tested in node
 * (CLAUDE.md §3). This file only decides how to show it.
 *
 * The framing throughout is **the piece's point of view**: "earlier" means the
 * piece is now cast sooner than the last export said, "later" means it slipped.
 * Never "the date went up/down", which reads either way depending on whether
 * you're looking at a calendar or a list.
 */
import React, { useMemo, useState } from "react";
import { Badge, MiniBar, Panel, SortableTh, StatCard, useSort, compareBy } from "../../../components/ui.jsx";
import { StarButton } from "../../../components/MyProjects.jsx";
import { count, fmt } from "../../../core/format.js";
import { movementByJob } from "../movement.js";

/** ▲ earlier / ▼ later, with the day count. Shape carries it, not color. */
export function MoveChip({ days, kind, title }) {
  if (kind === "added") return <span className="mvchip new" title={title || "Not in the previous schedule"}>NEW</span>;
  if (kind === "removed") return <span className="mvchip gone" title={title || "Was scheduled, now absent"}>DROPPED</span>;
  if (!days) return null;
  const up = days < 0;
  return (
    <span className={`mvchip ${up ? "up" : "back"}`}
          title={title || `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ${up ? "earlier than" : "later than"} the previous schedule`}>
      {up ? "▲" : "▼"}{Math.abs(days)}d
    </span>
  );
}

const BUCKETS = [
  { id: "all", label: "Everything" },
  { id: "later", label: "Moved back" },
  { id: "earlier", label: "Moved up" },
  { id: "added", label: "New" },
  { id: "removed", label: "Dropped" },
];

export default function Movement({ diff, baselineMeta, currentMeta, mine, onOpenJob }) {
  // Moved back first: a piece that slipped is the one with a drawing or a bed
  // that now has less time, which is what someone opens this tab to find.
  const [sort, onSort] = useSort("later");
  const [pieceSort, onPieceSort] = useSort("days", 1);
  const [bucket, setBucket] = useState("all");

  const jobs = useMemo(
    () => movementByJob(diff).sort(compareBy(sort.col, sort.dir)),
    [diff, sort]
  );

  const pieces = useMemo(() => {
    const all = [
      ...diff.moved,
      ...diff.added,
      ...diff.removed,
    ].map((e) => {
      const r = e.row || e.prev;
      return {
        ...e,
        jobNo: r.jobNo || "",
        jobTitle: r.jobTitle || r.job || "",
        mark: r.mark,
        plant: r.plant,
        bed: e.row ? e.row.bed : e.prev.bed,
        // Sorting on a null day count would scatter added/dropped rows through
        // the middle of the list; they sort to the end of whichever direction
        // is being read instead.
        sortDays: e.days == null ? (sort.dir === 1 ? Infinity : -Infinity) : e.days,
        absDays: e.days == null ? -1 : Math.abs(e.days),
      };
    });
    const keep =
      bucket === "all" ? all
      : bucket === "later" ? all.filter((e) => e.days > 0)
      : bucket === "earlier" ? all.filter((e) => e.days < 0)
      : all.filter((e) => e.kind === bucket);
    return keep.sort(compareBy(pieceSort.col === "days" ? "sortDays" : pieceSort.col, pieceSort.dir));
  }, [diff, bucket, pieceSort, sort.dir]);

  const s = diff.stats || { earlier: 0, later: 0, added: 0, removed: 0, unchanged: 0, avgAbs: 0, maxLater: 0, maxEarlier: 0 };
  const maxChanged = Math.max(...jobs.map((j) => j.changed), 1);

  const nothing = !diff.moved.length && !diff.added.length && !diff.removed.length;

  return (
    <div>
      <div className="cards">
        <StatCard label="Moved back" value={count(diff.moved.filter((m) => m.days > 0).length)}
                  sub={s.maxLater ? `worst ${s.maxLater} days later` : "none slipped"} />
        <StatCard label="Moved up" value={count(diff.moved.filter((m) => m.days < 0).length)}
                  sub={s.maxEarlier ? `up to ${Math.abs(s.maxEarlier)} days earlier` : "none pulled in"} />
        <StatCard label="New to the schedule" value={count(diff.added.length)}
                  sub="not in the previous export" />
        <StatCard label="Dropped" value={count(diff.removed.length)}
                  sub="was scheduled, now absent" />
        <StatCard label="Average move" value={diff.moved.length ? `${fmt(
                    diff.moved.reduce((a, m) => a + Math.abs(m.days), 0) / diff.moved.length, 1)} d` : "—"}
                  sub="over the pieces that moved" />
      </div>

      <p className="hint" style={{ margin: "10px 0 4px" }}>
        Comparing <strong>{currentMeta?.fileName || "the current schedule"}</strong> against{" "}
        <strong>{baselineMeta?.fileName || "the previous upload"}</strong>.{" "}
        {count(diff.unchanged)} piece{diff.unchanged === 1 ? "" : "s"} did not move.
        <br />
        Pieces are matched on job number and piece mark, because{" "}
        <strong>this export carries no unique piece id</strong> — nothing in it is unique per row.
        Where a mark is scheduled only once the comparison is exact, which covers the large
        majority. Where the same mark is scheduled several times, the instances are matched by
        date, choosing the reading that implies the least movement; one such piece being
        rescheduled can therefore read as several smaller slides rather than one large one.
      </p>

      {nothing ? (
        <div className="empty">
          <h2>Nothing moved</h2>
          <p className="muted" style={{ fontSize: 13, maxWidth: 460 }}>
            Every piece in this export is scheduled for the same day it was in{" "}
            {baselineMeta?.fileName || "the previous upload"}, and none were added or dropped.
          </p>
        </div>
      ) : (
        <>
          <div className="filters" style={{ marginTop: 12 }}>
            <span className="filter-label">Show</span>
            <div className="scopetoggle" role="group" aria-label="Filter by kind of change">
              {BUCKETS.map((b) => {
                const n = b.id === "all" ? pieces.length + 0
                  : b.id === "later" ? diff.moved.filter((e) => e.days > 0).length
                  : b.id === "earlier" ? diff.moved.filter((e) => e.days < 0).length
                  : b.id === "added" ? diff.added.length
                  : diff.removed.length;
                return (
                  <button key={b.id} type="button" aria-pressed={bucket === b.id}
                          onClick={() => setBucket(b.id)}>
                    {b.label}{b.id === "all" ? "" : ` (${n})`}
                  </button>
                );
              })}
            </div>
          </div>

          <Panel title={`By job (${jobs.length})`}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {mine && <th style={{ width: 34 }} title="Add to My Projects">★</th>}
                    <SortableTh column="jobNo" label="Job No" sort={sort} onSort={onSort} />
                    <SortableTh column="jobTitle" label="Job" sort={sort} onSort={onSort} />
                    <SortableTh column="later" label="Moved back" sort={sort} onSort={onSort} />
                    <SortableTh column="earlier" label="Moved up" sort={sort} onSort={onSort} />
                    <SortableTh column="added" label="New" sort={sort} onSort={onSort} />
                    <SortableTh column="removed" label="Dropped" sort={sort} onSort={onSort} />
                    <SortableTh column="worstLater" label="Worst slip" sort={sort} onSort={onSort} />
                    <SortableTh column="net" label="Net" sort={sort} onSort={onSort} />
                    <SortableTh column="changed" label="Pieces changed" sort={sort} onSort={onSort} />
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.jobNo} className={onOpenJob ? "clickable" : undefined}
                        onClick={() => onOpenJob?.(j.jobNo)}>
                      {mine && (
                        <td>{j.jobNo
                          ? <StarButton jobNo={j.jobNo} on={mine.isMember(j.jobNo)} onToggle={mine.toggle} />
                          : null}</td>
                      )}
                      <td className="muted nowrap">{j.jobNo || "—"}</td>
                      <td className="link" style={{ maxWidth: 260 }} title={j.job}>{j.jobTitle || j.job}</td>
                      <td className="num">{j.later || "—"}</td>
                      <td className="num">{j.earlier || "—"}</td>
                      <td className="num">{j.added || "—"}</td>
                      <td className="num">{j.removed || "—"}</td>
                      <td className="num nowrap">
                        {j.worstLater ? <MoveChip days={j.worstLater} /> : "—"}
                      </td>
                      {/* Net says whether the job as a whole pulled in or slipped;
                          the two counts alone cancel and can't tell you. */}
                      <td className="num nowrap" title="Average signed move across this job's pieces">
                        {j.moved ? `${j.net > 0 ? "+" : ""}${fmt(j.net, 1)} d` : "—"}
                      </td>
                      <td className="num nowrap">
                        {count(j.changed)}<MiniBar value={j.changed} max={maxChanged} color="var(--warning)" />
                      </td>
                    </tr>
                  ))}
                  {!jobs.length && (
                    <tr><td colSpan={mine ? 10 : 9} className="muted" style={{ padding: 18 }}>
                      No job changed.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title={`Pieces (${count(pieces.length)})`}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <SortableTh column="days" label="Move" sort={pieceSort} onSort={onPieceSort} />
                    <SortableTh column="jobNo" label="Job No" sort={pieceSort} onSort={onPieceSort} />
                    <SortableTh column="mark" label="Piece Mark" sort={pieceSort} onSort={onPieceSort} />
                    <SortableTh column="from" label="Was" sort={pieceSort} onSort={onPieceSort} />
                    <SortableTh column="to" label="Now" sort={pieceSort} onSort={onPieceSort} />
                    <SortableTh column="plant" label="Plant" sort={pieceSort} onSort={onPieceSort} />
                    <SortableTh column="bed" label="Bed" sort={pieceSort} onSort={onPieceSort} />
                    <th>Also changed</th>
                  </tr>
                </thead>
                <tbody>
                  {pieces.slice(0, 500).map((e, i) => (
                    <tr key={`${e.key}-${e.kind}-${e.from ?? ""}-${e.to ?? ""}-${i}`}>
                      <td className="nowrap"><MoveChip days={e.days} kind={e.kind} /></td>
                      <td className="muted nowrap">{e.jobNo || "—"}</td>
                      <td style={{ fontWeight: 700 }}>{e.mark}</td>
                      <td className="nowrap muted">{e.from || "—"}</td>
                      <td className="nowrap muted">{e.to || "—"}</td>
                      <td className="muted nowrap">{e.plant || "—"}</td>
                      <td className="muted nowrap">{e.bed || "—"}</td>
                      <td className="nowrap">
                        {e.bedChanged && <Badge tone="amber" title={`Was on ${e.fromBed}`}>bed</Badge>}
                        {e.plantChanged && <Badge tone="red" title={`Was at ${e.fromPlant}`}>plant</Badge>}
                        {!e.bedChanged && !e.plantChanged && <span className="muted">—</span>}
                      </td>
                    </tr>
                  ))}
                  {!pieces.length && (
                    <tr><td colSpan={8} className="muted" style={{ padding: 18 }}>
                      Nothing in this bucket.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {pieces.length > 500 && (
              <p className="hint" style={{ marginTop: 8 }}>
                Showing 500 of {count(pieces.length)}. Narrow with the buttons above, or star the
                jobs you care about and switch to My Projects.
              </p>
            )}
            <p className="hint" style={{ marginTop: 8 }}>
              <strong>Was</strong> is the bed date in the previous export, <strong>Now</strong> the
              date in this one. Rows with no piece mark are bed activity, not pieces, and are not
              tracked here.
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}
