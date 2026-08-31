/**
 * What the sections are — the single place a section is declared.
 *
 * The nav, the router, Home and the empty states all read from this, so adding
 * a section means adding one entry here plus its folder under src/modules/.
 *
 * Sections are named after the **question** they answer, not after the export
 * that feeds them. "Job Cost" and "Employee Time" were file names, which meant
 * the navigation only made sense to whoever pulls the reports. `needs` records
 * which sources a section is useless without, so a section can say what is
 * missing instead of showing an empty dashboard.
 *
 * **No JSX here.** The components are attached in registry.js; this file stays
 * plain ESM so the test scripts can import the routing rules in node, which
 * cannot load .jsx (CLAUDE.md §2).
 */

export const SECTIONS = [
  {
    id: "home",
    label: "Home",
    blurb: "What this is, what is loaded, and where to start.",
    needs: [],
    tabs: [],
  },
  {
    id: "projects",
    label: "Projects",
    blurb: "Every job across cost, schedule and drawings — and the starred list that scopes the app.",
    needs: ["cost", "schedule"],
    tabs: [
      { id: "jobs", label: "All Jobs" },
      { id: "vs-schedule", label: "Cost vs Schedule" },
    ],
  },
  {
    id: "production",
    label: "Production",
    blurb: "Scheduled pours by plant — the planning board, the calendar, beds and pieces.",
    needs: ["schedule"],
    tabs: [
      { id: "board", label: "Board" },
      { id: "calendar", label: "Calendar" },
      { id: "overview", label: "Overview" },
      { id: "beds", label: "Beds" },
      { id: "pieces", label: "Pieces" },
      { id: "changes", label: "Schedule Changes" },
    ],
  },
  {
    id: "drawings",
    label: "Drawings",
    blurb: "Pieces with no ticket drawing, ordered by how soon they are cast.",
    needs: ["tickets"],
    tabs: [
      { id: "queue", label: "Queue" },
      { id: "jobs", label: "By Job" },
      { id: "drafters", label: "By Drafter" },
    ],
  },
  {
    id: "cost",
    label: "Cost",
    blurb: "Weekly job cost by plant — margin, cost codes and the drafting & engineering roll-up.",
    needs: ["cost"],
    tabs: [
      { id: "portfolio", label: "Portfolio" },
      { id: "codes", label: "Cost Codes" },
      { id: "engineering", label: "Drafting & Engineering" },
    ],
  },
  {
    id: "time",
    label: "Time",
    blurb: "Timesheet hours by person, job, task and date.",
    needs: ["time"],
    tabs: [
      { id: "overview", label: "Overview" },
      { id: "people", label: "People" },
      { id: "jobs", label: "Jobs" },
      { id: "cumulative", label: "Cumulative" },
    ],
  },
];

/**
 * Reachable, but not in the nav.
 *
 * Sources is opened from the header chip and from Home — it is a utility, not a
 * question. The job page is addressed by the job it is about (`#/job/43134`),
 * so it takes one leading route parameter before its tab.
 */
export const UTILITY = [
  {
    id: "sources",
    label: "Sources",
    blurb: "Every file the app holds — add, replace or remove any of them.",
    needs: [],
    tabs: [],
  },
  {
    id: "job",
    label: "Job",
    blurb: "One project across every loaded source.",
    needs: [],
    params: 1,
    tabs: [
      { id: "summary", label: "Summary" },
      { id: "cost", label: "Full Cost Report" },
    ],
  },
];

const ALL = [...SECTIONS, ...UTILITY];

export const DEFAULT_SECTION = "home";

/**
 * Where a route from before the 2026-08-31 rework goes.
 *
 * The sections were renamed for what they answer rather than for the file that
 * feeds them (§15), which would silently strand anyone's bookmark on Home. A
 * redirect costs three lines and says where the thing went.
 */
export const ALIASES = {
  "employee-time": "time",
  "job-cost": "cost",
  // Plan vs actual was never built; its scope is on Home now.
  schedule: "home",
};

export const findSection = (id) => ALL.find((s) => s.id === id);

export const tabsFor = (id) => findSection(id)?.tabs || [];

export const paramsFor = (id) => findSection(id)?.params || 0;

export const isSection = (id) => Boolean(findSection(id));
