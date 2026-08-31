/**
 * Everything the export carries about one scheduled piece.
 *
 * Deliberately exhaustive: every schema field is listed whether or not it has a
 * value, so "blank" is visibly different from "not in this report". Columns the
 * module's schema doesn't name are carried through the parser as `row.extra`
 * and listed too, so a column Concrete Vision adds later shows up here without
 * any code change.
 *
 * Opened by clicking a piece card on the planning board. Escape closes it.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "../../../components/ui.jsx";
import { fmt, count, isoToDate } from "../../../core/format.js";

/** One definition row. `raw` shows the source text when it differs from the
 *  cleaned-up value, so nothing is hidden behind a derivation. */
function Row({ label, value, raw }) {
  const empty = value === "" || value == null;
  return (
    <>
      <dt>{label}</dt>
      <dd style={empty ? { color: "var(--text-muted)" } : undefined}>
        {empty ? "—" : value}
        {raw && raw !== String(value) && (
          <span style={{ color: "var(--text-muted)", fontSize: 10.5, display: "block" }}>
            source: {raw}
          </span>
        )}
      </dd>
    </>
  );
}

const Section = ({ title, children }) => (
  <>
    <div className="section-label" style={{ marginTop: 16 }}>{title}</div>
    <dl>{children}</dl>
  </>
);

export default function PieceDetail({
  piece, siblings = [], related = [], ticket, ticketsLoaded = false, move, onClose, onSelect,
}) {
  const ref = useRef(null);
  const [showEmpty, setShowEmpty] = useState(true);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const others = useMemo(() => siblings.filter((p) => p !== piece), [siblings, piece]);
  const elsewhere = useMemo(
    () => related.filter((p) => p !== piece).slice(0, 12),
    [related, piece]
  );

  if (!piece) return null;

  const day = isoToDate(piece.date).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const extra = piece.extra ?? {};
  const extraKeys = Object.keys(extra);

  // With "show empty" off, a section that is entirely blank is dropped whole.
  const filt = (entries) => (showEmpty ? entries : entries.filter(([, v]) => v !== "" && v != null));
  const render = (entries) =>
    filt(entries).map(([label, value, raw]) => <Row key={label} label={label} value={value} raw={raw} />);
  const section = (title, entries) => {
    const kept = filt(entries);
    return kept.length ? <Section title={title}>{render(entries)}</Section> : null;
  };

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
          {ticket && <Badge tone="red">No piece ticket</Badge>}
          {move && move.kind === "later" && <Badge tone="amber">{move.days} days later</Badge>}
          {move && move.kind === "earlier" && <Badge tone="green">{Math.abs(move.days)} days earlier</Badge>}
          {move && move.kind === "added" && <Badge tone="blue">New this upload</Badge>}
        </div>

        <div className="cards" style={{ gridTemplateColumns: "repeat(2, 1fr)", marginBottom: 4 }}>
          <div className="card"><div className="value sm">{piece.qty}</div><div className="label">Qty</div></div>
          <div className="card"><div className="value sm">{count(Math.round(piece.sf))}</div><div className="label">Square Feet</div></div>
          <div className="card"><div className="value sm">{fmt(piece.cy, 2)}</div><div className="label">Cubic Yards</div></div>
          <div className="card"><div className="value sm">{fmt(piece.lf, 2)}</div><div className="label">Linear Feet</div></div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "var(--text-secondary)", cursor: "pointer", marginTop: 10 }}>
          <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
          Show fields that are empty for this piece
        </label>

        {/* Not a column in either export — a comparison against the schedule
            that was loaded before this one, so it says what it was measured
            against rather than presenting itself as reported data. */}
        {move && move.kind !== "same" && (
          <Section title="Since the previous schedule">
            <Row label="Moved"
                 value={move.kind === "added"
                   ? "New — not in the previous export"
                   : `${Math.abs(move.days)} day${Math.abs(move.days) === 1 ? "" : "s"} ${move.days < 0 ? "earlier" : "later"}`} />
            <Row label="Was scheduled" value={move.from || ""} />
            <Row label="Now scheduled" value={move.to || ""} />
            <Row label="Was on bed" value={move.fromBed || ""}
                 raw={move.bedChanged ? "moved to a different bed" : undefined} />
            <Row label="Was at plant" value={move.fromPlant || ""}
                 raw={move.plantChanged ? "moved to a different plant" : undefined} />
          </Section>
        )}

        {/* The one field on this drawer that does not come from the schedule
            export. It is stated as a separate section, and the section says
            which report it came from, so it can never read as a column
            Concrete Vision's schedule carries. */}
        {ticketsLoaded && piece.isPour && (
          ticket ? (
            <Section title="Missing Piece Mark Ticket report">
              <Row label="Ticket" value="MISSING — this piece has no ticket drawing" />
              <Row label="Drawn By" value={ticket.drawnBy || ""} />
              <Row label="Drafting group" value={ticket.group} />
              <Row label="Bed date (ticket report)" value={ticket.date}
                   raw={ticket.date && ticket.date !== piece.date
                     ? `the schedule says ${piece.date} — the two reports were pulled at different times`
                     : undefined} />
              <Row label="Length × Width × Depth"
                   value={[ticket.length, ticket.width, ticket.depth].filter(Boolean).join("  ×  ")} />
              <Row label="Weight" value={ticket.weight ? `${count(Math.round(ticket.weight))} lb` : ""} />
              <Row label="Plant (ticket report)" value={ticket.plant} />
            </Section>
          ) : (
            <Section title="Missing Piece Mark Ticket report">
              <Row label="Ticket" value="Not listed as missing" />
            </Section>
          )
        )}

        {section("Schedule", [
          ["Plant", piece.plant],
          ["Bed", piece.bed],
          ["Bed Date", piece.date],
          ["Position", piece.pos],
          ["Leadman", piece.leadman],
        ])}

        {section("Piece", [
          ["Piece Mark", piece.mark],
          ["Qty", piece.qty],
          ["Total SF", piece.sf],
          ["Total CY", piece.cy],
          ["Total LF", piece.lf],
          ["Product Code", piece.prdCode],
          ["Cross Section", piece.crossSection],
          ["Mold", piece.mold],
        ])}

        {section("Job", [
          ["Job Number", piece.jobNo],
          ["Job Name", piece.jobTitle, piece.job],
          ["Phase", piece.phaseName, piece.phase],
        ])}

        {section("Identifiers", [
          ["Cast No.", piece.castNo],
          ["CTRL Num", piece.ctrlNum],
          ["Pour No.", piece.pourNo],
          ["Cert", piece.cert],
        ])}

        {section("Bed Comment", [
          ["Comment", piece.note, piece.comment],
        ])}

        {extraKeys.length > 0 && (
          <Section title="Other columns in this export">
            {extraKeys.map((k) => <Row key={k} label={k} value={extra[k]} />)}
          </Section>
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

        {elsewhere.length > 0 && (
          <>
            <div className="section-label" style={{ marginTop: 18 }}>
              Mark {piece.mark} elsewhere in this schedule ({related.length - 1})
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              {elsewhere.map((p, i) => (
                <button key={`${p.castNo}-x${i}`} className="pcard" onClick={() => onSelect?.(p)}
                        style={{ borderLeftColor: "var(--rule)" }}>
                  <span className="mark">{p.date}</span>
                  <div className="meta">{p.plant} · {p.bed}{p.pos ? ` · pos ${p.pos}` : ""}</div>
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 6 }}>
              The same mark on more than one date usually means a re-lay or a repeated pour.
            </p>
          </>
        )}

        <p className="hint" style={{ marginTop: 18 }}>
          Every field above comes from the Scheduled Production Report. Shop-completion
          status is not in that export — see the note under the board.
        </p>
      </aside>
    </>
  );
}
