/**
 * Vertical column chart for per-period magnitude — discrete days, not a trend.
 *
 * Columns follow the house spec: capped thickness, a 4px rounded cap with a
 * square base, a 2px surface gap between neighbours, and a hairline baseline.
 * Accumulation belongs in LineChart; this is for "how much on each day".
 *
 * data: [{ x: 'YYYY-MM-DD', y: number }]
 */
import React, { useMemo, useState } from "react";
import { useSize } from "../../core/hooks.js";
import { fmt, shortDate } from "../../core/format.js";
import { niceTicks, sampleTicks } from "./scale.js";

const GRID = "rgba(90,130,175,0.22)";
const AXIS_TEXT = "#8fb6d4";
const MAX_COL = 34;
const GAP = 2;             // the surface gap between adjacent columns

export default function ColumnChart({
  data,
  height = 260,
  yLabel = "",
  color = "var(--series-1)",
  valueFormat = (v) => fmt(v),
  onSelect,
  selected,
  emptyMessage = "No data in the current selection.",
}) {
  const [wrapRef, { width }] = useSize({ width: 760 });
  const [hover, setHover] = useState(null);

  const geom = useMemo(() => {
    if (!data.length) return null;
    const maxY = Math.max(...data.map((d) => d.y), 0);
    const { ticks, max: yMax } = niceTicks(0, maxY, 4);
    const padL = 14 + Math.max(30, String(valueFormat(yMax)).length * 7.5);
    const padR = 10, padT = 10, padB = 30;
    const w = Math.max(width || 760, 320);
    const plotW = w - padL - padR;
    const band = plotW / data.length;
    const colW = Math.max(Math.min(band - GAP, MAX_COL), 1);
    const y = (v) => (height - padB) - (yMax ? (v / yMax) * (height - padB - padT) : 0);
    return { ticks, yMax, padL, padR, padT, padB, w, band, colW, y };
  }, [data, width, height, valueFormat]);

  if (!geom) {
    return <div ref={wrapRef} style={{ height, display: "grid", placeItems: "center", color: "#5d89ab", fontSize: 12 }}>
      {emptyMessage}
    </div>;
  }

  const { ticks, padL, padT, padB, w, band, colW, y } = geom;
  const xTicks = new Set(sampleTicks(data.map((d) => d.x), Math.max(3, Math.min(8, Math.floor(w / 95)))));

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <svg width="100%" viewBox={`0 0 ${w} ${height}`} role="img"
           aria-label={`${yLabel || "Value"} per day across ${data.length} days`}
           style={{ display: "block" }} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - geom.padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
            <text x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="middle"
                  fill={AXIS_TEXT} fontSize="10" fontFamily="inherit">{valueFormat(t)}</text>
          </g>
        ))}
        {yLabel && (
          <text x={padL - 8} y={padT - 1} textAnchor="end" fill="#5d89ab" fontSize="9"
                fontFamily="inherit" letterSpacing="1">{yLabel.toUpperCase()}</text>
        )}

        {data.map((d, i) => {
          const cx = padL + i * band + band / 2;
          const x = cx - colW / 2;
          const top = y(d.y);
          const h = Math.max((height - padB) - top, d.y > 0 ? 2 : 0);
          const active = hover === d.x || selected === d.x;
          return (
            <g key={d.x}
               onMouseEnter={() => setHover(d.x)}
               onClick={() => onSelect?.(d.x)}
               style={{ cursor: onSelect ? "pointer" : "default" }}>
              {/* Hit target is the full band, so thin columns stay easy to hit */}
              <rect x={padL + i * band} y={padT} width={band} height={height - padB - padT} fill="transparent" />
              {h > 0 && <path d={cap(x, top, colW, h, 4)} fill={color} opacity={active ? 1 : 0.82} />}
              {selected === d.x && (
                <rect x={x - 1.5} y={top - 1.5} width={colW + 3} height={h + 3} rx="4"
                      fill="none" stroke="var(--accent)" strokeWidth="1.5" />
              )}
            </g>
          );
        })}

        <line x1={padL} x2={w - geom.padR} y1={height - padB} y2={height - padB} stroke={GRID} strokeWidth="1" />
        {data.map((d, i) => xTicks.has(d.x) && (
          <text key={d.x} x={padL + i * band + band / 2} y={height - padB + 15} textAnchor="middle"
                fill={AXIS_TEXT} fontSize="10" fontFamily="inherit">{shortDate(d.x)}</text>
        ))}
      </svg>

      {hover && (() => {
        const d = data.find((r) => r.x === hover);
        const i = data.indexOf(d);
        return (
          <div style={{
            position: "absolute", pointerEvents: "none", zIndex: 5, top: 4,
            left: `${Math.min(Math.max(((padL + i * band + band / 2) / w) * 100, 2), 78)}%`,
            transform: "translateX(8px)",
            background: "rgba(10,22,42,0.96)", border: "1px solid var(--border-strong)",
            borderRadius: 4, padding: "6px 9px", fontSize: 11, whiteSpace: "nowrap",
            boxShadow: "0 6px 24px rgba(0,0,0,.5)",
          }}>
            <div style={{ color: "var(--accent)", fontWeight: 700 }}>{d.x}</div>
            <div style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
              {valueFormat(d.y)}{yLabel ? ` ${yLabel.toLowerCase()}` : ""}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/** Column path: 4px rounded cap, square at the baseline. */
function cap(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}
