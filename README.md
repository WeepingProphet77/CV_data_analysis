# CV Data Analysis

Browser-based analysis dashboards for data exported from **Concrete Vision**, the
ERP that runs employee time, production and scheduling — plus the weekly job cost
reports that come from the company's separate cost system.

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
| **Job Cost** | Built | Weekly job cost by plant — contract, billing, projected margin, cost-code overruns, and a cost-versus-schedule comparison. |
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

- **Board** — the main view. A bed × day planning grid: beds down the side, every
  day across the top, cells holding `<job no> <piece mark>` cards colored by job,
  phase or product code. Per-day totals (pours, pieces, CY, SF) run across the top
  and per-week totals sit between the weeks. Click any piece for a panel listing
  every field the export carries — including ones that are blank, the raw source
  text behind any cleaned-up value, other pieces sharing that bed-day, and every
  other date the same mark appears on. Modeled on Concrete Vision's own view —
  though the export has no shop-status fields, so cards can't reproduce CV's
  status colors.
- **Calendar** — month view. Month calendar for one plant (or all), each day
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

### Job Cost

Reads the **Job Cost Report — Active Jobs** workbook, one per plant. Unlike the
other modules this one keeps a **library**: every plant's report stays loaded, and
dropping a new file for a plant refreshes just that plant. Plants are exported on
their own schedules, so the strip shows each one's "as of" date and flags any that
have fallen behind — a company-wide total that mixes cut-off dates is easy to
misread.

- **Portfolio** — contract, billing, cost and margin across every loaded plant;
  jobs bucketed by the margin they are forecast to finish at; the jobs under 10%;
  cost broken down by section and category; a per-plant table.
- **Drafting & Eng** — the engineering view. Hours booked against estimate by
  project and by discipline, the blended labor rate, pieces designed, which jobs
  are over their hour budget, and which are being *designed* more slowly than the
  job is spending — the last one being the list worth reading first. Works best
  with My Projects on.
- **Jobs** — every active job, sortable on any column: contract, % billed,
  projected and actual cost, cost progress, and projected margin.
- **Cost Codes** — every cost code rolled up *across* jobs, with the codes running
  over projection flagged. The source system reports per job, so this view is the
  one thing it can't show you.
- **vs Production** — joins the cost reports to the scheduled production data on
  job number, so you can read how far a job has got against what is booked to pour
  next. Jobs present in only one of the two systems are listed rather than hidden.
- **Job detail** — the whole report for one job: the contract header, every cost
  line grouped as the report groups them, quantity progress, the lines running
  over, and every field the report carries including the blank ones. Each group
  of lines closes with a subtotal carrying the same completion percentage and bar
  as the lines above it.

**My Projects.** Star any job with the ☆ in the Jobs table or on its detail page,
then switch the toggle from *All Projects* to *My Projects* — every tab, including
the charts and the production comparison, narrows to just those jobs. The list is
saved in your browser and stays exactly as you left it until you add or remove
something. A starred job whose plant isn't currently loaded stays in the list and
is reported rather than quietly dropped.

Margin means **Est. OH & Profit** — net contract against *projected* cost, the
margin a job is expected to finish at. The report's *Net* OH & Profit is contract
less cost booked so far; it falls as a job spends and is not a forecast.

## Accepted files

`.csv`, `.xlsx` and `.xls`. Column headers are matched case- and
punctuation-insensitively against a list of aliases, so minor drift between
export versions still loads — including Concrete Vision's own `Deptment`
misspelling. If a required column is genuinely absent, the importer says which
one and lists the headers it did find.

Employee Time expects: `Effective Date`, `First Name`, `Last Name`, `Job Name`,
`Hours` (required), plus `Location`, `GL Code`, `Labor Task`, `Deptment` (optional).

Job Cost is the exception: it is a formatted, multi-sheet workbook rather than a
table, so it accepts `.xlsx`/`.xls` only and is read by its own parser. It expects
one worksheet per job, the job number and name in cell A3, and a
`Task` / `Description` header row. The plant is taken from the filename.

## Developing

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # data-layer, persistence and render checks
npm run build     # production build into dist/
npm run sample    # regenerate the synthetic CSV samples
npm run deploy    # test, build, publish to the gh-pages branch
```

The files in `samples/` are entirely synthetic — fabricated names, plants and job
numbers — so the dashboard can be demoed and tested without real company data. The
job cost fixtures are generated in memory by `scripts/job-cost-sample.mjs`, since a
multi-sheet workbook can't live in `samples/` as a CSV.

Deploys currently go out with `npm run deploy`, which publishes the build to the
`gh-pages` branch. Automatic deployment on push to `main` is ready to switch on —
see the deployment section of [CLAUDE.md](CLAUDE.md).

See [CLAUDE.md](CLAUDE.md) for architecture, conventions and how to add a module.
