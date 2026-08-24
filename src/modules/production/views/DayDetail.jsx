/**
 * One day's schedule, bed by bed.
 *
 * A bed-day is not one pour: it can carry several pour numbers and several
 * jobs, so each bed lists its pieces rather than collapsing to a single row.
 * Bed activity with no pieces (mold builds, maintenance) is shown too — the
 * bed is occupied, which is what a scheduler needs to know.
 */
import React from "react";
import { Panel, Badge } from "../../../components/ui.jsx";
import { groupBy, sumBy, distinct } from "../../../core/aggregate.js";
import { fmt, count, isoToDate } from "../../../core/format.js";

export default function DayDetail({ date, rows, onClose }) {
  const beds = [...groupBy(rows, (r) => r.bed)]
    .map(([bed, bucket]) => ({
      bed,
      bucket,
      pieces: sumBy(bucket, (r) => r.qty),
      sf: sumBy(bucket, (r) => r.sf),
      cy: sumBy(bucket, (r) => r.cy),
      jobs: distinct(bucket, (r) => r.job),
      pours: distinct(bucket, (r) => r.pourNo),
      notes: [...new Set(bucket.map((r) => r.note).filter(Boolean))],
      leadman: bucket.find((r) => r.leadman)?.leadman || "",
    }))
    .sort((a, b) => b.pieces - a.pieces || a.bed.localeCompare(b.bed, undefined, { numeric: true }));

  const long = isoToDate(date).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <Panel
      title={`${long} — ${beds.length} bed${beds.length === 1 ? "" : "s"}, ${count(sumBy(rows, (r) => r.qty))} pieces`}
      actions={<button className="btn ghost" onClick={onClose}>Close</button>}
    >
      <div style={{ display: "grid", gap: 10 }}>
        {beds.map((b) => (
          <div key={b.bed} style={{
            border: "1px solid " + (b.pieces > 0 ? "var(--rule)" : "rgba(201,133,0,.35)"),
            borderRadius: 4, padding: "10px 12px",
            background: b.pieces > 0 ? "var(--surface-3)" : "rgba(201,133,0,.06)",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
              <strong style={{ color: "var(--accent-dim)", fontSize: 13 }}>{b.bed}</strong>
              {b.pieces > 0 ? (
                <>
                  <span className="muted">{count(b.pieces)} pc</span>
                  <span className="muted">{count(Math.round(b.sf))} SF</span>
                  <span className="muted">{fmt(b.cy)} CY</span>
                </>
              ) : (
                <Badge tone="amber">No pieces — bed activity</Badge>
              )}
              {b.leadman && <Badge tone="blue">{b.leadman}</Badge>}
              {b.pours.length > 1 && <Badge>{b.pours.length} pours</Badge>}
              {b.jobs.length > 1 && <Badge tone="amber">{b.jobs.length} jobs</Badge>}
            </div>

            {b.notes.map((n, i) => (
              <div key={i} style={{ fontSize: 11, color: "#ecb84a", marginBottom: 6 }}>⚑ {n}</div>
            ))}

            {b.bucket.some((r) => r.isPour) && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Pos</th><th>Piece Mark</th><th>Job</th><th>Phase</th>
                      <th style={{ textAlign: "right" }}>Qty</th>
                      <th style={{ textAlign: "right" }}>SF</th>
                      <th style={{ textAlign: "right" }}>CY</th>
                      <th>Pour</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.bucket.filter((r) => r.isPour)
                      .sort((x, y) => (x.pos || 0) - (y.pos || 0))
                      .map((r, i) => (
                        <tr key={`${r.castNo}-${i}`}>
                          <td className="num muted">{r.pos || "—"}</td>
                          <td style={{ color: "var(--text-primary)", fontWeight: 600 }}>{r.mark}</td>
                          <td title={r.job} style={{ maxWidth: 230, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.jobNo && <span className="muted">{r.jobNo} </span>}{r.jobTitle}
                          </td>
                          <td className="muted">{r.phaseName || "—"}</td>
                          <td className="num" style={{ textAlign: "right" }}>{r.qty}</td>
                          <td className="num" style={{ textAlign: "right" }}>{count(Math.round(r.sf))}</td>
                          <td className="num" style={{ textAlign: "right" }}>{fmt(r.cy)}</td>
                          <td className="muted">{r.pourNo || "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
