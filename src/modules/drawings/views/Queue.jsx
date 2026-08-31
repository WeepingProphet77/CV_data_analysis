/**
 * The work queue: every piece with no drawing, earliest bed date first.
 *
 * Ordering by *how soon the piece is cast* is what makes this a queue rather
 * than an inventory — a piece pouring next week and a piece pouring in November
 * are the same row in the export and very different problems.
 */
import React from "react";
import { Badge } from "../../../components/ui.jsx";
import { count } from "../../../core/format.js";

const LIMIT = 400;

export default function Queue({ rows, scheduledJobNos, today, onOpenJob }) {
  const shown = [...rows].sort(
    (a, b) =>
      (a.date || "9999").localeCompare(b.date || "9999") ||
      a.jobNo.localeCompare(b.jobNo) ||
      a.mark.localeCompare(b.mark, undefined, { numeric: true })
  );

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bed date</th>
              <th>Job No</th>
              <th>Piece Mark</th>
              <th>Drawn By</th>
              <th>Plant</th>
              <th>Length</th>
              <th>Width</th>
              <th>Depth</th>
              <th className="num">SF</th>
              <th className="num">CY</th>
              <th className="num">Weight</th>
              <th>On the board</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, LIMIT).map((t) => {
              const overdue = t.date && t.date < today;
              return (
                <tr key={t.key} className={onOpenJob ? "clickable" : undefined}
                    onClick={() => onOpenJob?.(t.jobNo)}>
                  <td className={`nowrap${overdue ? "" : " muted"}`}
                      style={overdue ? { color: "var(--critical)", fontWeight: 700 } : undefined}
                      title={overdue ? "Bed date has already passed" : undefined}>
                    {t.date || "—"}
                  </td>
                  <td className="muted nowrap">{t.jobNo}</td>
                  <td style={{ fontWeight: 700 }}>{t.mark}</td>
                  <td>{t.drawnBy || <span className="muted">unassigned</span>}</td>
                  <td className="muted nowrap">{t.plant}</td>
                  <td className="muted nowrap">{t.length || "—"}</td>
                  <td className="muted nowrap">{t.width || "—"}</td>
                  <td className="muted nowrap">{t.depth || "—"}</td>
                  <td className="num">{count(Math.round(t.sf))}</td>
                  <td className="num">{t.cy || "—"}</td>
                  <td className="num">{count(Math.round(t.weight))}</td>
                  <td>{scheduledJobNos?.has(t.jobNo)
                    ? <Badge tone="blue">job scheduled</Badge>
                    : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr><td colSpan={12} className="muted" style={{ padding: 18 }}>Nothing in this bucket.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {shown.length > LIMIT && (
        <p className="hint" style={{ marginTop: 8 }}>
          Showing the {LIMIT} earliest of {count(shown.length)}. Narrow with the bed-date buckets above.
        </p>
      )}
      <p className="hint" style={{ marginTop: 8 }}>
        Length, width and depth are feet-and-inches text in the export and are shown verbatim —
        they are not converted to decimals. "On the board" means the <em>job</em> appears in the
        loaded schedule; whether this particular piece does is what the board itself shows.
      </p>
    </>
  );
}
