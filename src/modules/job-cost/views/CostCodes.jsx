/**
 * Cost codes rolled up across every job — the view the source system does not
 * give them, because its reports are per-job.
 *
 * A code is keyed by code *and* description: the same number carries different
 * work at different plants (20.600 is "BACKER CEMENT" in most jobs and
 * "READY MIX - CONCRETE" in others, 55.100 has five spellings), so rolling up
 * on the number alone would silently add unlike things together. Codes that
 * disagree are listed separately and flagged.
 */
import React, { useMemo } from "react";
import { SortableTh, useSort, compareBy, Badge, MiniBar, Panel } from "../../../components/ui.jsx";
import { money, ratio, count } from "../../../core/format.js";

export default function CostCodes({ costs, jobs, search, onOpenJob }) {
  const [sort, onSort] = useSort("actCost");

  const rows = useMemo(() => {
    const m = new Map();
    for (const c of costs) {
      const key = `${c.code}|${c.desc}`;
      let r = m.get(key);
      if (!r) {
        r = { key, code: c.code, desc: c.desc, category: c.category, section: c.section,
              estCost: 0, projCost: 0, actCost: 0, curMo: 0, variance: 0, jobs: 0, over: 0, plants: new Set() };
        m.set(key, r);
      }
      r.estCost += c.estCost; r.projCost += c.projCost; r.actCost += c.actCost;
      r.curMo += c.curMo; r.variance += c.variance; r.jobs++;
      r.plants.add(c.plant);
      if (c.projCost > 0 && c.actCost > c.projCost) r.over++;
    }
    // A code number carrying more than one description is worth seeing.
    const descsPerCode = new Map();
    for (const r of m.values()) {
      if (!descsPerCode.has(r.code)) descsPerCode.set(r.code, new Set());
      descsPerCode.get(r.code).add(r.desc);
    }

    const q = search.trim().toLowerCase();
    return [...m.values()]
      .map((r) => ({
        ...r,
        plantCount: r.plants.size,
        pctProj: r.projCost > 0 ? r.actCost / r.projCost : 0,
        ambiguous: descsPerCode.get(r.code).size > 1,
      }))
      .filter((r) => !q || r.code.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
      .sort(compareBy(sort.col, sort.dir));
  }, [costs, search, sort]);

  const totals = useMemo(() => ({
    est: rows.reduce((t, r) => t + r.estCost, 0),
    proj: rows.reduce((t, r) => t + r.projCost, 0),
    act: rows.reduce((t, r) => t + r.actCost, 0),
  }), [rows]);

  const maxAct = Math.max(...rows.map((r) => r.actCost), 1);
  const ambiguous = rows.filter((r) => r.ambiguous).length;

  if (!rows.length) {
    return <Panel><div className="muted" style={{ padding: 18 }}>No cost lines match the current filters.</div></Panel>;
  }

  return (
    <div>
      <p className="hint" style={{ margin: "0 0 10px" }}>
        {count(rows.length)} codes across {count(jobs.length)} jobs — {money(totals.act)} actual against{" "}
        {money(totals.proj)} projected.
        {ambiguous > 0 && ` ${ambiguous} row(s) share a code number with a different description; they are kept apart.`}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortableTh column="code" label="Task" sort={sort} onSort={onSort} />
              <SortableTh column="desc" label="Description" sort={sort} onSort={onSort} />
              <SortableTh column="category" label="Category" sort={sort} onSort={onSort} />
              <SortableTh column="jobs" label="Jobs" sort={sort} onSort={onSort} align="right" />
              <SortableTh column="estCost" label="Est Cost" sort={sort} onSort={onSort} align="right" />
              <SortableTh column="projCost" label="Projected" sort={sort} onSort={onSort} align="right" />
              <SortableTh column="actCost" label="Actual" sort={sort} onSort={onSort} align="right" />
              <SortableTh column="pctProj" label="% of Proj" sort={sort} onSort={onSort} align="right" />
              <SortableTh column="variance" label="Variance" sort={sort} onSort={onSort} align="right" />
              <SortableTh column="over" label="Over" sort={sort} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="muted nowrap">{r.code}</td>
                <td>
                  {r.desc || <span className="muted">—</span>}
                  {r.ambiguous && (
                    <Badge tone="amber" title="Another job uses this code number for different work">
                      shared code
                    </Badge>
                  )}
                </td>
                <td className="muted nowrap">{r.category}</td>
                <td className="num">{r.jobs}</td>
                <td className="num">{money(r.estCost)}</td>
                <td className="num">{money(r.projCost)}</td>
                <td className="num nowrap">{money(r.actCost)}<MiniBar value={r.actCost} max={maxAct} color="var(--series-1)" /></td>
                <td className="num">{r.projCost > 0 ? ratio(r.pctProj) : <span className="muted">—</span>}</td>
                <td className="num" style={{ color: r.variance < 0 ? "var(--critical)" : undefined }}>{money(r.variance)}</td>
                <td className="num">
                  {r.over > 0
                    ? <Badge tone={r.over > r.jobs / 2 ? "red" : "amber"} title={`${r.over} of ${r.jobs} jobs are over projection on this code`}>{r.over}</Badge>
                    : <span className="muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}><strong>Total</strong></td>
              <td className="num">{money(totals.est)}</td>
              <td className="num">{money(totals.proj)}</td>
              <td className="num">{money(totals.act)}</td>
              <td className="num">{totals.proj > 0 ? ratio(totals.act / totals.proj) : "—"}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
