/**
 * The raw scheduled-piece table.
 *
 * Rendering every row of a 4,000+ row export at once is pointless — the list is
 * capped and the count is stated, so filtering is the way to narrow it.
 */
import React, { useMemo, useState } from "react";
import { SortableTh, useSort, compareBy, Badge } from "../../../components/ui.jsx";
import { fmt, count } from "../../../core/format.js";

const PAGE = 300;

export default function Pieces({ rows, search }) {
  const [sort, onSort] = useSort("date", 1);
  const [limit, setLimit] = useState(PAGE);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) =>
          r.mark.toLowerCase().includes(q) ||
          r.job.toLowerCase().includes(q) ||
          r.bed.toLowerCase().includes(q) ||
          r.plant.toLowerCase().includes(q))
      : rows;
    return [...filtered].sort(compareBy(sort.col, sort.dir));
  }, [rows, search, sort]);

  const shown = list.slice(0, limit);

  return (
    <div>
      <p className="hint" style={{ marginBottom: 10 }}>
        Showing {count(shown.length)} of {count(list.length)} scheduled rows.
        Rows with no quantity are bed activity — mold builds and maintenance.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortableTh column="date" label="Date" sort={sort} onSort={onSort} />
              <SortableTh column="plant" label="Plant" sort={sort} onSort={onSort} />
              <SortableTh column="bed" label="Bed" sort={sort} onSort={onSort} />
              <SortableTh column="pos" label="Pos" sort={sort} onSort={onSort} />
              <SortableTh column="mark" label="Piece Mark" sort={sort} onSort={onSort} />
              <SortableTh column="jobTitle" label="Job" sort={sort} onSort={onSort} />
              <SortableTh column="phaseName" label="Phase" sort={sort} onSort={onSort} />
              <SortableTh column="qty" label="Qty" sort={sort} onSort={onSort} />
              <SortableTh column="sf" label="SF" sort={sort} onSort={onSort} />
              <SortableTh column="cy" label="CY" sort={sort} onSort={onSort} />
              <SortableTh column="pourNo" label="Pour" sort={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.castNo}-${r.date}-${i}`} style={r.isPour ? undefined : { background: "rgba(201,133,0,.06)" }}>
                <td className="nowrap">{r.date}</td>
                <td className="muted nowrap">{r.plant}</td>
                <td style={{ color: "var(--accent-dim)" }}>{r.bed}</td>
                <td className="num muted">{r.pos || "—"}</td>
                <td style={{ fontWeight: 600 }}>
                  {r.mark || <Badge tone="amber">bed activity</Badge>}
                </td>
                <td title={r.job} style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.jobTitle}
                </td>
                <td className="muted">{r.phaseName || "—"}</td>
                <td className="num">{r.qty || "—"}</td>
                <td className="num">{r.sf ? count(Math.round(r.sf)) : "—"}</td>
                <td className="num">{r.cy ? fmt(r.cy) : "—"}</td>
                <td className="muted">{r.pourNo || "—"}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={11} className="muted" style={{ padding: 18 }}>No rows match the current filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {list.length > shown.length && (
        <button className="btn" style={{ marginTop: 12 }} onClick={() => setLimit((l) => l + PAGE)}>
          Show {Math.min(PAGE, list.length - shown.length)} more
        </button>
      )}
    </div>
  );
}
