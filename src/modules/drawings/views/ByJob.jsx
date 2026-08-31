/**
 * Missing drawings, grouped by job — which projects the backlog sits in.
 *
 * Split out of the old single Tickets tab, which stacked this table under two
 * others and a set of stat tiles. The arithmetic is unchanged and still lives
 * in production/tickets.js so it can be tested in node.
 */
import React, { useMemo } from "react";
import { Badge, MiniBar, SortableTh, useSort, compareBy } from "../../../components/ui.jsx";
import { StarButton } from "../../../components/MyProjects.jsx";
import { count } from "../../../core/format.js";
import { byJob } from "../../production/tickets.js";

export default function ByJob({ rows, scheduledJobNos, mine, onOpenJob }) {
  const [sort, onSort] = useSort("pieces");
  const jobs = useMemo(() => byJob(rows).sort(compareBy(sort.col, sort.dir)), [rows, sort]);
  const maxPieces = Math.max(...jobs.map((j) => j.pieces), 1);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: 34 }} title="Add to My Projects">★</th>
            <SortableTh column="jobNo" label="Job No" sort={sort} onSort={onSort} />
            <SortableTh column="jobTitle" label="Job" sort={sort} onSort={onSort} />
            <SortableTh column="pieces" label="Missing" sort={sort} onSort={onSort} align="right" />
            <SortableTh column="unassigned" label="Unassigned" sort={sort} onSort={onSort} align="right" />
            <SortableTh column="sf" label="SF" sort={sort} onSort={onSort} align="right" />
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
              <td className="starcol">
                {mine && <StarButton jobNo={j.jobNo} on={mine.isMember(j.jobNo)} onToggle={mine.toggle} />}
              </td>
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
            <tr><td colSpan={10} className="muted" style={{ padding: 18 }}>Nothing in this bucket.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
