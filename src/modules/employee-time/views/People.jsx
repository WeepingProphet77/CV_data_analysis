import React, { useMemo } from "react";
import { Badge, MiniBar, SortableTh, useSort, compareBy } from "../../../components/ui.jsx";
import { fmt, pct } from "../../../core/format.js";
import { groupBy, sumBy } from "../../../core/aggregate.js";

export default function People({ rows, total, search, onOpenPerson }) {
  const [sort, onSort] = useSort("hrs");

  const people = useMemo(() => {
    const out = [];
    for (const [name, bucket] of groupBy(rows, (r) => r.name)) {
      out.push({
        name,
        loc: bucket[0].loc,
        dept: bucket[0].dept,
        hrs: sumBy(bucket, (r) => r.hrs),
        jobCount: new Set(bucket.map((r) => r.job)).size,
        days: new Set(bucket.map((r) => r.date)).size,
      });
    }
    const q = search.trim().toLowerCase();
    return out
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort(compareBy(sort.col, sort.dir));
  }, [rows, search, sort]);

  const max = Math.max(...people.map((p) => p.hrs), 1);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <SortableTh column="name" label="Name" sort={sort} onSort={onSort} />
            <SortableTh column="loc" label="Loc" sort={sort} onSort={onSort} />
            <SortableTh column="hrs" label="Hours" sort={sort} onSort={onSort} />
            <th>%</th>
            <SortableTh column="jobCount" label="Projects" sort={sort} onSort={onSort} />
            <SortableTh column="days" label="Days" sort={sort} onSort={onSort} />
            <th />
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.name} className="clickable" onClick={() => onOpenPerson(p.name)}>
              <td className="link">{p.name}</td>
              <td>{p.loc ? <Badge>{p.loc}</Badge> : <span className="muted">—</span>}</td>
              <td className="num nowrap">{fmt(p.hrs)}<MiniBar value={p.hrs} max={max} /></td>
              <td className="num">{pct(p.hrs, total)}</td>
              <td className="num">{p.jobCount}</td>
              <td className="num">{p.days}</td>
              <td style={{ color: "rgba(0,220,255,0.4)" }}>▶</td>
            </tr>
          ))}
          {!people.length && <tr><td colSpan={7} className="muted" style={{ padding: 18 }}>No people match the current filters.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
