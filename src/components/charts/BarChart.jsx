/**
 * Horizontal ranked bar chart — magnitude comparison across named categories.
 *
 * Bars are capped at 22px thick with a 4px rounded data-end and a square base,
 * separated by a surface gap rather than a stroke. Values ride the bar tip;
 * a label that would not fit inside stays outside it.
 *
 * data: [{ key, label, value, color }]
 */
import React, { useState } from "react";
import { useSize } from "../../core/hooks.js";
import { fmt } from "../../core/format.js";

const BAR = 22;
const GAP = 10;          // includes the 2px surface gap between neighbours
const AXIS_TEXT = "#8fb6d4";

export default function BarChart({
  data,
  valueFormat = (v) => fmt(v),
  labelWidth = 190,
  onSelect,
  emptyMessage = "No data in the current selection.",
}) {
  const [wrapRef, { width }] = useSize({ width: 760 });
  const [hover, setHover] = useState(null);

  if (!data.length) {
    return <div ref={wrapRef} style={{ padding: 24, color: "#5d89ab", fontSize: 12 }}>{emptyMessage}</div>;
  }

  const w = Math.max(width || 760, 320);
  const labelW = Math.min(labelWidth, Math.max(110, w * 0.34));
  const valueW = 74;
  const trackW = Math.max(w - labelW - valueW - 12, 60);
  const max = Math.max(...data.map((d) => d.value), 1);
  const height = data.length * (BAR + GAP);

  return (
    <div ref={wrapRef}>
      <svg width="100%" viewBox={`0 0 ${w} ${height}`} role="img"
           aria-label={`Ranked comparison of ${data.length} categories`}
           style={{ display: "block" }}>
        {data.map((d, i) => {
          const yTop = i * (BAR + GAP);
          const barW = Math.max((d.value / max) * trackW, 2);
          const active = hover === d.key;
          return (
            <g key={d.key}
               onMouseEnter={() => setHover(d.key)}
               onMouseLeave={() => setHover(null)}
               onClick={() => onSelect?.(d)}
               style={{ cursor: onSelect ? "pointer" : "default" }}>
              {/* Hit target spans the full row, not just the bar */}
              <rect x="0" y={yTop} width={w} height={BAR + GAP} fill="transparent" />
              <text x="0" y={yTop + BAR / 2} dominantBaseline="middle" fontSize="11"
                    fontFamily="inherit" fill={active ? "#e6f2fa" : AXIS_TEXT}>
                {truncate(d.label, Math.floor(labelW / 6.6))}
                <title>{d.label}</title>
              </text>
              <rect x={labelW} y={yTop} width={trackW} height={BAR} rx="2"
                    fill="rgba(100,170,230,0.08)" />
              <path d={roundedEnd(labelW, yTop, barW, BAR, 4)} fill={d.color}
                    opacity={active ? 1 : 0.9} />
              <text x={labelW + barW + 8} y={yTop + BAR / 2} dominantBaseline="middle"
                    fontSize="11" fontFamily="inherit" fill="#e6f2fa"
                    style={{ fontVariantNumeric: "tabular-nums" }}>
                {valueFormat(d.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Bar path: square at the baseline (left), 4px rounded at the data end. */
function roundedEnd(x, y, w, h, r) {
  const rr = Math.min(r, w);
  return `M${x},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} H${x} Z`;
}

const truncate = (s, n) => (s.length > n ? s.slice(0, Math.max(n - 1, 1)) + "…" : s);
