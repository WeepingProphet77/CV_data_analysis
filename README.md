# CV Data Analysis

Browser-based analysis dashboards for data exported from **Concrete Vision**, the
ERP that runs employee time, production and scheduling.

**Live:** https://weepingprophet77.github.io/CV_data_analysis/

Export a report from Concrete Vision, drop the file on the page, and read it.
Parsing happens entirely in your browser — **no file is ever uploaded anywhere**,
and nothing but code lives in this repository. Your last import is cached in the
browser's IndexedDB, so a refresh doesn't mean re-uploading; large exports
(100k+ rows) are fine.

## Modules

| Module | Status | What it does |
| --- | --- | --- |
| **Employee Time** | Built | Timesheet hours by person, project, labor task and date. Sortable tables, drill-down on any person or project, and cumulative-hours plots. |
| **Production** | Built | Scheduled pours by plant — month calendar, charts, bed utilization, jobs and piece detail. |
| **Schedule** | Placeholder | Scheduled versus actual dates, slip, weekly load. |

### Employee Time

- **Overview** — totals, cumulative burn for the whole selection, top projects ranked.
- **People / Projects** — sortable, searchable tables; click any row to drill in.
- **Cumulative** — the plotting view. Narrow to a person and/or a project, then
  split the hours into series by project, person, labor task, location,
  department or GL code. Toggle between cumulative totals and per-day hours.
- **Person / Project detail** — full breakdowns, each with its own cumulative chart.

Filters (date window, location, department) apply across every view.

### Production

Reads the **Scheduled Production Report (Detail)** export. It is forward-looking —
these are pours that are *scheduled*, so the UI never claims anything was produced.

- **Schedule** — the main view. Month calendar for one plant (or all), each day
  shaded by pieces, square feet, cubic yards or linear feet, listing the busiest
  beds. Click a day for the bed-by-bed breakdown: every piece, its job, phase,
  position and pour number, plus bed comments.
- **Charts** — daily scheduled volume, cumulative volume, and rankings by plant,
  job and phase, in whichever measure you pick.
- **Beds** — utilization per bed, including days a bed is tied up casting nothing.
- **Jobs** — per-job rollup with pieces, SF, CY, bed count and date span.
- **Pieces** — the full searchable, sortable detail table.

Rows with no quantity are kept, not dropped: they are bed activity — mold builds
and maintenance — and an occupied bed is real schedule information.

## Accepted files

`.csv`, `.xlsx` and `.xls`. Column headers are matched case- and
punctuation-insensitively against a list of aliases, so minor drift between
export versions still loads — including Concrete Vision's own `Deptment`
misspelling. If a required column is genuinely absent, the importer says which
one and lists the headers it did find.

Employee Time expects: `Effective Date`, `First Name`, `Last Name`, `Job Name`,
`Hours` (required), plus `Location`, `GL Code`, `Labor Task`, `Deptment` (optional).

## Developing

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # data-layer, persistence and render checks
npm run build     # production build into dist/
npm run sample    # regenerate samples/employee-time.sample.csv
npm run deploy    # test, build, publish to the gh-pages branch
```

The files in `samples/` are entirely synthetic — fabricated names, plants and job
numbers — so the dashboard can be demoed and tested without real company data.

Deploys currently go out with `npm run deploy`, which publishes the build to the
`gh-pages` branch. Automatic deployment on push to `main` is ready to switch on —
see the deployment section of [CLAUDE.md](CLAUDE.md).

See [CLAUDE.md](CLAUDE.md) for architecture, conventions and how to add a module.
