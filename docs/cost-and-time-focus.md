# Cost and Time focus: retiring Production and Drawings

Proposed 2026-09-25. Status: **plan, not yet implemented.**

## Why

The owner now has other tools that cover the pour schedule and the
missing-ticket queue. Keeping those sections here costs more than it returns:
two exports to pull and keep in step, the coverage trap between them (§11 of
CLAUDE.md), roughly a third of the codebase, and a full test suite to maintain
for views nobody will open.

From here on the app answers two questions, both about jobs:

1. **What is a job costing, against its budget and its square footage?**
   The weekly Job Cost Reports, one workbook per plant.
2. **Where are engineering hours going?** The Concrete Vision employee time
   export.

The organising idea from the 2026-08-31 rework survives unchanged: the app is
about **jobs**, joined on the job **number**. It simply has two sources of
evidence instead of four.

## What goes

| Area | Removed |
|---|---|
| Sections | **Production** (`#/production`, all six tabs) and **Drawings** (`#/drawings`, all three tabs) |
| Exports | Scheduled Production Report (`ScheduledProdRptDtl.xls`) and Missing Piece Mark Ticket report |
| Stored records | `production`, `production-tickets`, `production-baseline` |
| Code | `src/modules/production/` and `src/modules/drawings/` in full |
| Projects tab | **Cost vs Schedule** (`#/projects/vs-schedule`), i.e. `job-cost/views/ProductionLink.jsx` |
| Shared parts only production used | `components/MonthCalendar.jsx`, `components/charts/ColumnChart.jsx`, `core/calendar.js` |
| Styles | the planning board, piece card, NO TICKET and movement-chip rules in `theme.css` |
| Tests and samples | `scripts/production-test.mjs`, `production-ticket-sample.mjs`, `make-production-sample.mjs`, `samples/production.sample.csv` |
| Home | the three production/drawings tasks and the "Plan vs actual" placeholder (it was scoped as a Production tab) |

Nothing is lost for good. The last commit that carries all of it gets a tag,
`pre-cost-time-focus`, so any piece can be recovered with one `git checkout`.

## What stays, and what changes in it

### Sections after the change

| Route | Section | Tabs |
|---|---|---|
| `#/` | **Home** | none |
| `#/projects` | **Projects** | All Jobs |
| `#/cost` | **Cost** | Portfolio · Cost Codes · Drafting & Engineering |
| `#/time` | **Time** | Overview · People · Jobs · Cumulative |
| `#/sources` | Sources | none (from the header chip and Home) |
| `#/job/<jobNo>` | Job page | Summary · Full Cost Report |

### Touch points outside the two deleted folders

Each of these reads production or ticket data today and needs trimming, not
deleting.

- **`src/app/AppData.jsx`**: drop the schedule, baseline and ticket datasets,
  the ticket index, coverage, the schedule diff, `scheduleRange`,
  `scheduledJobNos`, `replaceSchedule` and `clearSchedule`. The `ready` gate
  shrinks to `time`, `costLib` and `mine`.
- **`src/app/sources.js`**: two descriptors instead of four. The coverage
  warning goes with the ticket descriptor; the mixed cut-off warning on cost
  stays, and is now the main thing the header chip can shout about besides age.
- **`src/modules/sections.js`** and **`registry.js`**: remove both sections and
  the `vs-schedule` tab. Add aliases so old bookmarks land somewhere real
  instead of on a blank page:
  `production -> home`, `drawings -> home`. (Home rather than Projects, because
  Home can say in one line that these moved to other tools.)
- **`src/modules/projects/rows.js`**: the merge becomes cost + time. Drop the
  schedule and ticket loops, the `pieces`, `sfScheduled`, `cy`, `beds`, `days`,
  `missingTickets` and `unassigned` fields, and the presence filters that
  depend on them (`scheduled`, `both`, `cost-only`, `sched-only`, `missing`).
  Keep `costed`, `timed`, and **"Hours, no cost report"**, which is the one
  presence filter that still says something (usually an inactive job or an
  unloaded plant).
- **`src/modules/projects/index.jsx`**: remove the schedule columns and the
  Cost vs Schedule tab. The "nothing loaded" state names two exports.
- **`src/modules/job/assemble.js`** and **`job/index.jsx`**: drop the schedule,
  movement and drawings blocks. The job page becomes cost beside hours, still
  **never summed**. The title falls back cost first, then timesheet.
- **`src/modules/job-cost/views/JobDetail.jsx`**: remove the "Scheduled in
  Production" button and its `production` / `onOpenProduction` props.
- **`src/modules/job-cost/plants.js`**: this file exists only to translate
  Concrete Vision plant names into cost-report plants for the schedule join.
  Its one surviving use is `plantFromFileName`, which needs the list of known
  cost plants. Reduce it to that list (`COST_PLANTS`) and drop `costPlantFor`,
  `productionPlantsFor` and `isUnmappedProductionPlant`. Note: `Location` in
  the time export is still an **office**, not a plant, and still must not be
  mapped through this file (§12).
- **`src/modules/sources/index.jsx`**: two strips instead of four; Remove all
  clears cost and time only.
- **`src/modules/home/index.jsx`**: tasks for cost, D&E, hours and one job;
  the loaded-counts footer names two sources. One quiet line saying the pour
  schedule and ticket queue now live in other tools, for anyone arriving from
  an old bookmark.
- **`src/components/AppHeader.jsx`, `MyProjects.jsx`, `core/appData.js`,
  `core/myProjects.js`, `core/routing.js`, `App.jsx`**: comments and example
  routes that name production or tickets. Wording only.
- **`src/modules/employee-time/`**: comments and one hint that promise a join
  to the schedule and drawings. Wording only; the code already joins on the
  job number and needs no change.

### My Projects

Unchanged in behaviour: one starred list, keyed on the job number, now scoping
Projects, Cost and Time. Its storage key and read-forward migration stay as
they are, so nobody's starred list resets. Stars that only ever meant something
on the schedule remain in the list harmlessly; the list is never pruned (§14).

### Browser storage

Everyone who has used Production or Drawings has those three records sitting in
IndexedDB, and a schedule export is a few MB. Removing the code would orphan
them forever. Add a one-time cleanup in `core/store.js` that deletes
`cv.analysis.production.v1`, `cv.analysis.production-tickets.v1` and
`cv.analysis.production-baseline.v1` (and any localStorage fallback copies)
on startup. It is idempotent, so it can stay in place indefinitely and costs
three no-op deletes per load. Covered by a case in `test:storage`.

## Tests after the change

`npm test` goes from five suites to **four**:

| Suite | Change |
|---|---|
| `test:data` (`smoke-test.mjs`) | Routing fixtures move from `#/production/...` to `#/cost/...` and `#/time/...`. New cases: `#/production` and `#/drawings` resolve through their aliases. Project merge and job gather tests drop schedule and ticket inputs; the "rate with no denominator is `null`" and "`1000` must not match `100`" cases stay. Source-age fixtures use cost and time. |
| `test:production` | **Removed.** |
| `test:jobcost` | The "job-number split" block imports `splitJob` from `production/schema.js`. Retarget it to `employee-time/schema.js`, which carries the same rule, so the `00-006` / `00-009` guard is not lost with the file. Plant-alias cases shrink to the known-plant list. |
| `test:storage` | Schedule, baseline and ticket cases removed; the cleanup case added; the oversized-dataset case and the My Projects migration case stay. |
| `test:render` | Production and Drawings cases removed; fixtures `appLoaded` / `appEmpty` lose the schedule and ticket fields. Every remaining view keeps its empty and single-row cases. |

`scripts/find-export.mjs` keeps working as is; only the schedule and ticket
signatures, which lived in the removed suite, go away.

`xlsx` stays a dependency: the time export is `.xls` and the cost reports are
`.xlsx`.

## Documentation

- **CLAUDE.md**: delete §11 (Production) outright. Rewrite §0's state table and
  "Things that will bite you" (the schedule-id, ticket coverage and
  board/movement `diff` bullets go), §1 (two exports, four sections), §2
  layout, §3's worked examples, §7 (four suites), §10 (the production and
  ticket open questions close as "no longer applicable"), §13's "join to
  Production" subsection, §14's list of scoped sections, and §15's section
  table. Renumber nothing: leave §11 as a one-paragraph tombstone pointing at
  this document and the tag, so every "§12", "§13" reference elsewhere stays
  correct.
- **README.md**: section table and intro.
- **`docs/interface-proposal.md`**: left as a historical record, with a note at
  the top that Production and Drawings were retired by this document.

## Order of work

One branch, one PR, in commits that each leave `npm test` green:

1. Tag the current head `pre-cost-time-focus`.
2. Trim the shared layer first (`AppData`, `sources.js`, `rows.js`,
   `assemble.js`, Projects, job page, Home, Sources, JobDetail) so nothing
   outside the two folders still imports from them. Update the tests alongside.
3. Delete `modules/production/`, `modules/drawings/`, the orphaned components,
   their CSS, samples and test suite; update `package.json` scripts.
4. Add the storage cleanup and its test.
5. Rewrite CLAUDE.md and README in the same PR, asserting each scripted edit.
6. Deploy manually (`npm run deploy`) and check the **new** bundle hash.

## Risks and how they are covered

- **A dangling import** from a shared file into a deleted folder. The render
  suite mounts every view and fails on a broken import; a `grep` for
  `modules/production` and `modules/drawings` must come back empty before the
  PR is marked ready.
- **Losing the job-number whitespace rule** when `production/schema.js` goes.
  Covered by retargeting the existing test to the time schema, which is the one
  that matters now (19.2% of hours sit on `00-*` jobs).
- **Stale bookmarks.** Covered by the aliases and a routing test.
- **Nothing here is visually verified.** There is still no browser automation
  in this environment. The pages that change shape most are Home, the Projects
  table (fewer columns) and the job page (two blocks instead of four). The owner
  should look at `npm run dev` before deploying.

## Decisions for the owner

These have a recommended answer, used unless the owner says otherwise.

1. **Delete the code, or keep it dormant?** Recommended: **delete**, with the
   git tag for recovery. Dormant code still has to compile, pass tests and be
   read around.
2. **Keep the Projects section?** Recommended: **yes**. With cost and time
   both keyed on the job number, one row per job showing contract, margin,
   $/SF and booked hours side by side is still the best index into the job page.
3. **Replace Cost vs Schedule with something?** Recommended: **not in this
   PR**. The natural successor is a *Cost vs Hours* tab reading 60.x D&E cost
   against timesheet hours per job, but whether those two *should* reconcile is
   an open business question (§10: is `49-8300` the same work as 60.x?).
   Build it once that is answered.
4. **Clean up the old browser records?** Recommended: **yes**, as above.
