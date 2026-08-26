/**
 * The job table — sortable on every column, which is the primary way into the
 * data: pick a plant, sort by whatever is being asked about, open a job.
 */
import React, { useMemo } from "react";
import { SortableTh, useSort, compareBy, Badge, MiniBar } from "../../../components/ui.jsx";
import { money, ratio } from "../../../core/format.js";
import { StarButton } from "./MyProjects.jsx";

export default function Jobs({ jobs, onOpenJob, mine }) {
  const [sort, onSort] = useSort("netContract");

  const rows = useMemo(
    () => jobs.map((j) => ({
      key: j.key, jobNo: j.jobNo, jobTitle: j.jobTitle, plant: j.plant, asOf: j.asOf,
      starred: mine.isMember(j.jobNo) ? 1 : 0,
      netContract: j.netContract,
      billed: j.amountBilled,
      pctBilled: j.pctBilled,
      estCost: j.totals.estCost,
      projCost: j.totals.projCost,
      actCost: j.totals.actCost,
      curMo: j.totals.curMo,
      margin: j.estOhProfit,
      marginPct: j.estOhProfitPct,
      progress: j.costProgress,
      over: j.overProjection,
    })).sort(compareBy(sort.col, sort.dir)),
    [jobs, sort, mine]
  );

  if (!rows.length) {
    return <div className="table-wrap"><div className="muted" style={{ padding: 18 }}>No jobs match the current filters.</div></div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <SortableTh column="starred" label="★" sort={sort} onSort={onSort} />
            <SortableTh column="jobNo" label="Job #" sort={sort} onSort={onSort} />
            <SortableTh column="jobTitle" label="Job" sort={sort} onSort={onSort} />
            <SortableTh column="plant" label="Plant" sort={sort} onSort={onSort} />
            <SortableTh column="netContract" label="Net Contract" sort={sort} onSort={onSort} align="right" />
            <SortableTh column="pctBilled" label="% Billed" sort={sort} onSort={onSort} align="right" />
            <SortableTh column="projCost" label="Projected Cost" sort={sort} onSort={onSort} align="right" />
            <SortableTh column="actCost" label="Actual Cost" sort={sort} onSort={onSort} align="right" />
            <SortableTh column="progress" label="Cost Progress" sort={sort} onSort={onSort} align="right" />
            <SortableTh column="curMo" label="Current Mo" sort={sort} onSort={onSort} align="right" />
            <SortableTh column="margin" label="Est. OH & Profit" sort={sort} onSort={onSort} align="right" />
            <SortableTh column="marginPct" label="Margin" sort={sort} onSort={onSort} align="right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="clickable" onClick={() => onOpenJob(r.key)}>
              <td className="starcol"><StarButton jobNo={r.jobNo} on={Boolean(r.starred)} onToggle={mine.toggle} /></td>
              <td className="muted nowrap">{r.jobNo}</td>
              <td className="link" style={{ maxWidth: 280 }} title={r.jobTitle}>{r.jobTitle || "—"}</td>
              <td className="muted nowrap">{r.plant}</td>
              <td className="num">{money(r.netContract)}</td>
              <td className="num">{ratio(r.pctBilled)}</td>
              <td className="num">{money(r.projCost)}</td>
              <td className="num">{money(r.actCost)}</td>
              <td className="num nowrap">
                {ratio(r.progress)}
                <MiniBar value={Math.min(r.progress, 1)} max={1}
                         color={r.over ? "var(--critical)" : "var(--series-3)"} />
              </td>
              <td className="num">{r.curMo ? money(r.curMo) : <span className="muted">—</span>}</td>
              <td className="num" style={{ color: r.margin < 0 ? "var(--critical)" : undefined }}>{money(r.margin)}</td>
              <td className="num">
                <Badge tone={r.marginPct < 0 ? "red" : r.marginPct < 0.1 ? "amber" : "green"}>{ratio(r.marginPct)}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
