/**
 * Production — analysis of Concrete Vision's Scheduled Production Report.
 *
 * The report is forward-looking: these are pours that are *scheduled*. The UI
 * says "scheduled" throughout and never claims anything was produced.
 *
 * The module holds **two** exports from the same database, kept as separate
 * datasets because they are pulled separately and over separate date ranges:
 *
 *   production           the schedule — every scheduled piece, bed and day
 *   production-tickets   the Missing Piece Mark Ticket report (ticketParse.js)
 *
 * They are joined on job number + piece mark, never on bed date — see
 * tickets.js for why. Whether they actually overlap is computed rather than
 * assumed, and said out loud: an unflagged board means "every piece is drawn"
 * only when the ticket report covers the same dates.
 */
import React, { useMemo, useState } from "react";
import { useDataset } from "../../core/store.js";
import { useMyProjects, SCOPE_ALL } from "../../core/myProjects.js";
import { sumBy } from "../../core/aggregate.js";
import { Tabs } from "../../components/ui.jsx";
import { ImportPrompt } from "../../components/FileImport.jsx";
import { DataBar } from "../../components/DataBar.jsx";
import { FilterBar } from "../../components/Filters.jsx";
import { ScopeToggle, NoProjectsYet } from "../../components/MyProjects.jsx";
import schema from "./schema.js";
import { useProductionFilters } from "./useProductionFilters.js";
import { ticketIndex, ticketCoverage } from "./tickets.js";
import PlanningBoard from "./views/PlanningBoard.jsx";
import Schedule from "./views/Schedule.jsx";
import Overview from "./views/Overview.jsx";
import Beds from "./views/Beds.jsx";
import Jobs from "./views/Jobs.jsx";
import Pieces from "./views/Pieces.jsx";
import Tickets from "./views/Tickets.jsx";
import TicketBar, { TicketDrop } from "./views/TicketBar.jsx";

/** The saved ticket report is one record: the source object the walker returns. */
const EMPTY_TICKETS = { fileName: "", rows: [], jobs: [], plants: [], range: { min: "", max: "" }, warnings: [] };

export default function ProductionModule() {
  const data = useDataset("production");
  const ticketData = useDataset("production-tickets");
  const mine = useMyProjects();
  const f = useProductionFilters(data.rows, mine);
  const [tab, setTab] = useState("board");
  const [search, setSearch] = useState("");

  // useDataset persists { rows, meta }; the walker's per-file figures (ranges,
  // banner counts, import notes) ride along in meta so the strip can show them
  // without re-reading the workbook.
  const ticketSource = useMemo(
    () => (ticketData.rows.length ? { ...EMPTY_TICKETS, ...(ticketData.meta ?? {}), rows: ticketData.rows } : EMPTY_TICKETS),
    [ticketData.rows, ticketData.meta]
  );

  /**
   * The ticket lookup is built over the *whole* report, not the filtered slice:
   * a piece is missing its drawing regardless of which plant or date window is
   * on screen, and rebuilding it per filter change would be wasted work.
   */
  const tickets = useMemo(() => ticketIndex(ticketSource.rows), [ticketSource.rows]);

  // Coverage is measured against the My Projects pool rather than the date
  // filter, so narrowing to a week doesn't read as the report having shrunk.
  const coverage = useMemo(
    () => ticketCoverage(f.pool, ticketSource.rows),
    [f.pool, ticketSource.rows]
  );

  const scheduledJobNos = useMemo(
    () => new Set(data.rows.map((r) => r.jobNo).filter(Boolean)),
    [data.rows]
  );

  const counts = useMemo(() => ({
    beds: new Set(f.filtered.map((r) => r.bedKey)).size,
    jobs: new Set(f.filtered.map((r) => r.job)).size,
    pieces: sumBy(f.filtered, (r) => r.qty),
  }), [f.filtered]);

  // Both must resolve, or a saved My Projects choice flashes as "All".
  if (!data.ready || !mine.ready || !ticketData.ready) return null;

  if (!data.rows.length) {
    return (
      <ImportPrompt
        schema={schema}
        title="Production"
        blurb="Upload a Concrete Vision Scheduled Production Report to get started."
        onLoaded={data.load}
      />
    );
  }

  const loadTickets = (src) => {
    const { rows, ...meta } = src;
    ticketData.load(rows, meta);
  };

  // Board and Calendar own the plant picker (it drives what they render), so
  // the shared filter row leaves plant out there to avoid two controls for one
  // thing. Tickets is scoped by job, not by bed, so it omits both.
  const ownsPlant = tab === "schedule" || tab === "board";
  const searchable = tab === "beds" || tab === "jobs" || tab === "pieces";

  // My Projects narrows the schedule, so it must narrow the ticket list on the
  // same terms — otherwise the Tickets tab would report jobs the rest of the
  // module has hidden.
  const scopedTickets = mine.active
    ? ticketSource.rows.filter((t) => mine.members.has(t.jobNo))
    : ticketSource.rows;

  const stranded = mine.active
    ? mine.memberList.filter((n) => !scheduledJobNos.has(n))
    : [];

  return (
    <div>
      <DataBar
        title="Production"
        meta={data.meta}
        rowCount={data.rows.length}
        schema={schema}
        persistWarning={data.persistWarning}
        onLoaded={(rows, meta) => {
          data.load(rows, meta);
          setTab("board"); setSearch(""); f.clear();
        }}
        onClear={data.clear}
      />

      {ticketSource.rows.length > 0 && (
        <TicketBar
          source={ticketSource}
          coverage={tab === "tickets" ? null : coverage}
          onSource={loadTickets}
          onClear={ticketData.clear}
          persistWarning={ticketData.persistWarning}
        />
      )}

      <Tabs
        active={tab}
        onChange={(t) => { setTab(t); setSearch(""); }}
        tabs={[
          { id: "board", label: "Board" },
          { id: "schedule", label: "Calendar" },
          { id: "overview", label: "Charts" },
          { id: "beds", label: `Beds (${counts.beds})` },
          { id: "jobs", label: `Jobs (${counts.jobs})` },
          { id: "pieces", label: "Pieces" },
          { id: "tickets", label: scopedTickets.length ? `Tickets (${scopedTickets.length})` : "Tickets" },
        ]}
      />

      <FilterBar
        leading={<ScopeToggle mine={mine} />}
        range={tab === "tickets" ? undefined : f.range}
        dateFrom={f.dateFrom} dateTo={f.dateTo}
        onFrom={f.setDateFrom} onTo={f.setDateTo}
        dimensions={
          tab === "tickets"
            ? []
            : [
                ...(ownsPlant ? [] : [{ id: "plant", label: "Plants", value: f.plant, options: f.plants, onChange: f.setPlant }]),
                { id: "job", label: "Jobs", value: f.job, options: f.jobs, onChange: f.setJob },
              ]
        }
        dirty={f.dirty}
        onClear={f.clear}
        search={searchable ? search : undefined}
        onSearch={searchable ? setSearch : undefined}
        searchPlaceholder={
          tab === "beds" ? "Search beds…" : tab === "jobs" ? "Search jobs…" : "Search marks, jobs, beds…"
        }
      />

      {mine.scope !== SCOPE_ALL && !mine.count ? (
        <NoProjectsYet onShowAll={() => mine.setScope(SCOPE_ALL)} />
      ) : (
        <>
          {stranded.length > 0 && (
            <div className="notice amber">
              {stranded.length} of your {mine.count} projects{" "}
              {stranded.length === 1 ? "is" : "are"} not in the loaded schedule
              ({stranded.slice(0, 8).join(", ")}{stranded.length > 8 ? "…" : ""}) — nothing
              is scheduled for them in this export. They stay in your list.
            </div>
          )}

          {tab === "board" && (
            <PlanningBoard rows={f.filtered} plant={f.plant} plants={f.plants} onPlant={f.setPlant}
                           tickets={tickets} />
          )}
          {tab === "schedule" && (
            <Schedule rows={f.filtered} plant={f.plant} plants={f.plants} onPlant={f.setPlant} />
          )}
          {tab === "overview" && <Overview rows={f.filtered} onOpenJob={(job) => { f.setJob(job); setTab("jobs"); }} />}
          {tab === "beds" && <Beds rows={f.filtered} search={search} />}
          {tab === "jobs" && <Jobs rows={f.filtered} search={search} mine={mine} onOpenJob={(job) => { f.setJob(job); setTab("board"); }} />}
          {tab === "pieces" && <Pieces rows={f.filtered} search={search} />}
          {tab === "tickets" && (
            ticketSource.rows.length ? (
              <Tickets
                ticketRows={scopedTickets}
                coverage={coverage}
                scheduledJobNos={scheduledJobNos}
                mine={mine}
                onOpenJob={(jobNo) => {
                  // Deep-link into the board on the job's full name, which is
                  // what the job filter is keyed on.
                  const hit = data.rows.find((r) => r.jobNo === jobNo);
                  if (hit) { f.setJob(hit.job); setTab("board"); }
                }}
              />
            ) : (
              <TicketDrop onSource={loadTickets} />
            )
          )}
        </>
      )}
    </div>
  );
}
