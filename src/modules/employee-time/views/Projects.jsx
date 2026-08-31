/**
 * Hours per job.
 *
 * Each row now carries the job **number** as well as the name — the export was
 * profiled on 2026-08-31 and it turns out to carry one (§12) — so a row leads
 * two places: into this section's own breakdown, or out to the whole project
 * across every source.
 */
import React, { useMemo } from "react";
import { MiniBar, SortableTh, useSort, compareBy } from "../../../components/ui.jsx";
import { fmt, pct } from "../../../core/format.js";
import { groupBy, sumBy } from "../../../core/aggregate.js";

export default function Projects({ rows, total, search, onOpenProject, onOpenJobNo }) {
  const [sort, onSort] = useSort("hrs");

  const projects = useMemo(() => {
    const out = [];
    for (const [job, bucket] of groupBy(rows, (r) => r.job)) {
      const dates = bucket.map((r) => r.date).sort();
      out.push({
        job,
        jobNo: bucket[0].jobNo || "",
        jobTitle: bucket[0].jobTitle || job,
        hrs: sumBy(bucket, (r) => r.hrs),
        headcount: new Set(bucket.map((r) => r.name)).size,
        first: dates[0],
        last: dates[dates.length - 1],
      });
    }
    const q = search.trim().toLowerCase();
    return out
      .filter((p) => !q || p.job.toLowerCase().includes(q) || p.jobNo.toLowerCase().includes(q))
      .sort(compareBy(sort.col, sort.dir));
  }, [rows, search, sort]);

  const max = Math.max(...projects.map((p) => p.hrs), 1);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <SortableTh column="jobNo" label="Job No" sort={sort} onSort={onSort} />
            <SortableTh column="jobTitle" label="Job" sort={sort} onSort={onSort} />
            <SortableTh column="hrs" label="Hours" sort={sort} onSort={onSort} />
            <th>%</th>
            <SortableTh column="headcount" label="People" sort={sort} onSort={onSort} />
            <SortableTh column="first" label="First" sort={sort} onSort={onSort} />
            <SortableTh column="last" label="Last" sort={sort} onSort={onSort} />
            <th />
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.job} className="clickable" onClick={() => onOpenProject(p.job)}>
              <td className="muted nowrap">{p.jobNo || "—"}</td>
              <td className="link" style={{ maxWidth: 340 }} title={p.job}>{p.jobTitle}</td>
              <td className="num nowrap">{fmt(p.hrs)}<MiniBar value={p.hrs} max={max} color="var(--series-3)" /></td>
              <td className="num">{pct(p.hrs, total)}</td>
              <td className="num">{p.headcount}</td>
              <td className="nowrap muted">{p.first}</td>
              <td className="nowrap muted">{p.last}</td>
              <td>
                {/* Out to the whole project. Stops the row click so it can't
                    also open this section's own breakdown. */}
                {p.jobNo && onOpenJobNo ? (
                  <button className="btn ghost" title={`Open job ${p.jobNo} across every source`}
                          onClick={(e) => { e.stopPropagation(); onOpenJobNo(p.jobNo); }}>
                    Job →
                  </button>
                ) : (
                  <span style={{ color: "rgba(0,220,255,0.4)" }}>▶</span>
                )}
              </td>
            </tr>
          ))}
          {!projects.length && <tr><td colSpan={8} className="muted" style={{ padding: 18 }}>No jobs match the current filters.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
