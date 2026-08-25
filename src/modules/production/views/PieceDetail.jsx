/**
 * Everything the export carries about one scheduled piece.
 *
 * Opened by clicking a piece card on the planning board. Escape closes it, and
 * focus moves to the panel so a keyboard user isn't stranded behind the grid.
 */
import React, { useEffect, useRef } from "react";
import { Badge } from "../../../components/ui.jsx";
import { fmt, count, isoToDate } from "../../../core/format.js";

const Row = ({ label, children }) =>
  children === "" || children == null ? null : (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );

export default function PieceDetail({ piece, siblings = [], onClose, onSelect }) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!piece) return null;

  const day = isoToDate(piece.date).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const others = siblings.filter((p) => p !== piece);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Piece detail" tabIndex={-1} ref={ref}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--accent)", letterSpacing: 1 }}>
              {piece.mark || "Bed activity"}
            </div>
            <div className="subtitle" style={{ marginTop: 2 }}>{day}</div>
          </div>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>

        <div style={{ margin: "12px 0" }}>
          <Badge tone="blue">{piece.plant}</Badge>
          <Badge>{piece.bed}</Badge>
          {piece.pos ? <Badge>Pos {piece.pos}</Badge> : null}
          {piece.isPour ? null : <Badge tone="amber">No pieces</Badge>}
        </div>

        <div className="section-label">Quantities</div>
        <div className="cards" style={{ gridTemplateColumns: "repeat(2, 1fr)", marginBottom: 14 }}>
          <div className="card"><div className="value sm">{piece.qty}</div><div className="label">Qty</div></div>
          <div className="card"><div className="value sm">{count(Math.round(piece.sf))}</div><div className="label">Square Feet</div></div>
          <div className="card"><div className="value sm">{fmt(piece.cy, 2)}</div><div className="label">Cubic Yards</div></div>
          <div className="card"><div className="value sm">{fmt(piece.lf, 2)}</div><div className="label">Linear Feet</div></div>
        </div>

        <div className="section-label">Job</div>
        <dl>
          <Row label="Job Number">{piece.jobNo}</Row>
          <Row label="Job Name">{piece.jobTitle}</Row>
          <Row label="Phase">{piece.phaseName}</Row>
        </dl>

        <div className="section-label" style={{ marginTop: 16 }}>Production</div>
        <dl>
          <Row label="Piece Mark">{piece.mark}</Row>
          <Row label="Product Code">{piece.prdCode}</Row>
          <Row label="Cross Section">{piece.crossSection}</Row>
          <Row label="Mold">{piece.mold}</Row>
          <Row label="Leadman">{piece.leadman}</Row>
        </dl>

        <div className="section-label" style={{ marginTop: 16 }}>Identifiers</div>
        <dl>
          <Row label="Cast No.">{piece.castNo}</Row>
          <Row label="CTRL Num">{piece.ctrlNum}</Row>
          <Row label="Pour No.">{piece.pourNo}</Row>
        </dl>

        {piece.note && (
          <>
            <div className="section-label" style={{ marginTop: 16 }}>Bed Comment</div>
            <p style={{ fontSize: 12, color: "#ecb84a", lineHeight: 1.6 }}>{piece.note}</p>
          </>
        )}

        {others.length > 0 && (
          <>
            <div className="section-label" style={{ marginTop: 18 }}>
              Also on {piece.bed} that day ({others.length})
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              {others.map((p, i) => (
                <button key={`${p.castNo}-${i}`} className="pcard" onClick={() => onSelect?.(p)}
                        style={{ borderLeftColor: "var(--rule)" }}>
                  <span className="jobno">{p.jobNo}</span>
                  <span className="mark">{p.mark || "bed activity"}</span>
                  <div className="meta">
                    {p.qty ? `${count(Math.round(p.sf))} SF · ${fmt(p.cy)} CY` : p.note || "no pieces"}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        <p className="hint" style={{ marginTop: 18 }}>
          These are every field the Scheduled Production Report carries for this piece.
          Shop-completion status is not in the export — see the note above the board.
        </p>
      </aside>
    </>
  );
}
