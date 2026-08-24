import React, { useMemo } from "react";
import { StatCard, Panel } from "../../../components/ui.jsx";
import LineChart from "../../../components/charts/LineChart.jsx";
import BarChart from "../../../components/charts/BarChart.jsx";
import { fmt, count, compact } from "../../../core/format.js";
import { rollup, distinct, sumBy, cumulativeSeries, topNWithOther } from "../../../core/aggregate.js";
import { seriesColor, OTHER_COLOR } from "../../../core/palette.js";

export default function Overview({ rows, onOpenProject }) {
  const stats = useMemo(() => {
    const total = sumBy(rows, (r) => r.hrs);
    const days = distinct(rows, (r) => r.date);
    return {
      total,
      people: distinct(rows, (r) => r.name).length,
      projects: distinct(rows, (r) => r.job).length,
      days: days.length,
      from: days[0] || "—",
      to: days[days.length - 1] || "—",
    };
  }, [rows]);

  // One cumulative line for the whole selection: how hours accrued over the window.
  const cumulative = useMemo(
    () => [{
      key: "all", label: "All hours", color: seriesColor(0),
      points: cumulativeSeries(rows, (r) => r.date, (r) => r.hrs),
    }],
    [rows]
  );

  const topProjects = useMemo(() => {
    const groups = rollup(rows, (r) => r.job, (r) => r.hrs);
    const { top, other } = topNWithOther(groups, 8);
    return [
      ...top.map((g, i) => ({ key: g.key, label: g.key, value: g.value, color: seriesColor(i) })),
      ...(other ? [{ key: "__other", label: `Other (${other.memberCount} projects)`, value: other.value, color: OTHER_COLOR }] : []),
    ];
  }, [rows]);

  return (
    <div>
      <div className="cards">
        <StatCard label="Total Hours" value={compact(stats.total)} />
        <StatCard label="People" value={count(stats.people)} />
        <StatCard label="Projects" value={count(stats.projects)} />
        <StatCard label="Work Days" value={count(stats.days)} />
        <StatCard label="From" value={stats.from} small />
        <StatCard label="Through" value={stats.to} small />
      </div>

      <Panel title="Cumulative hours across the selection">
        <LineChart series={cumulative} area height={280} yLabel="Cumulative hours" />
      </Panel>

      <Panel title="Where the hours went — top projects">
        <BarChart data={topProjects} valueFormat={(v) => `${fmt(v)} h`}
                  onSelect={(d) => d.key !== "__other" && onOpenProject?.(d.key)} />
      </Panel>
    </div>
  );
}
