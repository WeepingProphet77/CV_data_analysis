/** Per-job rollup across the filtered window. */
import React, { useMemo } from "react";
import { MiniBar, SortableTh, useSort, compareBy, Badge } from "../../../components/ui.jsx";
import { StarButton } from "../../../components/MyProjects.jsx";
import { fmt, count } from "../../../core/format.js";
import { groupBy, sumBy, distinct } from "../../../core/aggregate.js";

export default function Jobs({ rows, search, onOpenJob, mine }) {
  const [sort, onSort] = useSort("pieces");

  const jobs = useMemo(() => {
    const out = [];
    for (const [job, bucket] of groupBy(rows, (r) => r.job)) {
      const dates = distinct(bucket, (r) => r.date);
      out.push({
        job,
        jobNo: bucket[0].jobNo,
        jobTitle: bucket[0].jobTitle,
        pieces: sumBy(bucket, (r) => r.qty),
        sf: sumBy(bucket, (r) => r.sf),
        cy: sumBy(bucket, (r) => r.cy),
        days: dates.length,
        first: dates[0],
        last: dates[dates.length - 1],
        plants: distinct(bucket, (r) => r.plant),
        beds: distinct(bucket, (r) => r.bedKey).length,
      });
    }
    const q = search.trim().toLowerCase();
    return out
      .filter((j) => !q || j.job.toLowerCase().includes(q))
      .sort(compareBy(sort.col, sort.dir));
  }, [rows, search, sort]);

  const maxPieces = Math.max(...jobs.map((j) => j.pieces), 1);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {mine && <th style={{ width: 34 }} title="Add to My Projects">★</th>}
            <SortableTh column="jobNo" label="Job #" sort={sort} onSort={onSort} />
            <SortableTh column="jobTitle" label="Job" sort={sort} onSort={onSort} />
            <SortableTh column="pieces" label="Pieces" sort={sort} onSort={onSort} />
            <SortableTh column="sf" label="SF" sort={sort} onSort={onSort} />
            <SortableTh column="cy" label="CY" sort={sort} onSort={onSort} />
            <SortableTh column="beds" label="Beds" sort={sort} onSort={onSort} />
            <SortableTh column="days" label="Days" sort={sort} onSort={onSort} />
            <SortableTh column="first" label="First" sort={sort} onSort={onSort} />
            <SortableTh column="last" label="Last" sort={sort} onSort={onSort} />
            <th>Plants</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.job} className="clickable" onClick={() => onOpenJob?.(j.job)}>
              {mine && (
                <td>{j.jobNo
                  ? <StarButton jobNo={j.jobNo} on={mine.isMember(j.jobNo)} onToggle={mine.toggle} />
                  : null}</td>
              )}
              <td className="muted nowrap">{j.jobNo || "—"}</td>
              <td className="link" style={{ maxWidth: 300 }} title={j.job}>{j.jobTitle}</td>
              <td className="num nowrap">{count(j.pieces)}<MiniBar value={j.pieces} max={maxPieces} color="var(--series-3)" /></td>
              <td className="num">{count(Math.round(j.sf))}</td>
              <td className="num">{fmt(j.cy)}</td>
              <td className="num">{j.beds}</td>
              <td className="num">{j.days}</td>
              <td className="nowrap muted">{j.first}</td>
              <td className="nowrap muted">{j.last}</td>
              <td>{j.plants.slice(0, 2).map((p) => <Badge key={p}>{p}</Badge>)}
                  {j.plants.length > 2 && <Badge tone="amber">+{j.plants.length - 2}</Badge>}</td>
            </tr>
          ))}
          {!jobs.length && <tr><td colSpan={mine ? 11 : 10} className="muted" style={{ padding: 18 }}>No jobs match the current filters.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
