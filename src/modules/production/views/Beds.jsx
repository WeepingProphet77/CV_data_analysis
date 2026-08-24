/** Bed utilization across the filtered window. */
import React, { useMemo } from "react";
import { MiniBar, SortableTh, useSort, compareBy, Badge } from "../../../components/ui.jsx";
import { fmt, count } from "../../../core/format.js";
import { groupBy, sumBy, distinct } from "../../../core/aggregate.js";

export default function Beds({ rows, search }) {
  const [sort, onSort] = useSort("pieces");

  const { beds, windowDays } = useMemo(() => {
    const allDates = distinct(rows, (r) => r.date);
    const out = [];
    for (const [bedKey, bucket] of groupBy(rows, (r) => r.bedKey)) {
      const scheduled = new Set(bucket.map((r) => r.date));
      const pourDays = new Set(bucket.filter((r) => r.isPour).map((r) => r.date));
      out.push({
        bedKey,
        bed: bucket[0].bed,
        plant: bucket[0].plant,
        pieces: sumBy(bucket, (r) => r.qty),
        sf: sumBy(bucket, (r) => r.sf),
        cy: sumBy(bucket, (r) => r.cy),
        days: scheduled.size,
        pourDays: pourDays.size,
        // Days the bed is on the schedule but casting nothing — mold builds
        // and maintenance. Useful for spotting a bed tied up all month.
        idleDays: scheduled.size - pourDays.size,
        jobs: distinct(bucket, (r) => r.job).length,
      });
    }
    const q = search.trim().toLowerCase();
    return {
      windowDays: allDates.length,
      beds: out
        .filter((b) => !q || b.bed.toLowerCase().includes(q) || b.plant.toLowerCase().includes(q))
        .sort(compareBy(sort.col, sort.dir)),
    };
  }, [rows, search, sort]);

  const maxPieces = Math.max(...beds.map((b) => b.pieces), 1);

  return (
    <div>
      <p className="hint" style={{ marginBottom: 10 }}>
        {beds.length} beds across {windowDays} scheduled days in the current window.
        “Non-pour days” are days a bed is scheduled but casting nothing — mold builds and maintenance.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortableTh column="bed" label="Bed" sort={sort} onSort={onSort} />
              <SortableTh column="plant" label="Plant" sort={sort} onSort={onSort} />
              <SortableTh column="pieces" label="Pieces" sort={sort} onSort={onSort} />
              <SortableTh column="sf" label="SF" sort={sort} onSort={onSort} />
              <SortableTh column="cy" label="CY" sort={sort} onSort={onSort} />
              <SortableTh column="pourDays" label="Pour Days" sort={sort} onSort={onSort} />
              <SortableTh column="idleDays" label="Non-Pour Days" sort={sort} onSort={onSort} />
              <SortableTh column="jobs" label="Jobs" sort={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {beds.map((b) => (
              <tr key={b.bedKey}>
                <td style={{ color: "var(--accent-dim)", fontWeight: 600 }}>{b.bed}</td>
                <td><Badge>{b.plant}</Badge></td>
                <td className="num nowrap">{count(b.pieces)}<MiniBar value={b.pieces} max={maxPieces} /></td>
                <td className="num">{count(Math.round(b.sf))}</td>
                <td className="num">{fmt(b.cy)}</td>
                <td className="num">{b.pourDays}</td>
                <td className="num" style={{ color: b.idleDays > 0 ? "#ecb84a" : undefined }}>{b.idleDays || "—"}</td>
                <td className="num">{b.jobs}</td>
              </tr>
            ))}
            {!beds.length && <tr><td colSpan={8} className="muted" style={{ padding: 18 }}>No beds match the current filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
