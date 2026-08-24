/**
 * Multi-series time-line chart with a crosshair tooltip.
 *
 * Marks follow the house spec: 2px lines with round joins, ≥8px end markers
 * carrying a 2px surface ring so they stay readable where lines cross, hairline
 * recessive gridlines, and an optional ~10%-opacity area wash for a single
 * series. Identity is never color-alone — two or more series always get a
 * legend, up to four also get direct end labels, and a table view is one click
 * away.
 *
 * series: [{ key, label, color, points: [{ x: 'YYYY-MM-DD', y: number }] }]
 */
import React, { useMemo, useState } from "react";
import { useSize } from "../../core/hooks.js";
import { isoToDate, shortDate, fmt } from "../../core/format.js";
import { linear, niceTicks, sampleTicks } from "./scale.js";

const SURFACE = "#13243f";      // must match --surface-1: the ring/gap color
const GRID = "rgba(90,130,175,0.22)";
const AXIS_TEXT = "#8fb6d4";
const MUTED_TEXT = "#5d89ab";

export default function LineChart({
  series,
  height = 320,
  yLabel = "Hours",
  valueFormat = (v) => fmt(v),
  area = false,
  emptyMessage = "No data in the current selection.",
}) {
  const [wrapRef, { width }] = useSize({ width: 760, height });
  const [hoverIdx, setHoverIdx] = useState(null);
  const [showTable, setShowTable] = useState(false);

  const live = series.filter((s) => s.points?.length);

  /* -- Geometry ------------------------------------------------------- */
  const geom = useMemo(() => {
    if (!live.length) return null;

    // Every series shares one x domain, so a crosshair index means the same
    // date on all of them.
    const xs = [...new Set(live.flatMap((s) => s.points.map((p) => p.x)))].sort();
    const xTimes = xs.map((d) => isoToDate(d).getTime());
    const maxY = Math.max(...live.flatMap((s) => s.points.map((p) => p.y)), 0);
    const { ticks: yTicks, max: yMax } = niceTicks(0, maxY, 5);

    // Left pad follows the widest y label so long hour totals never clip.
    const padL = 18 + Math.max(34, String(valueFormat(yMax)).length * 7.5);
    const showEndLabels = live.length >= 2 && live.length <= 4;
    const padR = showEndLabels ? 96 : 18;
    const padT = 12;
    const padB = 34;

    const w = Math.max(width || 760, 320);
    const x = linear([xTimes[0], xTimes[xTimes.length - 1]], [padL, w - padR]);
    const y = linear([0, yMax], [height - padB, padT]);

    const paths = live.map((s) => {
      const byDate = new Map(s.points.map((p) => [p.x, p.y]));
      // Carry the last known value across gaps: a cumulative total does not
      // drop to zero on a day with no charges.
      let last = null;
      const pts = [];
      xs.forEach((d, i) => {
        const v = byDate.has(d) ? byDate.get(d) : last;
        if (v == null) return;
        last = v;
        pts.push({ i, d, v, px: x(xTimes[i]), py: y(v) });
      });
      return { ...s, pts, last: pts[pts.length - 1] };
    });

    return { xs, xTimes, x, y, yTicks, yMax, w, padL, padR, padT, padB, paths, showEndLabels };
  }, [live, width, height, valueFormat]);

  if (!geom) {
    return (
      <div ref={wrapRef} style={{ height, display: "grid", placeItems: "center", color: MUTED_TEXT, fontSize: 12 }}>
        {emptyMessage}
      </div>
    );
  }

  const { xs, xTimes, x, y, yTicks, w, padL, padR, padB, padT, paths, showEndLabels } = geom;

  const line = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(" ");

  /* -- Hover ---------------------------------------------------------- */
  function onMove(e) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * w;
    if (px < padL - 8 || px > w - padR + 8) return setHoverIdx(null);
    // Nearest x index, so the crosshair snaps to a real observation.
    let best = 0, bestD = Infinity;
    xTimes.forEach((t, i) => {
      const d = Math.abs(x(t) - px);
      if (d < bestD) { bestD = d; best = i; }
    });
    setHoverIdx(best);
  }

  const hoverDate = hoverIdx == null ? null : xs[hoverIdx];
  const hoverRows =
    hoverIdx == null
      ? []
      : paths
          .map((s) => ({ label: s.label, color: s.color, pt: s.pts.find((p) => p.i === hoverIdx) }))
          .filter((r) => r.pt)
          .sort((a, b) => b.pt.v - a.pt.v);

  const xTickDates = sampleTicks(xs, Math.max(3, Math.min(7, Math.floor(w / 110))));

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${w} ${height}`}
        role="img"
        aria-label={`${yLabel} over time, ${paths.length} series`}
        style={{ display: "block", overflow: "visible" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Gridlines — hairline, solid, one step off the surface */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
            <text x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="middle"
                  fill={AXIS_TEXT} fontSize="10" fontFamily="inherit">
              {valueFormat(t)}
            </text>
          </g>
        ))}

        {/* X axis */}
        <line x1={padL} x2={w - padR} y1={height - padB} y2={height - padB} stroke={GRID} strokeWidth="1" />
        {xTickDates.map((d) => (
          <text key={d} x={x(isoToDate(d).getTime())} y={height - padB + 16} textAnchor="middle"
                fill={AXIS_TEXT} fontSize="10" fontFamily="inherit">
            {shortDate(d)}
          </text>
        ))}
        <text x={padL - 8} y={padT - 2} textAnchor="end" fill={MUTED_TEXT} fontSize="9"
              fontFamily="inherit" letterSpacing="1">
          {yLabel.toUpperCase()}
        </text>

        {/* Crosshair sits under the marks so it never covers a line */}
        {hoverIdx != null && (
          <line x1={x(xTimes[hoverIdx])} x2={x(xTimes[hoverIdx])} y1={padT} y2={height - padB}
                stroke="rgba(0,240,255,0.45)" strokeWidth="1" />
        )}

        {/* Area wash: only for a lone series, where overlap can't muddy it */}
        {area && paths.length === 1 && paths[0].pts.length > 1 && (
          <path
            d={`${line(paths[0].pts)} L${paths[0].last.px},${y(0)} L${paths[0].pts[0].px},${y(0)} Z`}
            fill={paths[0].color}
            opacity="0.10"
          />
        )}

        {paths.map((s) => (
          <path key={s.key} d={line(s.pts)} fill="none" stroke={s.color}
                strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* End markers: ≥8px with a 2px surface ring */}
        {paths.map((s) => s.last && (
          <circle key={s.key} cx={s.last.px} cy={s.last.py} r="4"
                  fill={s.color} stroke={SURFACE} strokeWidth="2" />
        ))}

        {/* Hovered points, same ring treatment */}
        {hoverIdx != null && paths.map((s) => {
          const p = s.pts.find((q) => q.i === hoverIdx);
          return p ? (
            <circle key={s.key} cx={p.px} cy={p.py} r="4.5"
                    fill={s.color} stroke={SURFACE} strokeWidth="2" />
          ) : null;
        })}

        {/* Direct end labels — only up to 4 series, and only where they clear */}
        {showEndLabels && dedupeLabels(paths, 13).map((s) => (
          <text key={s.key} x={s.last.px + 9} y={s.labelY} dominantBaseline="middle"
                fill={AXIS_TEXT} fontSize="10" fontFamily="inherit">
            {truncate(s.label, 13)}
          </text>
        ))}
      </svg>

      {/* Legend — always present for two or more series */}
      {paths.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 10 }}>
          {paths.map((s) => (
            <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: AXIS_TEXT }}>
              <i style={{ width: 14, height: 2, background: s.color, borderRadius: 1, display: "inline-block" }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      {/* Tooltip */}
      {hoverIdx != null && hoverRows.length > 0 && (
        <div
          style={{
            position: "absolute", pointerEvents: "none", zIndex: 5,
            left: `${Math.min(Math.max((x(xTimes[hoverIdx]) / w) * 100, 2), 72)}%`,
            top: 8, transform: "translateX(10px)",
            background: "rgba(10,22,42,0.96)", border: "1px solid var(--border-strong)",
            borderRadius: 4, padding: "8px 10px", fontSize: 11, minWidth: 150,
            boxShadow: "0 6px 24px rgba(0,0,0,.5)",
          }}
        >
          <div style={{ color: "var(--accent)", fontWeight: 700, marginBottom: 5, letterSpacing: .5 }}>
            {hoverDate}
          </div>
          {hoverRows.slice(0, 9).map((r) => (
            <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <i style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flex: "0 0 auto" }} />
              <span style={{ color: AXIS_TEXT, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 190 }}>
                {r.label}
              </span>
              <strong style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                {valueFormat(r.pt.v)}
              </strong>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <button className="btn ghost" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Hide table" : "View as table"}
        </button>
      </div>

      {showTable && (
        <div className="table-wrap" style={{ marginTop: 8, maxHeight: 320, overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                {paths.map((s) => <th key={s.key} style={{ textAlign: "right" }}>{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {xs.map((d, i) => (
                <tr key={d}>
                  <td className="nowrap">{d}</td>
                  {paths.map((s) => {
                    const p = s.pts.find((q) => q.i === i);
                    return <td key={s.key} className="num" style={{ textAlign: "right" }}>
                      {p ? valueFormat(p.v) : "—"}
                    </td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Nudge colliding end labels apart just enough to stay legible. */
function dedupeLabels(paths, minGap) {
  const withLast = paths.filter((s) => s.last).map((s) => ({ ...s, labelY: s.last.py }));
  withLast.sort((a, b) => a.labelY - b.labelY);
  for (let i = 1; i < withLast.length; i++) {
    const gap = withLast[i].labelY - withLast[i - 1].labelY;
    if (gap < minGap) withLast[i].labelY = withLast[i - 1].labelY + minGap;
  }
  return withLast;
}

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
