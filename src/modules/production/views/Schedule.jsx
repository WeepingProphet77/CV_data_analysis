/**
 * The calendar view — what is pouring, where, and when.
 *
 * A plant runs its own beds, so the calendar reads one plant at a time; "All
 * plants" is available but aggregates across them. Each cell carries the
 * selected metric plus the busiest beds that day. Clicking a day opens the
 * bed-by-bed detail below.
 */
import React, { useMemo, useState } from "react";
import MonthCalendar from "../../../components/MonthCalendar.jsx";
import { monthsIn, monthLabel } from "../../../core/calendar.js";
import { Panel, StatCard } from "../../../components/ui.jsx";
import { groupBy, sumBy } from "../../../core/aggregate.js";
import { fmt, count } from "../../../core/format.js";
import { METRICS, findMetric, metricShort } from "../metrics.js";
import DayDetail from "./DayDetail.jsx";

export default function Schedule({ rows, plant, plants, onPlant }) {
  const [metricId, setMetricId] = useState("pieces");
  const [monthPref, setMonth] = useState(null);
  const [dayPref, setDay] = useState(null);

  const metric = findMetric(metricId);
  const months = useMemo(() => monthsIn(rows.map((r) => r.date)), [rows]);

  // Month and day are DERIVED, not synced by an effect: an effect leaves the
  // first render with month === null, which the calendar cannot draw. Deriving
  // also keeps the view valid for free when a filter change drops the month or
  // day out of the data.
  const month = monthPref && months.includes(monthPref) ? monthPref : (months[0] ?? null);
  const day = dayPref && dayPref.startsWith(month ?? "\u0000") ? dayPref : null;

  const cells = useMemo(() => {
    const map = new Map();
    for (const [date, bucket] of groupBy(rows, (r) => r.date)) {
      const value = sumBy(bucket, metric.get);
      const beds = [...groupBy(bucket, (r) => r.bed)]
        .map(([bed, br]) => ({ bed, v: sumBy(br, metric.get) }))
        .sort((a, b) => b.v - a.v);
      const shown = beds.slice(0, 3).map((b) => `${b.bed} · ${metricShort(metric, b.v)}`);
      if (beds.length > 3) shown.push(`+${beds.length - 3} more beds`);
      map.set(date, { value, label: metricShort(metric, value), lines: shown });
    }
    return map;
  }, [rows, metric]);

  const monthRows = useMemo(
    () => (month ? rows.filter((r) => r.date.startsWith(month)) : []),
    [rows, month]
  );

  const totals = useMemo(() => {
    const pourDays = new Set(monthRows.filter((r) => r.isPour).map((r) => r.date));
    return {
      pieces: sumBy(monthRows, (r) => r.qty),
      sf: sumBy(monthRows, (r) => r.sf),
      cy: sumBy(monthRows, (r) => r.cy),
      days: pourDays.size,
      beds: new Set(monthRows.map((r) => r.bedKey)).size,
      bedDays: new Set(monthRows.map((r) => `${r.bedKey}|${r.date}`)).size,
    };
  }, [monthRows]);

  if (!month) {
    return <p className="muted" style={{ padding: 20 }}>Nothing scheduled in the current filters.</p>;
  }

  const idx = months.indexOf(month);

  return (
    <div>
      <div className="filters">
        <span className="filter-label">Plant</span>
        <select className="field" value={plant} aria-label="Plant" onChange={(e) => onPlant(e.target.value)}>
          {plants.map((p) => <option key={p} value={p}>{p === "All" ? "All plants" : p}</option>)}
        </select>

        <span className="filter-label">Show</span>
        <select className="field" value={metricId} aria-label="Metric"
                onChange={(e) => setMetricId(e.target.value)}>
          {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>

        <span style={{ flex: 1 }} />

        <button className="btn ghost" disabled={idx <= 0} onClick={() => setMonth(months[idx - 1])}>‹ Prev</button>
        <span style={{ fontWeight: 700, color: "var(--accent)", letterSpacing: 1, minWidth: 130, textAlign: "center" }}>
          {month && monthLabel(month)}
        </span>
        <button className="btn ghost" disabled={idx >= months.length - 1} onClick={() => setMonth(months[idx + 1])}>Next ›</button>
      </div>

      <div className="cards">
        <StatCard label="Pieces Scheduled" value={count(totals.pieces)} />
        <StatCard label="Square Feet" value={count(Math.round(totals.sf))} />
        <StatCard label="Cubic Yards" value={fmt(totals.cy)} />
        <StatCard label="Pour Days" value={String(totals.days)} />
        <StatCard label="Beds Used" value={String(totals.beds)} />
        <StatCard label="Bed-Days" value={String(totals.bedDays)} />
      </div>

      <Panel title={`${plant === "All" ? "All plants" : plant} — ${metric.label.toLowerCase()} by day`}>
        <MonthCalendar month={month} cells={cells} selected={day}
                       onSelect={(d) => setDay(d === day ? null : d)} />
        <p className="hint" style={{ marginTop: 10 }}>
          Cell shading is relative to the busiest day in view. Click a day for the bed-by-bed schedule.
        </p>
      </Panel>

      {day && <DayDetail date={day} rows={rows.filter((r) => r.date === day)} onClose={() => setDay(null)} />}
    </div>
  );
}
