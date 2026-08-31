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

## How it is organised

The application is about **jobs**. Everything else — a timesheet, a pour
schedule, a cost workbook, a ticket report — is a source of evidence about jobs.
So the sections are named after the question they answer rather than after the
file that feeds them, and any one section may read several files.

| Section | What it answers |
| --- | --- |
| **Home** | What this is, what is loaded, and where to start. Opens here. |
| **Projects** | Every job across cost, schedule and drawings, in one list. |
| **Production** | What is being poured, on which bed, on which day. |
| **Drawings** | Which pieces have no ticket drawing, soonest-cast first. |
| **Cost** | Margin, cost codes, and the drafting & engineering roll-up. |
| **Time** | Where timesheet hours are going. |

Two more pages are addressed but not in the nav: **Sources**, reached from the
file chip in the header, and the **job page** at `#/job/<job number>` — one
project across every loaded source, reached by clicking any job number anywhere.

Every tab is a real address, so it can be bookmarked and shared, and the browser
Back button works the way you expect.

**Plan vs actual** — scheduled against actual dates, slip and weekly load — is
not built. Its intended scope is on Home; the column list is still a guess and
needs confirming against a real export.

### Time

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
- **Overview** — daily scheduled volume, cumulative volume, and rankings by plant,
  job and phase, in whichever measure you pick.
- **Beds** — utilization per bed, including days a bed is tied up casting nothing.
- **Pieces** — the full searchable, sortable detail table.
- **Schedule Changes** — each upload compared against the one it replaced: what
  moved earlier, what moved later, what is new and what was dropped. Appears once
  a schedule has been replaced at least once.

Rows with no quantity are kept, not dropped: they are bed activity — mold builds
and maintenance — and an occupied bed is real schedule information.

Per-job totals live in **Projects**, alongside the cost columns for the same jobs.

### Drawings

Reads the **Missing Piece Mark Ticket** report — every piece with no ticket
drawing. Filter by how soon the piece is cast (already passed, within 7 days,
8–30 days, later), then read it three ways: **Queue** (the pieces themselves),
**By Job**, **By Drafter**. Pieces with nobody assigned get their own bucket
rather than being folded into a total — a blank "Drawn By" is not a person.

If the schedule is loaded too, the pieces it names are flagged on the planning
board. **The two reports are pulled separately and often cover different
months**, so the section computes how far they actually overlap and says so, in
red, above everything else: a board flagging nothing means "every piece is
drawn" only when the ticket report covers the same dates.

### Projects

One row per job number, filled in from whichever sources know about it — contract
and margin from the cost reports, pieces and pour days from the schedule, missing
drawings from the ticket report, booked hours from the timesheets. A job present in only one source leaves the other
side dashed, never zeroed. Filter by which sources a job appears in to find
"costed but not scheduled" or "scheduled but not costed".

**Cost vs Schedule** joins the two systems on job number so you can read how far
a job has got against what is booked to pour next. The two are shown side by side
and never added together: cost figures are cumulative to date, the schedule is a
forward month.

### The job page

Click any job number anywhere and you get the whole project on one page: cost,
schedule, drawings and hours, each stating which report it came from and as of
when. A source that isn't loaded says so; a source that is loaded but says
nothing about that job says *that* instead. Neither renders zeros.

The hours block breaks the time down by task and by person — the question the
cost report cannot answer, since it books cost to a code rather than time to a
person. The two sit side by side and are never added together.

### Cost

Reads the **Job Cost Report — Active Jobs** workbook, one per plant. Unlike the
other modules this one keeps a **library**: every plant's report stays loaded, and
dropping a new file for a plant refreshes just that plant. Plants are exported on
their own schedules, so the strip shows each one's "as of" date and flags any that
have fallen behind — a company-wide total that mixes cut-off dates is easy to
misread.

- **Portfolio** — contract, billing, cost and margin across every loaded plant;
  jobs bucketed by the margin they are forecast to finish at; the jobs under 10%;
  cost broken down by section and category; a per-plant table.
- **Drafting & Eng** — the engineering view, in budget / cost / variance terms.
  The report carries two budgets — the original `Est Cost` and the current
  `Projections Total`, which differ on most lines — so both are shown, along with
  variance against each. The one against the forecast is the report's own column;
  the one against the original estimate is derived and labelled as such. Also:
  pieces designed, and which jobs are being *designed* more slowly than the job is
  spending, which is the list worth reading first. Hours and rates sit below the
  money, with a note on how far they can be trusted. Works best with My Projects on.
- **Cost Codes** — every cost code rolled up *across* jobs, with the codes running
  over projection flagged. The source system reports per job, so this view is the
  one thing it can't show you.
- **Full cost report** — the whole report for one job: the contract header, every cost
  line grouped as the report groups them, quantity progress, the lines running
  over, and every field the report carries including the blank ones. Each group
  of lines closes with a subtotal carrying the same completion percentage and bar
  as the lines above it.

**My Projects.** Star any job with the ☆ in a job table or on its job page, then
switch the toggle in the header from *All Projects* to *My Projects* — every
section narrows to just those jobs. The list is
saved in your browser and stays exactly as you left it until you add or remove
something. A starred job whose plant isn't currently loaded stays in the list and
is reported rather than quietly dropped.

**Cost per square foot** appears wherever it applies — the portfolio, each plant,
each job, and the engineering tab. Contract, budget, forecast and actual all divide
by the same denominator, **the job square footage** — not the area cast so far — so
they read against each other directly and actual rises toward forecast as the job
completes. Square feet cast to date is shown separately, as progress. Jobs that
report no footage show a dash rather than a zero, and are excluded from the
aggregate rates rather than dragging them down.

Margin means **Est. OH & Profit** — net contract against *projected* cost, the
margin a job is expected to finish at. The report's *Net* OH & Profit is contract
less cost booked so far; it falls as a job spends and is not a forecast.

## Accepted files

`.csv`, `.xlsx` and `.xls`. Column headers are matched case- and
punctuation-insensitively against a list of aliases, so minor drift between
export versions still loads — including Concrete Vision's own `Deptment`
misspelling. If a required column is genuinely absent, the importer says which
one and lists the headers it did find.

The employee time export expects: `Effective Date`, `First Name`, `Last Name`, `Job Name`,
`Hours` (required), plus `Emp Number`, `Location`, `GL Code`, `Labor Task`, `Deptment`
and `Summary` (optional). Its `Job Name` carries the job number in the same
`"<number> - <title>"` shape the schedule uses, which is what lets timesheet hours
join to cost and to the schedule. Note that `Location` is the **person's office**,
not the plant the job is built at.

The job cost report is the exception: it is a formatted, multi-sheet workbook rather than a
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

See [CLAUDE.md](CLAUDE.md) for architecture, conventions and how to add a section
or a new export, and [docs/interface-proposal.md](docs/interface-proposal.md) for
why the interface is shaped this way.
