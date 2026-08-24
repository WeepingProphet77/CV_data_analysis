/**
 * Cumulative time plotting.
 *
 * A small pivot: narrow to a person and/or a project, then split the remaining
 * hours into series by any dimension. "One person's cumulative hours on each of
 * their projects" is Person = someone, Split by = Project; "everyone's burn on
 * one job" is Project = that job, Split by = Person.
 */
import React, { useMemo, useState } from "react";
import LineChart from "../../../components/charts/LineChart.jsx";
import { Panel, StatCard } from "../../../components/ui.jsx";
import { fmt, compact, daysBetween } from "../../../core/format.js";
import {
  rollup, distinct, sumBy, cumulativeSeries, dateDomain, topNWithOther,
} from "../../../core/aggregate.js";
import { seriesColor, OTHER_COLOR, MAX_SERIES } from "../../../core/palette.js";

const SPLITS = [
  { id: "job", label: "Project", get: (r) => r.job },
  { id: "name", label: "Person", get: (r) => r.name },
  { id: "task", label: "Labor Task", get: (r) => r.task || "(no task)" },
  { id: "loc", label: "Location", get: (r) => r.loc || "(no location)" },
  { id: "dept", label: "Department", get: (r) => r.dept || "(no department)" },
  { id: "gl", label: "GL Code", get: (r) => r.gl || "(no GL code)" },
  { id: "none", label: "Nothing — one combined line", get: () => "Total" },
];

export default function Cumulative({ rows }) {
  const [person, setPerson] = useState("All");
  const [project, setProject] = useState("All");
  const [splitId, setSplitId] = useState("job");
  const [measure, setMeasure] = useState("cumulative");

  const people = useMemo(() => ["All", ...distinct(rows, (r) => r.name)], [rows]);

  // Project choices follow the selected person, so the list only ever offers
  // jobs that person actually charged to.
  const projects = useMemo(() => {
    const pool = person === "All" ? rows : rows.filter((r) => r.name === person);
    return ["All", ...distinct(pool, (r) => r.job)];
  }, [rows, person]);

  const scoped = useMemo(
    () => rows.filter((r) => (person === "All" || r.name === person) &&
                             (project === "All" || r.job === project)),
    [rows, person, project]
  );

  const split = SPLITS.find((s) => s.id === splitId) ?? SPLITS[0];

  const { series, otherCount } = useMemo(() => {
    if (!scoped.length) return { series: [], otherCount: 0 };

    const domain = dateDomain(scoped, (r) => r.date);
    const groups = rollup(scoped, split.get, (r) => r.hrs);
    const { top, other } = topNWithOther(groups, MAX_SERIES);

    const build = (rowsIn) =>
      measure === "cumulative"
        ? cumulativeSeries(rowsIn, (r) => r.date, (r) => r.hrs, domain)
        : dailyPoints(rowsIn);

    const out = top.map((g, i) => ({
      key: g.key, label: g.key, color: seriesColor(i), points: build(g.rows),
    }));
    if (other) {
      out.push({
        key: "__other", label: `Other (${other.memberCount})`,
        color: OTHER_COLOR, points: build(other.rows),
      });
    }
    return { series: out, otherCount: other?.memberCount ?? 0 };
  }, [scoped, split, measure]);

  const totals = useMemo(() => {
    const total = sumBy(scoped, (r) => r.hrs);
    const dates = distinct(scoped, (r) => r.date);
    const span = dates.length ? daysBetween(dates[0], dates[dates.length - 1]) : 0;
    return {
      total,
      workDays: dates.length,
      span,
      perDay: dates.length ? total / dates.length : 0,
      series: series.length,
    };
  }, [scoped, series]);

  const cumulativeMode = measure === "cumulative";

  return (
    <div>
      <div className="filters">
        <span className="filter-label">Person</span>
        <select className="field" value={person} aria-label="Person"
                onChange={(e) => { setPerson(e.target.value); setProject("All"); }}>
          {people.map((p) => <option key={p} value={p}>{p === "All" ? "All people" : p}</option>)}
        </select>

        <span className="filter-label">Project</span>
        <select className="field" value={project} aria-label="Project"
                onChange={(e) => setProject(e.target.value)}>
          {projects.map((p) => <option key={p} value={p}>{p === "All" ? "All projects" : p}</option>)}
        </select>

        <span className="filter-label">Split by</span>
        <select className="field" value={splitId} aria-label="Split series by"
                onChange={(e) => setSplitId(e.target.value)}>
          {SPLITS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>

        <button className="btn" onClick={() => setMeasure(cumulativeMode ? "daily" : "cumulative")}>
          {cumulativeMode ? "Showing: Cumulative" : "Showing: Per day"}
        </button>

        {(person !== "All" || project !== "All") && (
          <button className="btn danger" onClick={() => { setPerson("All"); setProject("All"); }}>Reset</button>
        )}
      </div>

      <div className="cards">
        <StatCard label="Hours in view" value={compact(totals.total)} />
        <StatCard label="Series plotted" value={String(totals.series)}
                  sub={otherCount ? `+${otherCount} folded into Other` : undefined} />
        <StatCard label="Days charged" value={String(totals.workDays)} />
        <StatCard label="Avg hrs / charged day" value={fmt(totals.perDay)} />
        <StatCard label="Calendar span" value={`${totals.span} d`} small />
      </div>

      <Panel title={describe(person, project, split, cumulativeMode)}>
        <LineChart
          series={series}
          height={380}
          area={cumulativeMode}
          yLabel={cumulativeMode ? "Cumulative hours" : "Hours per day"}
          valueFormat={(v) => fmt(v)}
          emptyMessage="Nothing to plot — widen the filters or pick a different person or project."
        />
        {otherCount > 0 && (
          <p className="hint" style={{ marginTop: 10 }}>
            The palette carries eight distinguishable series. The remaining {otherCount}{" "}
            {split.label.toLowerCase()} value(s) are summed into <strong>Other</strong> rather than
            given colors that would be hard to tell apart.
          </p>
        )}
      </Panel>
    </div>
  );
}

/** Hours charged on each date (no accumulation). */
function dailyPoints(rows) {
  const byDate = new Map();
  for (const r of rows) byDate.set(r.date, (byDate.get(r.date) || 0) + r.hrs);
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, y]) => ({ x, y }));
}

function describe(person, project, split, cumulative) {
  const who = person === "All" ? "All people" : person;
  const what = project === "All" ? "all projects" : project;
  const how = split.id === "none" ? "combined" : `by ${split.label.toLowerCase()}`;
  return `${cumulative ? "Cumulative" : "Daily"} hours — ${who} on ${what}, ${how}`;
}
