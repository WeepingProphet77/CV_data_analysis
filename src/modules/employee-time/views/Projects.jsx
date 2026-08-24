import React, { useMemo } from "react";
import { MiniBar, SortableTh, useSort, compareBy } from "../../../components/ui.jsx";
import { fmt, pct } from "../../../core/format.js";
import { groupBy, sumBy } from "../../../core/aggregate.js";

export default function Projects({ rows, total, search, onOpenProject }) {
  const [sort, onSort] = useSort("hrs");

  const projects = useMemo(() => {
    const out = [];
    for (const [job, bucket] of groupBy(rows, (r) => r.job)) {
      const dates = bucket.map((r) => r.date).sort();
      out.push({
        job,
        hrs: sumBy(bucket, (r) => r.hrs),
        headcount: new Set(bucket.map((r) => r.name)).size,
        first: dates[0],
        last: dates[dates.length - 1],
      });
    }
    const q = search.trim().toLowerCase();
    return out
      .filter((p) => !q || p.job.toLowerCase().includes(q))
      .sort(compareBy(sort.col, sort.dir));
  }, [rows, search, sort]);

  const max = Math.max(...projects.map((p) => p.hrs), 1);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <SortableTh column="job" label="Project" sort={sort} onSort={onSort} />
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
              <td className="link" style={{ maxWidth: 380 }}>{p.job}</td>
              <td className="num nowrap">{fmt(p.hrs)}<MiniBar value={p.hrs} max={max} color="var(--series-3)" /></td>
              <td className="num">{pct(p.hrs, total)}</td>
              <td className="num">{p.headcount}</td>
              <td className="nowrap muted">{p.first}</td>
              <td className="nowrap muted">{p.last}</td>
              <td style={{ color: "rgba(0,220,255,0.4)" }}>▶</td>
            </tr>
          ))}
          {!projects.length && <tr><td colSpan={7} className="muted" style={{ padding: 18 }}>No projects match the current filters.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
