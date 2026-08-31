/**
 * Planning board — beds down the side, days across the top.
 *
 * Modeled on Concrete Vision's own Production Planning view: a bed x day grid
 * whose cells hold piece cards labelled "<job no> <piece mark>", with per-day
 * totals across the top and per-week totals interleaved between the weeks.
 * Clicking a card opens everything the export knows about that piece.
 *
 * Deliberate difference from Concrete Vision: CV colors each card by shop
 * status (pour sheets attached, steel shop complete, bed verified...). The
 * Scheduled Production Report carries none of those fields, so cards are
 * colored by a dimension the export does have — job, phase or product code.
 *
 * The one shop-status-like signal the board *can* show is the missing piece
 * ticket, and it comes from a second export (../ticketParse.js). It is drawn as
 * a red ring and a NO TICKET chip rather than a card color, because it is an
 * alert and not a category: it has to stay legible whatever the cards are
 * currently tinted by, and it must never consume one of the eight validated
 * categorical slots (CLAUDE.md §5).
 */
import React, { useMemo, useState } from "react";
import { Panel } from "../../../components/ui.jsx";
import { groupBy, sumBy, rollup } from "../../../core/aggregate.js";
import { fmt, count, isoToDate } from "../../../core/format.js";
import { daySpan, buildColumns } from "../board.js";
import { colorMapFor, OTHER_COLOR, MAX_SERIES } from "../../../core/palette.js";
import { ticketFor } from "../tickets.js";
import PieceDetail from "./PieceDetail.jsx";

/** Cards can be tinted by any low-cardinality dimension the export carries. */
const COLOR_BY = [
  { id: "job", label: "Job", get: (r) => r.job, name: (r) => r.jobNo || r.jobTitle },
  { id: "phase", label: "Phase", get: (r) => r.phaseName || "(none)", name: (r) => r.phaseName || "(none)" },
  { id: "prdCode", label: "Product Code", get: (r) => r.prdCode || "(none)", name: (r) => r.prdCode || "(none)" },
  { id: "none", label: "Nothing", get: () => "", name: () => "" },
];

const MAX_DAYS = 70;   // a wider window stops being readable as a grid

export default function PlanningBoard({ rows, plant, plants, onPlant, tickets }) {
  const [colorById, setColorById] = useState("job");
  const [onlyWithData, setOnlyWithData] = useState(true);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [selected, setSelected] = useState(null);

  /**
   * The missing-ticket lookup, or an empty Map when no ticket report is loaded.
   * An empty Map flags nothing, so every path below works unchanged whether or
   * not the second export is present.
   */
  const ticketIdx = tickets ?? new Map();
  const hasTickets = ticketIdx.size > 0;
  const ticketOf = (r) => ticketFor(ticketIdx, r);

  const colorBy = COLOR_BY.find((c) => c.id === colorById) ?? COLOR_BY[0];

  const range = useMemo(() => {
    const dates = rows.map((r) => r.date).filter(Boolean).sort();
    return { min: dates[0], max: dates[dates.length - 1] };
  }, [rows]);

  const days = useMemo(() => {
    if (!range.min) return [];
    return daySpan(range.min, range.max).slice(0, MAX_DAYS);
  }, [range]);

  const columns = useMemo(() => buildColumns(days), [days]);

  /** rows indexed by "bedKey|date" so a cell lookup is O(1). */
  const cellIndex = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const k = `${r.bedKey}|${r.date}`;
      const bucket = map.get(k);
      if (bucket) bucket.push(r); else map.set(k, [r]);
    }
    return map;
  }, [rows]);

  /**
   * Scheduled rows whose piece has no ticket. Computed once per render pass
   * rather than per cell — the board draws thousands of cells and calling the
   * lookup inside the grid would be the only quadratic thing on the page.
   */
  const missing = useMemo(
    () => (hasTickets ? rows.filter((r) => r.isPour && ticketOf(r)) : []),
    // ticketOf closes over ticketIdx; hasTickets tracks whether it has content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, ticketIdx, hasTickets]
  );
  const missingRows = useMemo(() => new Set(missing), [missing]);
  const missingPieces = useMemo(() => sumBy(missing, (r) => r.qty), [missing]);

  /** Bed rows, grouped by plant so "All plants" stays legible. */
  const bedRows = useMemo(() => {
    const beds = [...groupBy(rows, (r) => r.bedKey)].map(([bedKey, bucket]) => ({
      bedKey,
      bed: bucket[0].bed,
      plant: bucket[0].plant,
      pieces: sumBy(bucket, (r) => r.qty),
      inWindow: bucket.some((r) => days.includes(r.date)),
    }));
    let kept = onlyWithData ? beds.filter((b) => b.pieces > 0 || b.inWindow) : beds;
    // With "only missing" on, a bed holding nothing flagged is an empty row —
    // and with a handful of flagged pieces across 30 beds that is the whole
    // grid. Drop those rows; the ones that remain keep their real dates and
    // week columns, so a flagged piece still reads in context.
    if (onlyMissing) {
      const flaggedBeds = new Set([...missingRows].map((r) => r.bedKey));
      kept = kept.filter((b) => flaggedBeds.has(b.bedKey));
    }
    return kept.sort(
      (a, b) =>
        a.plant.localeCompare(b.plant) ||
        a.bed.localeCompare(b.bed, undefined, { numeric: true, sensitivity: "base" })
    );
  }, [rows, days, onlyWithData, onlyMissing, missingRows]);

  /** One color per key, ranked by volume so the busiest jobs get slot 1..8. */
  const colors = useMemo(() => {
    if (colorBy.id === "none") return new Map();
    const ranked = rollup(rows, colorBy.get, (r) => r.qty).slice(0, MAX_SERIES).map((g) => g.key);
    return colorMapFor(ranked);
  }, [rows, colorBy]);

  /** rows indexed by piece mark, for the "same mark elsewhere" cross-reference. */
  const markIndex = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (!r.mark) continue;
      const bucket = map.get(r.mark);
      if (bucket) bucket.push(r); else map.set(r.mark, [r]);
    }
    return map;
  }, [rows]);

  const dayTotals = useMemo(() => {
    const map = new Map();
    for (const [date, bucket] of groupBy(rows, (r) => r.date)) {
      map.set(date, {
        pours: new Set(bucket.filter((r) => r.isPour).map((r) => r.pourNo || `${r.bedKey}`)).size,
        pcs: sumBy(bucket, (r) => r.qty),
        cy: sumBy(bucket, (r) => r.cy),
        sf: sumBy(bucket, (r) => r.sf),
      });
    }
    return map;
  }, [rows]);

  const sumDays = (isos, pick) =>
    isos.reduce((a, d) => a + (pick(dayTotals.get(d) ?? { pours: 0, pcs: 0, cy: 0, sf: 0 })), 0);

  if (!days.length) {
    return <p className="muted" style={{ padding: 20 }}>Nothing scheduled in the current filters.</p>;
  }

  if (onlyMissing && !bedRows.length) {
    return (
      <p className="muted" style={{ padding: 20 }}>
        No scheduled piece in the current filters is missing its ticket.{" "}
        <button className="btn ghost" onClick={() => setOnlyMissing(false)}>Show every piece</button>
        <span style={{ display: "block", marginTop: 8, fontSize: 11 }}>
          Check the Tickets tab first — if the ticket report doesn't cover these dates,
          this means the report is silent about them, not that they are drawn.
        </span>
      </p>
    );
  }

  const multiPlant = new Set(bedRows.map((b) => b.plant)).size > 1;
  const siblings = selected ? cellIndex.get(`${selected.bedKey}|${selected.date}`) ?? [] : [];
  const related = selected?.mark ? markIndex.get(selected.mark) ?? [] : [];

  const summaryRows = [
    { key: "pours", label: "Total Pours", pick: (t) => t.pours, fmt: (v) => count(v) },
    { key: "pcs", label: "Total Pcs", pick: (t) => t.pcs, fmt: (v) => count(v) },
    { key: "cy", label: "Total CY", pick: (t) => t.cy, fmt: (v) => fmt(v, 2) },
    { key: "sf", label: "Total SF", pick: (t) => t.sf, fmt: (v) => count(Math.round(v)) },
  ];

  return (
    <div>
      <div className="filters">
        <span className="filter-label">Plant</span>
        <select className="field" value={plant} aria-label="Plant" onChange={(e) => onPlant(e.target.value)}>
          {plants.map((p) => <option key={p} value={p}>{p === "All" ? "All plants" : p}</option>)}
        </select>

        <span className="filter-label">Color by</span>
        <select className="field" value={colorById} aria-label="Color cards by"
                onChange={(e) => setColorById(e.target.value)}>
          {COLOR_BY.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}>
          <input type="checkbox" checked={onlyWithData} onChange={(e) => setOnlyWithData(e.target.checked)} />
          Only beds with data
        </label>

        {hasTickets && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--critical)", cursor: "pointer" }}>
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
            Only pieces missing a ticket
          </label>
        )}

        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 11 }}>
          {hasTickets && (
            <strong style={{ color: missingPieces ? "var(--critical)" : "var(--text-secondary)" }}>
              {count(missingPieces)} piece{missingPieces === 1 ? "" : "s"} missing a ticket ·{" "}
            </strong>
          )}
          {bedRows.length} beds · {days.length} days · {range.min} → {days[days.length - 1]}
        </span>
      </div>

      {colorBy.id !== "none" && colors.size > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginBottom: 10 }}>
          {[...colors].map(([key, c]) => {
            const sample = rows.find((r) => colorBy.get(r) === key);
            return (
              <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--text-secondary)" }}>
                <i style={{ width: 10, height: 10, borderRadius: 2, background: c, display: "inline-block" }} />
                {sample ? colorBy.name(sample) : key}
              </span>
            );
          })}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--text-muted)" }}>
            <i style={{ width: 10, height: 10, borderRadius: 2, background: OTHER_COLOR, display: "inline-block" }} />
            other
          </span>
        </div>
      )}

      <div className="board-scroll">
        <table className="board">
          <thead>
            <tr>
              <th className="bedcol">Bed</th>
              {columns.map((col, i) =>
                col.type === "day" ? (
                  <th key={`d${col.iso}`} className={dayTotals.has(col.iso) ? "" : "offday"}>
                    <div>{isoToDate(col.iso).toLocaleDateString(undefined, { weekday: "short" })}</div>
                    <div style={{ color: "var(--accent-dim)" }}>
                      {isoToDate(col.iso).toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" })}
                    </div>
                  </th>
                ) : (
                  <th key={`w${i}`} className="wk">WK<br />Totals</th>
                )
              )}
            </tr>
          </thead>

          <tbody>
            {summaryRows.map((s) => (
              <tr key={s.key} className="summary">
                <td className="bedcol">{s.label}</td>
                {columns.map((col, i) =>
                  col.type === "day" ? (
                    <td key={`d${col.iso}`} className={dayTotals.has(col.iso) ? "" : "offday"}>
                      {dayTotals.has(col.iso) ? s.fmt(s.pick(dayTotals.get(col.iso))) : ""}
                    </td>
                  ) : (
                    <td key={`w${i}`} className="wk" style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                      {s.fmt(sumDays(col.days, s.pick))}
                    </td>
                  )
                )}
              </tr>
            ))}

            {bedRows.map((b, idx) => {
              const showPlant = multiPlant && (idx === 0 || bedRows[idx - 1].plant !== b.plant);
              return (
                <React.Fragment key={b.bedKey}>
                  {showPlant && (
                    <tr className="plantrow">
                      <td colSpan={columns.length + 1}>{b.plant}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="bedcol" title={b.bedKey}>{b.bed}</td>
                    {columns.map((col, i) => {
                      if (col.type === "week") {
                        const wr = col.days.flatMap((d) => cellIndex.get(`${b.bedKey}|${d}`) ?? []);
                        return (
                          <td key={`w${i}`} className="wk" style={{ textAlign: "right", fontSize: 9.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {wr.length ? (
                              <>
                                <div>Pcs: {sumBy(wr, (r) => r.qty)}</div>
                                <div>CY: {fmt(sumBy(wr, (r) => r.cy))}</div>
                                <div>SF: {count(Math.round(sumBy(wr, (r) => r.sf)))}</div>
                                <div>LF: {fmt(sumBy(wr, (r) => r.lf))}</div>
                              </>
                            ) : null}
                          </td>
                        );
                      }
                      const cell = cellIndex.get(`${b.bedKey}|${col.iso}`);
                      return (
                        <td key={`d${col.iso}`} className={`day${dayTotals.has(col.iso) ? "" : " offday"}`}>
                          {cell?.map((r, j) => {
                            const noTicket = missingRows.has(r);
                            // "Only missing" hides the rest of the pieces but
                            // keeps the bed rows, so a flagged piece stays in
                            // the bed and week it actually belongs to.
                            if (onlyMissing && r.isPour && !noTicket) return null;
                            if (onlyMissing && !r.isPour) return null;
                            return r.isPour ? (
                              <button
                                key={`${r.castNo}-${j}`}
                                className={`pcard${noTicket ? " noticket" : ""}`}
                                aria-pressed={selected === r}
                                style={{ borderLeftColor: colors.get(colorBy.get(r)) ?? (colorBy.id === "none" ? "var(--rule)" : OTHER_COLOR) }}
                                onClick={() => setSelected(r)}
                                title={noTicket
                                  ? `${r.job} — ${r.mark} — NO PIECE TICKET`
                                  : `${r.job} — ${r.mark}`}
                              >
                                <span className="jobno">{r.jobNo}</span>
                                <span className="mark">{r.mark}</span>
                                {noTicket && <span className="tflag" aria-label="No piece ticket">NO TICKET</span>}
                                <div className="meta">
                                  {count(Math.round(r.sf))} SF · {fmt(r.cy)} CY{r.pos ? ` · pos ${r.pos}` : ""}
                                </div>
                              </button>
                            ) : (
                              <div key={`${r.castNo}-${j}`} className="bedwork" title={r.note}>
                                {r.note || "Bed activity"}
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        Concrete Vision tints each card by shop status — pour sheets attached, steel shop complete,
        bed verified, and so on. <strong>The Scheduled Production Report export carries none of those
        fields</strong>, so cards are tinted by {colorBy.label.toLowerCase()} instead. Grey columns are
        days with nothing scheduled. Dashed amber blocks are bed activity with no pieces.
        {hasTickets ? (
          <>
            {" "}A red <span className="tflag" style={{ marginLeft: 0 }}>NO TICKET</span> card is a piece
            listed in the Missing Piece Mark Ticket report — matched on job number and piece mark, not
            on bed date, so a rescheduled piece stays flagged.
          </>
        ) : (
          <>
            {" "}Load the Missing Piece Mark Ticket report on the <strong>Tickets</strong> tab to have
            pieces still waiting on a drawing flagged here.
          </>
        )}
      </p>

      {selected && (
        <PieceDetail piece={selected} siblings={siblings} related={related}
                     ticket={ticketOf(selected)} ticketsLoaded={hasTickets}
                     onClose={() => setSelected(null)} onSelect={setSelected} />
      )}
    </div>
  );
}
