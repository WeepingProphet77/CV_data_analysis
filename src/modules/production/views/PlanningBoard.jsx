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
 */
import React, { useMemo, useState } from "react";
import { Panel } from "../../../components/ui.jsx";
import { groupBy, sumBy, rollup } from "../../../core/aggregate.js";
import { fmt, count, isoToDate } from "../../../core/format.js";
import { daySpan, buildColumns } from "../board.js";
import { colorMapFor, OTHER_COLOR, MAX_SERIES } from "../../../core/palette.js";
import PieceDetail from "./PieceDetail.jsx";

/** Cards can be tinted by any low-cardinality dimension the export carries. */
const COLOR_BY = [
  { id: "job", label: "Job", get: (r) => r.job, name: (r) => r.jobNo || r.jobTitle },
  { id: "phase", label: "Phase", get: (r) => r.phaseName || "(none)", name: (r) => r.phaseName || "(none)" },
  { id: "prdCode", label: "Product Code", get: (r) => r.prdCode || "(none)", name: (r) => r.prdCode || "(none)" },
  { id: "none", label: "Nothing", get: () => "", name: () => "" },
];

const MAX_DAYS = 70;   // a wider window stops being readable as a grid

export default function PlanningBoard({ rows, plant, plants, onPlant }) {
  const [colorById, setColorById] = useState("job");
  const [onlyWithData, setOnlyWithData] = useState(true);
  const [selected, setSelected] = useState(null);

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

  /** Bed rows, grouped by plant so "All plants" stays legible. */
  const bedRows = useMemo(() => {
    const beds = [...groupBy(rows, (r) => r.bedKey)].map(([bedKey, bucket]) => ({
      bedKey,
      bed: bucket[0].bed,
      plant: bucket[0].plant,
      pieces: sumBy(bucket, (r) => r.qty),
      inWindow: bucket.some((r) => days.includes(r.date)),
    }));
    const kept = onlyWithData ? beds.filter((b) => b.pieces > 0 || b.inWindow) : beds;
    return kept.sort(
      (a, b) =>
        a.plant.localeCompare(b.plant) ||
        a.bed.localeCompare(b.bed, undefined, { numeric: true, sensitivity: "base" })
    );
  }, [rows, days, onlyWithData]);

  /** One color per key, ranked by volume so the busiest jobs get slot 1..8. */
  const colors = useMemo(() => {
    if (colorBy.id === "none") return new Map();
    const ranked = rollup(rows, colorBy.get, (r) => r.qty).slice(0, MAX_SERIES).map((g) => g.key);
    return colorMapFor(ranked);
  }, [rows, colorBy]);

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

  const multiPlant = new Set(bedRows.map((b) => b.plant)).size > 1;
  const siblings = selected ? cellIndex.get(`${selected.bedKey}|${selected.date}`) ?? [] : [];

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

        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 11 }}>
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
                          {cell?.map((r, j) =>
                            r.isPour ? (
                              <button
                                key={`${r.castNo}-${j}`}
                                className="pcard"
                                aria-pressed={selected === r}
                                style={{ borderLeftColor: colors.get(colorBy.get(r)) ?? (colorBy.id === "none" ? "var(--rule)" : OTHER_COLOR) }}
                                onClick={() => setSelected(r)}
                                title={`${r.job} — ${r.mark}`}
                              >
                                <span className="jobno">{r.jobNo}</span>
                                <span className="mark">{r.mark}</span>
                                <div className="meta">
                                  {count(Math.round(r.sf))} SF · {fmt(r.cy)} CY{r.pos ? ` · pos ${r.pos}` : ""}
                                </div>
                              </button>
                            ) : (
                              <div key={`${r.castNo}-${j}`} className="bedwork" title={r.note}>
                                {r.note || "Bed activity"}
                              </div>
                            )
                          )}
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
      </p>

      {selected && (
        <PieceDetail piece={selected} siblings={siblings}
                     onClose={() => setSelected(null)} onSelect={setSelected} />
      )}
    </div>
  );
}
