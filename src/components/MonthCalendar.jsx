/**
 * Month grid calendar.
 *
 * Generic on purpose — it takes cells keyed by ISO date and knows nothing about
 * pours. The Schedule module will want the same grid.
 *
 * cells: Map<'YYYY-MM-DD', { value, label, lines?: string[], muted?: boolean }>
 *
 * Magnitude is carried by a sequential wash (one hue, low near the surface,
 * high bright) — not the categorical palette, which encodes identity.
 */
import React from "react";
import { dateToIso } from "../core/format.js";
import { DOW, weeksOf } from "../core/calendar.js";

export default function MonthCalendar({
  month,                    // 'YYYY-MM'
  cells,                    // Map<iso, {value,label,lines,muted}>
  max,                      // scale ceiling; defaults to the largest cell value
  onSelect,
  selected,
  emptyLabel = "—",
}) {
  // A caller with no data yet renders nothing rather than throwing.
  if (!month) return null;

  const weeks = weeksOf(month);
  const ceiling = max ?? Math.max(...[...cells.values()].map((c) => c.value || 0), 1);
  const monthIdx = Number(month.split("-")[1]) - 1;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {DOW.map((d) => (
          <div key={d} className="filter-label" style={{ textAlign: "center", padding: "2px 0" }}>{d}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {weeks.flat().map((day) => {
          const iso = dateToIso(day);
          const inMonth = day.getMonth() === monthIdx;
          const cell = cells.get(iso);
          const v = cell?.value || 0;
          // Square-root keeps mid-range days visible; a linear wash lets one
          // outlier flatten every other day to nearly the surface color.
          const t = ceiling > 0 ? Math.sqrt(Math.min(v / ceiling, 1)) : 0;
          const isSel = selected === iso;
          const clickable = Boolean(cell && onSelect);

          return (
            <div
              key={iso}
              onClick={() => clickable && onSelect(iso)}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={(e) => {
                if (clickable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(iso); }
              }}
              title={cell ? `${iso} — ${cell.label}` : iso}
              style={{
                minHeight: 92,
                padding: "6px 7px",
                borderRadius: 4,
                cursor: clickable ? "pointer" : "default",
                opacity: inMonth ? 1 : 0.32,
                background: v > 0
                  ? `color-mix(in srgb, var(--series-1) ${Math.round(t * 62)}%, var(--surface-3))`
                  : "var(--surface-3)",
                border: isSel
                  ? "1px solid var(--accent)"
                  : "1px solid " + (v > 0 ? "rgba(0,220,255,0.20)" : "rgba(40,80,120,0.45)"),
                boxShadow: isSel ? "0 0 12px rgba(0,240,255,0.35)" : "none",
                overflow: "hidden",
                transition: "border-color .15s, box-shadow .15s",
              }}
            >
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4,
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: inMonth ? "var(--text-primary)" : "var(--text-muted)",
                }}>
                  {day.getDate()}
                </span>
                <span style={{
                  fontSize: 12, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                  color: v > 0 ? "var(--text-primary)" : "var(--text-muted)",
                }}>
                  {cell ? cell.label : emptyLabel}
                </span>
              </div>

              {cell?.lines?.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 9.5, lineHeight: 1.5, color: "var(--text-secondary)" }}>
                  {cell.lines.map((l, i) => (
                    <div key={i} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
