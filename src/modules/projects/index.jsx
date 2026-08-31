/**
 * Projects — every job, across every source, and the starred list that scopes
 * the app.
 *
 * This section exists because the job is the spine of the application and used
 * to have no home: the same project was listed by the cost module and by the
 * production module in two tables that shared no columns and no link. Here it
 * is one row, and clicking it opens the job page.
 */
import React, { useMemo, useState } from "react";
import { useAppData } from "../../core/appData.js";
import { projectRows, PRESENCE, applyPresence } from "./rows.js";
import { PageHeader, RouteTabs, NeedsSource } from "../../components/Page.jsx";
import { FilterBar } from "../../components/Filters.jsx";
import { SortableTh, useSort, compareBy, Badge, MiniBar } from "../../components/ui.jsx";
import { StarButton, NoProjectsYet } from "../../components/MyProjects.jsx";
import { SCOPE_ALL } from "../../core/myProjects.js";
import { hrefFor, go } from "../../core/routing.js";
import { money, ratio, count, perSf, fmt } from "../../core/format.js";
import { tabsFor } from "../sections.js";
import ProductionLink from "../job-cost/views/ProductionLink.jsx";

export default function ProjectsModule({ tab }) {
  const app = useAppData();
  const mine = app.mine;
  const [sort, onSort] = useSort("jobNo", 1);
  const [plant, setPlant] = useState("All");
  const [presence, setPresence] = useState("all");
  const [search, setSearch] = useState("");

  const all = useMemo(
    () => projectRows({
      costJobs: app.cost.data.jobs,
      scheduleRows: app.schedule.rows,
      ticketRows: app.tickets.rows,
      timeRows: app.time.rows,
    }),
    [app.cost.data.jobs, app.schedule.rows, app.tickets.rows, app.time.rows]
  );

  // My Projects narrows the pool itself, before any other filter, so no view
  // below can forget to apply it (CLAUDE.md §14).
  const scoped = useMemo(
    () => (mine.active ? all.filter((r) => mine.members.has(r.jobNo)) : all),
    [all, mine.active, mine.members]
  );

  const plants = useMemo(
    () => ["All", ...[...new Set(scoped.flatMap((r) => r.plants))].sort()],
    [scoped]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applyPresence(scoped, presence)
      .filter((r) => plant === "All" || r.plants.includes(plant))
      .filter((r) => !q || r.jobNo.toLowerCase().includes(q) || r.title.toLowerCase().includes(q))
      .sort(compareBy(sort.col, sort.dir));
  }, [scoped, presence, plant, search, sort]);

  const nothingLoaded = !app.costLib.sources.length && !app.schedule.rows.length && !app.time.rows.length;

  if (nothingLoaded) {
    return (
      <NeedsSource
        title="Projects"
        file="the weekly Job Cost Reports, the Scheduled Production Report, or the employee time export"
        blurb="Every job across cost, schedule, drawings and booked hours, in one list. Load any of those and the jobs it knows about appear here; load more and they line up on the job number."
      >
        <a className="btn" href={hrefFor("sources")}>Add a file</a>
      </NeedsSource>
    );
  }

  const missing = mine.active
    ? mine.memberList.filter((n) => !all.some((r) => r.jobNo === n))
    : [];

  return (
    <div className="jc">
      <PageHeader
        title="Projects"
        subtitle={
          `${count(all.length)} jobs known to the loaded files · ` +
          `${count(all.filter((r) => r.costed && r.scheduled).length)} in both cost and schedule` +
          (app.time.rows.length ? ` · ${count(all.filter((r) => r.timed).length)} with booked hours` : "")
        }
      />

      <RouteTabs
        section="projects"
        tabs={tabsFor("projects")}
        active={tab}
        counts={{ jobs: rows.length }}
      />

      {mine.scope !== SCOPE_ALL && !mine.count ? (
        <NoProjectsYet onShowAll={() => mine.setScope(SCOPE_ALL)} />
      ) : (
        <>
          {missing.length > 0 && (
            <div className="notice amber">
              {missing.length} of your {mine.count} starred projects{" "}
              {missing.length === 1 ? "is" : "are"} not in any loaded file
              ({missing.slice(0, 8).join(", ")}{missing.length > 8 ? "…" : ""}) — that plant's
              report may not be imported, or nothing is scheduled for them. They stay in your list.
            </div>
          )}

          {tab === "vs-schedule" ? (
            <ProductionLink
              jobs={app.cost.data.jobs}
              qtyByJob={app.cost.data.qtyByJob}
              production={app.schedule.rows}
              onOpenJob={(key) => go("job", String(key).split("|")[1] || key)}
            />
          ) : (
            <>
              <FilterBar
                dimensions={[
                  { id: "plant", label: "Plants", value: plant, options: plants, onChange: setPlant },
                  {
                    id: "presence", label: "Sources", value: presence,
                    options: PRESENCE.map((p) => p.id),
                    labels: Object.fromEntries(PRESENCE.map((p) => [p.id, p.label])),
                    onChange: setPresence,
                  },
                ]}
                dirty={plant !== "All" || presence !== "all" || Boolean(search)}
                onClear={() => { setPlant("All"); setPresence("all"); setSearch(""); }}
                search={search}
                onSearch={setSearch}
                searchPlaceholder="Search job number or name…"
              />
              <JobTable rows={rows} sort={sort} onSort={onSort} mine={mine} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The one job table.
 *
 * Cost columns and schedule columns share it, and a job present in only one
 * source leaves the other side blank. That is the honest rendering: a dash says
 * "this source doesn't mention it", a zero would say "it has none".
 */
function JobTable({ rows, sort, onSort, mine }) {
  const maxPieces = Math.max(...rows.map((r) => r.pieces), 1);

  if (!rows.length) {
    return (
      <div className="table-wrap">
        <div className="muted" style={{ padding: 18 }}>No projects match the current filters.</div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: 34 }} title="Add to My Projects">★</th>
            <SortableTh column="jobNo" label="Job No" sort={sort} onSort={onSort} />
            <SortableTh column="title" label="Job" sort={sort} onSort={onSort} />
            <th>Plants</th>
            <SortableTh column="sources" label="In" sort={sort} onSort={onSort} />
            <SortableTh column="netContract" label="Net Contract" sort={sort} onSort={onSort} align="right" />
            <SortableTh column="pctBilled" label="% Billed" sort={sort} onSort={onSort} align="right" />
            <SortableTh column="actCost" label="Actual Cost" sort={sort} onSort={onSort} align="right" />
            <SortableTh column="marginPct" label="Margin" sort={sort} onSort={onSort} align="right" />
            <SortableTh column="actualPerSf" label="Actual / SF" sort={sort} onSort={onSort} align="right" />
            <SortableTh column="pieces" label="Pieces Scheduled" sort={sort} onSort={onSort} align="right" />
            <SortableTh column="days" label="Pour Days" sort={sort} onSort={onSort} align="right" />
            <SortableTh column="missingTickets" label="No Ticket" sort={sort} onSort={onSort} align="right" />
            <SortableTh column="hours" label="Hours Booked" sort={sort} onSort={onSort} align="right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.jobNo} className="clickable" onClick={() => go("job", r.jobNo)}>
              <td className="starcol">
                <StarButton jobNo={r.jobNo} on={mine.isMember(r.jobNo)} onToggle={mine.toggle} />
              </td>
              <td className="muted nowrap">{r.jobNo}</td>
              <td className="link" style={{ maxWidth: 260 }} title={r.title}>{r.title || "—"}</td>
              <td className="nowrap">
                {r.plants.slice(0, 2).map((p) => <Badge key={p}>{p}</Badge>)}
                {r.plants.length > 2 && <Badge tone="amber">+{r.plants.length - 2}</Badge>}
              </td>
              <td className="nowrap">
                {r.costed && <Badge tone="blue" title="Has a cost report">cost</Badge>}
                {r.scheduled && <Badge tone="green" title="Scheduled in the loaded export">sched</Badge>}
                {r.timed && <Badge tone="amber" title="Timesheet hours booked to this job">time</Badge>}
              </td>
              <Cell on={r.costed}>{money(r.netContract)}</Cell>
              <Cell on={r.costed}>{r.pctBilled == null ? "—" : ratio(r.pctBilled)}</Cell>
              <Cell on={r.costed}>{money(r.actCost)}</Cell>
              <Cell on={r.costed}>
                {r.marginPct == null ? "—" : (
                  <Badge tone={r.marginPct < 0 ? "red" : r.marginPct < 0.1 ? "amber" : "green"}>
                    {ratio(r.marginPct)}
                  </Badge>
                )}
              </Cell>
              <Cell on={r.costed}>{perSf(r.actualPerSf)}</Cell>
              <Cell on={r.scheduled}>
                {count(r.pieces)}
                <MiniBar value={r.pieces} max={maxPieces} color="var(--series-3)" />
              </Cell>
              <Cell on={r.scheduled}>{r.days}</Cell>
              <td className="num">
                {r.missingTickets
                  ? <Badge tone="red" title={`${r.unassigned} with no drafter assigned`}>{r.missingTickets}</Badge>
                  : <span className="muted">—</span>}
              </td>
              <Cell on={r.timed}>
                <span title={`${r.people} ${r.people === 1 ? "person" : "people"}`}>{fmt(r.hours)}</span>
              </Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A figure, or a dash meaning "that source says nothing about this job". */
const Cell = ({ on, children }) => (
  <td className="num nowrap">{on ? children : <span className="muted" title="Not in this source">—</span>}</td>
);
