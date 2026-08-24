import React, { useMemo } from "react";
import { Badge, MiniBar, BackLink, Panel, StatCard } from "../../../components/ui.jsx";
import LineChart from "../../../components/charts/LineChart.jsx";
import { fmt, pct, compact } from "../../../core/format.js";
import { rollup, sumBy, cumulativeSeries, dateDomain, topNWithOther, distinct } from "../../../core/aggregate.js";
import { seriesColor, OTHER_COLOR, MAX_SERIES } from "../../../core/palette.js";

export default function ProjectDetail({ job, rows, onBack, onOpenPerson }) {
  const mine = useMemo(() => rows.filter((r) => r.job === job), [rows, job]);
  const total = useMemo(() => sumBy(mine, (r) => r.hrs), [mine]);

  const people = useMemo(
    () => rollup(mine, (r) => r.name, (r) => r.hrs, (bucket) => ({
      loc: bucket[0].loc,
      tasks: rollup(bucket, (r) => r.task || "(no task)", (r) => r.hrs),
    })),
    [mine]
  );
  const tasks = useMemo(() => rollup(mine, (r) => r.task || "(no task)", (r) => r.hrs), [mine]);

  // Two readings of the same job: total burn, and who contributed it.
  const burn = useMemo(() => {
    if (!mine.length) return [];
    return [{
      key: "total", label: "Project total", color: seriesColor(0),
      points: cumulativeSeries(mine, (r) => r.date, (r) => r.hrs),
    }];
  }, [mine]);

  const byPerson = useMemo(() => {
    if (!mine.length) return [];
    const domain = dateDomain(mine, (r) => r.date);
    const { top, other } = topNWithOther(people, MAX_SERIES);
    const out = top.map((g, i) => ({
      key: g.key, label: g.key, color: seriesColor(i),
      points: cumulativeSeries(g.rows, (r) => r.date, (r) => r.hrs, domain),
    }));
    if (other) out.push({
      key: "__other", label: `Other (${other.memberCount})`, color: OTHER_COLOR,
      points: cumulativeSeries(other.rows, (r) => r.date, (r) => r.hrs, domain),
    });
    return out;
  }, [mine, people]);

  if (!mine.length) {
    return <div><BackLink onClick={onBack}>Back to Projects</BackLink>
      <p className="muted">No rows for this project in the current filters.</p></div>;
  }

  const dates = distinct(mine, (r) => r.date);
  const maxPerson = Math.max(...people.map((p) => p.value), 1);

  return (
    <div>
      <BackLink onClick={onBack}>Back to Projects</BackLink>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10, textShadow: "0 0 15px rgba(0,240,255,0.45)" }}>{job}</div>

      <div className="cards">
        <StatCard label="Total Hours" value={compact(total)} />
        <StatCard label="People" value={String(people.length)} />
        <StatCard label="Days Charged" value={String(dates.length)} />
        <StatCard label="First Charge" value={dates[0]} small />
        <StatCard label="Last Charge" value={dates[dates.length - 1]} small />
      </div>

      <Panel title="Project burn — cumulative hours">
        <LineChart series={burn} area height={260} yLabel="Cumulative hours" />
      </Panel>

      <Panel title="Cumulative hours by person">
        <LineChart series={byPerson} height={300} yLabel="Cumulative hours" />
      </Panel>

      {tasks.length > 0 && (
        <>
          <div className="section-label">Hours by labor task</div>
          <div style={{ marginBottom: 16 }}>
            {tasks.map((t) => (
              <Badge key={t.key} tone="amber" title={t.key}>
                {t.key.split(" - ").pop()} {fmt(t.value)}h ({pct(t.value, total)})
              </Badge>
            ))}
          </div>
        </>
      )}

      <div className="section-label">Team members ({people.length})</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Person</th><th>Loc</th><th>Hours</th><th>% of project</th><th>Tasks</th></tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.key} className="clickable" onClick={() => onOpenPerson(p.key)}>
                <td className="link">{p.key}</td>
                <td>{p.loc ? <Badge>{p.loc}</Badge> : <span className="muted">—</span>}</td>
                <td className="num nowrap">{fmt(p.value)}<MiniBar value={p.value} max={maxPerson} color="var(--series-3)" /></td>
                <td className="num">{pct(p.value, total)}</td>
                <td>{p.tasks.slice(0, 2).map((t) => (
                  <Badge key={t.key} tone="amber" title={t.key}>{t.key.split(" - ")[0]} {fmt(t.value)}h</Badge>
                ))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
