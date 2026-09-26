# CV Data Analysis

Browser-based analysis of two reports: the weekly **job cost** reports from the
company's cost system, and the **employee time** export from Concrete Vision, the
ERP the company runs on.

**Live:** https://weepingprophet77.github.io/CV_data_analysis/

Export a report, drop the file on the page, and read it.
Parsing happens entirely in your browser — **no file is ever uploaded anywhere**,
and nothing but code lives in this repository. Your last import is cached in the
browser's IndexedDB, so a refresh doesn't mean re-uploading; large exports
(100k+ rows) are fine.

## How it is organised

The application is about **jobs**. The timesheet and the cost workbooks are two
sources of evidence about jobs, joined on the job number.
So the sections are named after the question they answer rather than after the
file that feeds them, and any one section may read several files.

| Section | What it answers |
| --- | --- |
| **Home** | What this is, what is loaded, and where to start. Opens here. |
| **Projects** | Every job across cost and booked hours, in one list. |
| **Cost** | Margin, cost codes, and the drafting & engineering roll-up. |
| **Time** | Where timesheet hours are going. |

Two more pages are addressed but not in the nav: **Sources**, reached from the
file chip in the header, and the **job page** at `#/job/<job number>`: one
project across both sources, reached by clicking any job number anywhere.

**Sources lists every file with the date it was last modified** and how long ago
that was, so you can see at a glance how old your copy is and whether it needs
re-running. Each plant's cost report carries its own date, since they refresh
independently. Anything older than a fortnight is flagged — a rule of thumb, not
a policy, and the page says so. Note that a file's modified date is not the same
as the cost report's own "as of" cut-off, which the report prints inside itself;
both are shown.

Every tab is a real address, so it can be bookmarked and shared, and the browser
Back button works the way you expect.

**Production and Drawings were retired on 2026-09-25.** The pour schedule and
the missing-ticket queue are covered by other tools now. Old bookmarks to them
land on Home, which says so. The reasoning and the list of what was removed are
in [docs/cost-and-time-focus.md](docs/cost-and-time-focus.md).

### Time

- **Overview** — totals, cumulative burn for the whole selection, top projects ranked.
- **People / Projects** — sortable, searchable tables; click any row to drill in.
- **Cumulative** — the plotting view. Narrow to a person and/or a project, then
  split the hours into series by project, person, labor task, location,
  department or GL code. Toggle between cumulative totals and per-day hours.
- **Person / Project detail** — full breakdowns, each with its own cumulative chart.

Filters (date window, location, department) apply across every view.

### Projects

One row per job number, filled in from whichever source knows about it: contract,
margin and $/SF from the cost reports, booked hours and headcount from the
timesheet. A job present in only one source leaves the other side dashed, never
zeroed. Filter by which sources a job appears in to find "costed, no hours" or
"hours, no cost report".

### The job page

Click any job number anywhere and you get the whole project on one page: cost
and hours, each stating which report it came from and as of when. A source that isn't loaded says so; a source that is loaded but says
nothing about that job says *that* instead. Neither renders zeros.

The hours block breaks the time down by task and by person — the question the
cost report cannot answer, since it books cost to a code rather than time to a
person. The two sit side by side and are never added together.

### Cost

Reads the **Job Cost Report — Active Jobs** workbook, one per plant. Unlike the
timesheet this one keeps a **library**: every plant's report stays loaded, and
dropping a new file for a plant refreshes just that plant. Plants are exported on
their own schedules, so the strip shows each one's "as of" date and flags any that
have fallen behind — a company-wide total that mixes cut-off dates is easy to
misread.

- **Portfolio** — contract, billing, cost and margin across every loaded plant;
  jobs bucketed by the margin they are forecast to finish at; the jobs under 10%;
  cost broken down by section and category; a per-plant table.
- **Job Report** — pick any job and read its full cost report right in the Cost
  section. Each section (D&E, Production, Field, Other) opens into categories
  (Drafting, Engineering, Materials, Production Labor and so on), and each
  category opens to its lines, with budget, forecast, actual, variance and
  percent complete at every level. Clicking a job anywhere in Cost opens it here.
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
- **Full cost report** — the same report, also reachable from each job page: the
  contract header, every cost line grouped by section and category, quantity progress, the lines running
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
and `Summary` (optional). Its `Job Name` carries the job number in the
`"<number> - <title>"` shape, which is what lets timesheet hours join to cost.
Note that `Location` is the **person's office**, not the plant the job is built
at.

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
or a new export, [docs/interface-proposal.md](docs/interface-proposal.md) for
why the interface is shaped this way, and
[docs/cost-and-time-focus.md](docs/cost-and-time-focus.md) for why it narrowed
to cost and time.
