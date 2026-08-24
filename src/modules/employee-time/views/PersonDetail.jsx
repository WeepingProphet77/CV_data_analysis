import React, { useMemo } from "react";
import { Badge, MiniBar, BackLink, Panel } from "../../../components/ui.jsx";
import LineChart from "../../../components/charts/LineChart.jsx";
import { fmt, pct, compact } from "../../../core/format.js";
import { rollup, sumBy, cumulativeSeries, dateDomain, topNWithOther, distinct } from "../../../core/aggregate.js";
import { seriesColor, OTHER_COLOR, MAX_SERIES } from "../../../core/palette.js";

export default function PersonDetail({ name, rows, onBack, onOpenProject }) {
  const mine = useMemo(() => rows.filter((r) => r.name === name), [rows, name]);
  const total = useMemo(() => sumBy(mine, (r) => r.hrs), [mine]);

  const jobs = useMemo(
    () => rollup(mine, (r) => r.job, (r) => r.hrs, (bucket) => ({
      tasks: rollup(bucket, (r) => r.task || "(no task)", (r) => r.hrs),
      days: new Set(bucket.map((r) => r.date)).size,
    })),
    [mine]
  );

  // Their cumulative burn, one line per project — the "how did this person's
  // time on each job accrue" view.
  const series = useMemo(() => {
    if (!mine.length) return [];
    const domain = dateDomain(mine, (r) => r.date);
    const { top, other } = topNWithOther(jobs, MAX_SERIES);
    const out = top.map((g, i) => ({
      key: g.key, label: g.key, color: seriesColor(i),
      points: cumulativeSeries(g.rows, (r) => r.date, (r) => r.hrs, domain),
    }));
    if (other) out.push({
      key: "__other", label: `Other (${other.memberCount})`, color: OTHER_COLOR,
      points: cumulativeSeries(other.rows, (r) => r.date, (r) => r.hrs, domain),
    });
    return out;
  }, [mine, jobs]);

  if (!mine.length) {
    return <div><BackLink onClick={onBack}>Back to People</BackLink>
      <p className="muted">No rows for {name} in the current filters.</p></div>;
  }

  const maxJob = Math.max(...jobs.map((j) => j.value), 1);
  const first = mine[0];

  return (
    <div>
      <BackLink onClick={onBack}>Back to People</BackLink>

      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 18, fontWeight: 800, textShadow: "0 0 15px rgba(0,240,255,0.45)" }}>{name}</span>
        {first.loc && <Badge tone="blue">{first.loc}</Badge>}
        {first.dept && <Badge tone="green">{first.dept}</Badge>}
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-dim)" }}>{fmt(total)} hrs</span>
        <span className="muted">{jobs.length} projects · {distinct(mine, (r) => r.date).length} days charged</span>
      </div>

      <Panel title="Cumulative hours by project">
        <LineChart series={series} height={300} yLabel="Cumulative hours" />
      </Panel>

      <div className="section-label">Projects charged ({jobs.length})</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Project</th><th>Hours</th><th>% of time</th><th>Days</th><th>Primary tasks</th></tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.key} className="clickable" onClick={() => onOpenProject(j.key)}>
                <td className="link" style={{ maxWidth: 340 }}>{j.key}</td>
                <td className="num nowrap">{fmt(j.value)}<MiniBar value={j.value} max={maxJob} /></td>
                <td className="num">{pct(j.value, total)}</td>
                <td className="num">{j.days}</td>
                <td>{j.tasks.slice(0, 2).map((t) => (
                  <Badge key={t.key} tone="amber" title={t.key}>{shortTask(t.key)} {fmt(t.value)}h</Badge>
                ))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Labor tasks come through as "CATEGORY - Detail"; the head is enough here. */
const shortTask = (t) => t.split(" - ")[0];
