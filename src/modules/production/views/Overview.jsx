/** Charts: how much is scheduled, when, and for whom. */
import React, { useMemo, useState } from "react";
import { StatCard, Panel } from "../../../components/ui.jsx";
import ColumnChart from "../../../components/charts/ColumnChart.jsx";
import BarChart from "../../../components/charts/BarChart.jsx";
import LineChart from "../../../components/charts/LineChart.jsx";
import { fmt, count, compact } from "../../../core/format.js";
import { rollup, sumBy, distinct, cumulativeSeries, topNWithOther } from "../../../core/aggregate.js";
import { seriesColor, OTHER_COLOR } from "../../../core/palette.js";
import { METRICS, findMetric, metricShort } from "../metrics.js";

export default function Overview({ rows, onOpenJob }) {
  const [metricId, setMetricId] = useState("pieces");
  const metric = findMetric(metricId);
  const fmtV = (v) => metricShort(metric, v);

  const stats = useMemo(() => {
    const pourDays = new Set(rows.filter((r) => r.isPour).map((r) => r.date));
    const pieces = sumBy(rows, (r) => r.qty);
    return {
      pieces,
      sf: sumBy(rows, (r) => r.sf),
      cy: sumBy(rows, (r) => r.cy),
      days: pourDays.size,
      jobs: distinct(rows, (r) => r.job).length,
      plants: distinct(rows, (r) => r.plant).length,
      perDay: pourDays.size ? pieces / pourDays.size : 0,
    };
  }, [rows]);

  const daily = useMemo(
    () => rollup(rows, (r) => r.date, metric.get)
      .map((g) => ({ x: g.key, y: g.value }))
      .sort((a, b) => a.x.localeCompare(b.x)),
    [rows, metric]
  );

  const cumulative = useMemo(
    () => [{
      key: "all", label: `Cumulative ${metric.label.toLowerCase()}`, color: seriesColor(0),
      points: cumulativeSeries(rows, (r) => r.date, metric.get),
    }],
    [rows, metric]
  );

  const byPlant = useMemo(
    () => rollup(rows, (r) => r.plant, metric.get)
      .map((g, i) => ({ key: g.key, label: g.key, value: g.value, color: seriesColor(i) })),
    [rows, metric]
  );

  const byJob = useMemo(() => {
    const groups = rollup(rows, (r) => r.job, metric.get);
    const { top, other } = topNWithOther(groups, 8);
    return [
      ...top.map((g, i) => ({
        key: g.key,
        label: g.rows[0]?.jobTitle || g.key,
        value: g.value,
        color: seriesColor(i),
      })),
      ...(other ? [{ key: "__other", label: `Other (${other.memberCount} jobs)`, value: other.value, color: OTHER_COLOR }] : []),
    ];
  }, [rows, metric]);

  const byPhase = useMemo(
    () => rollup(rows.filter((r) => r.phaseName), (r) => r.phaseName, metric.get)
      .slice(0, 8)
      .map((g, i) => ({ key: g.key, label: g.key, value: g.value, color: seriesColor(i) })),
    [rows, metric]
  );

  return (
    <div>
      <div className="filters">
        <span className="filter-label">Measure</span>
        <select className="field" value={metricId} aria-label="Metric"
                onChange={(e) => setMetricId(e.target.value)}>
          {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>

      <div className="cards">
        <StatCard label="Pieces Scheduled" value={count(stats.pieces)} />
        <StatCard label="Square Feet" value={compact(stats.sf)} />
        <StatCard label="Cubic Yards" value={compact(stats.cy)} />
        <StatCard label="Pour Days" value={String(stats.days)} />
        <StatCard label="Avg Pieces / Day" value={fmt(stats.perDay)} />
        <StatCard label="Jobs" value={String(stats.jobs)} sub={`${stats.plants} plants`} />
      </div>

      <Panel title={`${metric.label} scheduled per day`}>
        <ColumnChart data={daily} yLabel={metric.unit} valueFormat={fmtV} height={250} />
      </Panel>

      <Panel title={`Cumulative ${metric.label.toLowerCase()} across the window`}>
        <LineChart series={cumulative} area height={240}
                   yLabel={`Cumulative ${metric.unit}`} valueFormat={fmtV} />
      </Panel>

      <Panel title={`${metric.label} by plant`}>
        <BarChart data={byPlant} valueFormat={fmtV} labelWidth={170} />
      </Panel>

      <Panel title={`${metric.label} by job`}>
        <BarChart data={byJob} valueFormat={fmtV} labelWidth={230}
                  onSelect={(d) => d.key !== "__other" && onOpenJob?.(d.key)} />
      </Panel>

      {byPhase.length > 0 && (
        <Panel title={`${metric.label} by phase`}>
          <BarChart data={byPhase} valueFormat={fmtV} labelWidth={170} />
        </Panel>
      )}
    </div>
  );
}
