# CLAUDE.md — CV Data Analysis

Guidance for Claude Code (and any human) working in this repository. Keep it
current: when a decision here stops being true, change it here in the same
commit that changes the code.

---

## 0. Start here

**Read §1 (constraints), §2 (layout) and §7 (testing) before changing anything.**
If the work touches the production module, read §11 too; the job cost
module, §13.

### State as of 2026-08-26

| | |
|---|---|
| Live site | https://weepingprophet77.github.io/CV_data_analysis/ |
| Repo | github.com/WeepingProphet77/CV_data_analysis (public) |
| Modules | **Employee Time** built · **Production** built · **Job Cost** built · **Schedule** placeholder |
| Deploys | **manual** — `npm run deploy`. Pushing to `main` does *not* update the site (§8) |
| Tests | five suites, all passing — `npm test` |

### Running it

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # gate every change on this
npm run deploy    # test, build, publish to gh-pages
```

On the owner's machine there is **no Homebrew and no system Node** — Node 24 LTS
lives in `~/.local/opt/node`, symlinked into `~/.local/bin`. A non-interactive
shell may not pick that up, so prefix commands with
`export PATH="$HOME/.local/bin:$PATH"` if `npm` is not found.

### Things that will bite you

- **Never commit company data.** Exports (`*.xls`/`*.xlsx`/`*.csv`) and UI
  screenshots (`*.png`/`*.jpg`) are gitignored. The real
  `ScheduledProdRptDtl.xls` sits in the working directory and must stay there.
  Check `git status` before every commit.
- **You cannot see the UI.** There is no browser automation here. Say so rather
  than implying a change was visually checked (§7).
- **Deploys are manual and the check must match the new bundle hash** — polling
  for "any bundle" reports success against the *old* one. Compare against
  `ls dist/assets/`.
- **Don't drop unmapped export columns** — they are carried as `row.extra` and
  shown in detail views (§4).
- **Eight categorical colors, never a ninth** (§5).
- **Job Cost persists a *library*, not a dataset** — one file per plant, each
  replaceable on its own. Don't "simplify" it back to `useDataset` (§13).

---

## 1. What this project is

A static, browser-only analysis front end for data exported from **Concrete
Vision** — the ERP the company runs on. Concrete Vision handles employee time,
production, scheduling and more. The user exports a report (usually `.csv`,
sometimes `.xlsx`) and drops it on this site to get analysis the ERP's own
reporting doesn't give them.

This started as a single-file React dashboard (`legacy/eng_time_dashboard.html`,
kept for reference). That file is the origin of the visual language and the
Employee Time feature set; it is **not** maintained and should not be edited.

### Non-negotiable constraints

1. **All processing is client-side.** Files are read with the `File` API and
   parsed in the browser. There is no server, no upload endpoint, no analytics.
   Never add one, and never suggest one — the data is employee and job data
   belonging to the company.
2. **No company data in the repository, ever.** `.gitignore` blocks `*.csv`,
   `*.xlsx` and `*.xls`. The sole exception is `samples/*.sample.csv`, which is
   synthetic. If a real export ever needs to be inspected, read it from wherever
   it already lives; do not copy it into the repo, and do not paste rows of it
   into commit messages, issues or code comments.
3. **The site is static.** It deploys to GitHub Pages from `dist/`. There is no
   backend to lean on.

---

## 2. Stack and layout

Vite + React 18, no framework beyond that. Routing is a hash router hand-rolled
in `src/App.jsx` — **path-based routing would 404 on GitHub Pages**, which serves
static files with no rewrite rules.

```
index.html                     Vite entry
vite.config.js                 base: '/CV_data_analysis/' in production builds
src/
  main.jsx                     mounts <App/>
  App.jsx                      shell: module nav, hash route, error boundary
  styles/theme.css             ALL styling — design tokens + component classes
  core/                        framework-free logic, no JSX, node-importable
    calendar.js                month-grid date math (weeksOf / monthsIn)
    csv.js                     RFC 4180 CSV reader (hand-rolled, dependency-free)
    idb.js                     IndexedDB wrapper (dependency-free)
    parse.js                   schema-driven ingest: coercion, column mapping
    aggregate.js               groupBy / rollup / cumulativeSeries / topNWithOther
    store.js                   useDataset — per-module IndexedDB persistence
    library.js                 useLibrary — multi-source persistence (see §13)
    palette.js                 the 8 validated categorical series colors + colorMapFor
    format.js                  fmt / pct / compact / date helpers
    hooks.js                   useSize (ResizeObserver)
  components/                  shared, module-agnostic UI
    ui.jsx                     Badge, MiniBar, StatCard, Tabs, Panel, sorting
    FileImport.jsx             ImportPrompt (empty state) + ImportButton
    DataBar.jsx                loaded-file strip: source, replace, clear
    Filters.jsx                FilterBar — date window + dimension selects
    ModulePlaceholder.jsx      stub UI for reserved-but-unbuilt modules
    MonthCalendar.jsx          month grid; cells keyed by ISO date
    charts/
      LineChart.jsx            multi-series time lines, crosshair, table view
      BarChart.jsx             ranked horizontal bars
      ColumnChart.jsx          vertical per-day columns
      scale.js                 niceTicks / sampleTicks / linear
  modules/
    registry.js                THE list of modules — nav and router read this
    employee-time/             built  — timesheet analysis
    production/                built  — scheduled pours (see §11)
      board.js                 planning-board column math (plain ESM)
      metrics.js               the pieces/SF/CY/LF measure list
    schedule/                  placeholder
scripts/
  make-sample.mjs              generates the synthetic employee-time CSV
  make-production-sample.mjs   generates the synthetic production CSV
  smoke-test.mjs               employee-time + core data-layer checks
  production-test.mjs          production schema, board columns, calendar grid
  storage-test.mjs             IndexedDB persistence (fake-indexeddb)
  render-test.jsx              server-renders every view against the samples
  deploy-pages.sh              manual gh-pages deploy (see §8)
  pages-deploy.workflow.yml    the Actions workflow, parked until scope (see §8)
samples/*.sample.csv               synthetic, safe to commit
legacy/eng_time_dashboard.html     the original single-file tool; reference only
```

### The layering rule

`core/` never imports from `components/` or `modules/`. `components/` never
imports from `modules/`. A module may import from both. Anything a second module
would want belongs in `core/` or `components/`, not copied.

`core/` files are plain ESM with no JSX and no React (except `store.js` and
`hooks.js`, which are hooks by nature) — that is what lets `scripts/smoke-test.mjs`
import them directly in node with no build step.

---

## 3. How a module works

A module is self-contained: it owns its schema, its dataset, its filters and its
views. `src/modules/registry.js` is the only place it is declared.

```
modules/<id>/
  index.jsx          entry component — owns dataset, filters, tabs, drill-down
  schema.js          field definitions the parser maps the export onto
  use<X>Filters.js   filter state and the derived filtered rows
  views/*.jsx        one file per tab or drill-down screen
  *.js               any pure helper the views share (production has board.js
                     for column math and metrics.js for its measure list).
                     Keep these as plain ESM — the test scripts import them
                     directly in node, which cannot load .jsx.
```

### Adding a module

1. Create `src/modules/<id>/schema.js`. Each field is
   `{ key, label, type: 'date'|'number'|'string', required, aliases: [] }`.
   Add `derive(row, raw)` for computed fields and `isEmptyRow(row)` to drop
   rows carrying no information.
2. Write `index.jsx` following `employee-time/index.jsx`: call
   `useDataset('<id>')`, show `<ImportPrompt>` when `rows.length === 0`,
   `<DataBar>` + `<FilterBar>` + views when loaded. Return `null` while
   `!data.ready` so saved data doesn't flash the empty state.
3. Add views under `views/`.
4. Register it in `registry.js` with `status: 'ready'`.
5. Add render cases to `scripts/render-test.jsx`, including empty and
   single-row datasets.

A module that receives **several files that must coexist** — as the job cost
reports do, one per plant — uses `useLibrary` from `core/library.js` instead of
`useDataset`, and owns its own strip in place of `<DataBar>`. See §13 before
reaching for it; a module fed by a single export should stay on `useDataset`.

`schedule` still renders `<ModulePlaceholder>`, which states its intended scope
and the export columns it is expected to consume. **That column list is a
guess** — confirm it against a real Concrete Vision export before building it
out. `production` is being built from a real export; see §11.

---

## 4. Data ingest

`core/parse.js` → `parseFile(file, schema)` → `{ rows, meta }`.

- `.csv` goes through `core/csv.js`. `.xlsx`/`.xls` **dynamically import**
  SheetJS, so the ~500KB parser is a separate chunk that a CSV user never
  downloads. Keep it that way: never add a top-level `import * as XLSX` —
  including in the job cost module, which reads workbooks only
  (`job-cost/importFile.js` owns that import, and nothing else in the module
  touches SheetJS).
- **Not every export is a flat table.** The job cost report is a formatted,
  multi-sheet document and has its own walker in `modules/job-cost/parse.js`.
  If a new export has merged cells, a header block or one sheet per entity,
  it needs the same treatment — don't force it through the schema mapper (§13).
- Column matching normalizes headers to lowercase alphanumerics, tries every
  alias, then falls back to substring containment. This is why a header rename
  in Concrete Vision usually needs only a new alias, not new parsing code.
- **`Deptment` is Concrete Vision's own misspelling.** It is listed as the
  canonical label in the employee-time schema with the correct spellings as
  aliases. Do not "fix" it — the export really says that.
- Coercion is forgiving on purpose: Excel date serials, `M/D/YY`, `1,234.5`,
  parenthesized negatives, currency symbols. Unparseable numbers become `0`
  rather than `NaN`, which would poison every downstream sum.
- Missing **required** columns throw a message naming the column and listing the
  headers actually found. Missing optional columns are silent.
- **No column is ever discarded.** Any header the schema doesn't name is carried
  onto every row as `row.extra[header]` (non-empty values only, so an
  always-blank column costs nothing) and rendered in the detail views under
  "Other columns in this export". This is why a column Concrete Vision adds
  later shows up with no code change — and it is covered by a test that asserts
  every export header is reachable from a parsed row. Don't "clean up" by
  dropping unmapped columns; add a schema field for them instead.

### Persistence

`useDataset(moduleId)` keeps the last import in **IndexedDB** under
`cv.analysis.<moduleId>.v1`, via the dependency-free wrapper in `core/idb.js`.

**Do not move this back to `localStorage`.** That was the original choice and it
was wrong: localStorage caps at ~5MB per origin and holds strings only, so every
save costs a full `JSON.stringify` and a real export is simply refused. A
120,000-row export is ~24MB as JSON — IndexedDB stores it in about 14ms
(`npm run test:storage` proves this). localStorage survives only as a fallback
for browsers with IndexedDB disabled, and anything found under the old key is
migrated across on first read and then deleted.

Bump `VERSION` in `core/store.js` if the row shape changes incompatibly.

Modules holding **many files at once** use `useLibrary` (`core/library.js`)
instead, under `cv.analysis.<moduleId>.lib.v1`. It shares `readRecord` /
`writeRecord` with `useDataset`, so there is one storage path and one fallback
story — don't fork it. See §13.

Writes are async and deliberately **not** awaited before the data renders — the
dashboard shows the import immediately and surfaces a warning only if the save
later fails. A failed save is never fatal: the session works normally, the file
just needs re-uploading after a refresh.

---

## 5. Charts and color

**Read this before writing any chart code.** The palette is not a style choice;
it was computed and validated.

- `core/palette.js` holds **eight** categorical series colors, assigned **in
  fixed order and never cycled**. They were validated against the chart surface
  `#13243f` for the dark lightness band, chroma floor, adjacent colorblind
  separation, normal-vision separation and 3:1 contrast.
- **A ninth series is never a new hue.** Use `topNWithOther(groups, MAX_SERIES)`
  and fold the tail into a gray "Other". Every view that plots a breakdown
  already does this.
- **The UI accent cyan (`--accent`) is never a data color.** Chrome and data do
  not share colors, so a highlighted line can't be mistaken for the interface.
- **Never a dual-axis chart.** Two measures of different scale get two charts.
- Mark specs, already implemented in the chart components: 2px lines with round
  joins; end markers r≥4 with a 2px surface-colored ring; bars capped at 22px
  with a 4px rounded data end and a square base; hairline solid gridlines; area
  fill at ~10% opacity and only for a single series.
- Identity is never color-alone: two or more series always get a legend, up to
  four also get direct end labels, and every chart has a **View as table**
  toggle.
- Text never wears a series color — labels and values use the text tokens; a
  colored swatch beside them carries identity.

If you add a chart type, put it in `components/charts/` and make it consume
`{ key, label, color, points }` series like `LineChart` does.

---

## 6. Styling

All styling lives in `src/styles/theme.css` as CSS custom properties plus
component classes. The look is deliberate — dark navy, cyan accents, monospace,
scanline and bloom overlays — carried over from the original tool.

- **Prefer a theme class over an inline style.** The legacy file was one long
  wall of inline styles; that is the thing this rewrite is moving away from.
  Inline styles are acceptable only for genuinely dynamic values (a computed bar
  width, an SVG coordinate).
- New colors go in as tokens under `:root`, not as literals in components.
- The theme is single, committed and dark. There is no light mode, and the page
  is not theme-reactive. If that ever changes it changes in `theme.css` alone.
- The decorative `.app::before` / `::after` overlays must stay
  `pointer-events: none`.

---

## 7. Testing

```bash
npm test                # all five suites; the deploy script gates on this
npm run test:data       # core/ logic in plain node — fast, no build
npm run test:production # production schema, derivations, calendar grid
npm run test:jobcost    # job cost parse + reconciliation (see §13)
npm run test:storage    # IndexedDB persistence, against fake-indexeddb
npm run test:render     # server-renders every view against the sample data
```

`test:production` also runs against the **real** `ScheduledProdRptDtl.xls` when
that file happens to be sitting in the working directory. It is gitignored, so
CI only ever sees the synthetic sample — but locally it is the check that
matters most.

`test:jobcost` does the same with the `weekly job costs/` folder, and its
central assertion is **reconciliation**: for every job, the parsed cost lines
must sum to the report's own Job Totals row, the totals must agree with the
header block, and each section banner must equal the sum of its own lines. That
is what makes the figures trustworthy — a walker that silently mis-classifies a
row shows up immediately as a total that no longer adds up. All 126 real jobs
reconcile as of 2026-08-26.

`test:data` covers CSV edge cases (quoted commas, escaped quotes, embedded
newlines, CRLF, BOM), date and number coercion, column mapping including drifted
headers, and the aggregation invariants that matter: **a rollup conserves the
total**, **"Other" conserves the remainder**, **a cumulative series is
monotonically non-decreasing and ends at the group total**.

`test:storage` runs the real IndexedDB code path against `fake-indexeddb` and
asserts that a dataset far larger than the localStorage cap saves and reloads
intact. Keep the oversized case — it is the regression guard for the bug that
motivated the switch.

`test:render` mounts every view — plus empty, single-row and unknown-key
datasets — and asserts the chart actually emitted geometry. It catches broken
imports and crashes, **not** visual regressions.

**No suite looks at the page.** There is no browser automation in this
environment — the Claude-in-Chrome extension is not set up, so nothing here can
screenshot or click the UI. When a change affects layout, spacing, color or
interaction, **say plainly that it was not visually verified** and ask the user
to look at `npm run dev`. Do not imply otherwise.

The render suite has still caught real browser bugs — it found `Schedule`
passing `month === null` to the calendar on first render, which threw in Chrome
too. Treat a render failure as a real defect until proven otherwise.

Where new tests go: `core/` logic → `smoke-test.mjs`; production schema, board
or calendar logic → `production-test.mjs`; job cost parsing, cost-code
classification or plant aliasing → `job-cost-test.mjs`; a new view → a case in
`render-test.jsx`, including its empty and single-row states. The harnesses are
hand-rolled on purpose — no test framework dependency.

---

## 8. Deployment

Live at **https://weepingprophet77.github.io/CV_data_analysis/**

There are two deploy paths, and right now the fallback is the active one.

**Active — manual, from the `gh-pages` branch:**

```bash
npm run deploy    # tests, builds, force-pushes dist/ to gh-pages
```

`scripts/deploy-pages.sh` refuses to run on a dirty working tree, runs `npm test`
first, and publishes into a throwaway worktree. **The `gh-pages` branch holds
build output only — never edit it, and never merge it into `main`.** It is
force-pushed on every deploy.

**Intended — GitHub Actions, on push to `main`:** the workflow is written and
committed, but parked at `scripts/pages-deploy.workflow.yml` rather than
`.github/workflows/deploy.yml`. GitHub rejects any push that adds a file under
`.github/workflows/` unless the pushing token carries the `workflow` scope, and
the local `gh` token does not. To finish the switch:

```bash
gh auth refresh -s workflow
mkdir -p .github/workflows
git mv scripts/pages-deploy.workflow.yml .github/workflows/deploy.yml
git commit -m "Activate Pages deploy workflow" && git push
```

Then set Pages source to **GitHub Actions** (Settings → Pages, or
`gh api -X PUT repos/WeepingProphet77/CV_data_analysis/pages -f build_type=workflow`),
delete the `gh-pages` branch, and drop `scripts/deploy-pages.sh` plus the
`deploy` script from `package.json`. Update this section when that happens.

`vite.config.js` sets `base: '/CV_data_analysis/'` for production builds only.
**Renaming the repo means changing that string**, or every asset 404s. A
`.nojekyll` file is written into `dist/` so Pages' Jekyll pass doesn't drop
`assets/`.

## 9. Conventions

- Comments explain **why**, not what. The codebase has a moderate comment
  density concentrated on non-obvious decisions (the `Deptment` misspelling, the
  hash-router choice, the eight-color cap, the lazy SheetJS import). Match it.
- Two-space indent, double quotes, semicolons. Named exports from `core/`;
  default export for a component.
- Prefer `useMemo` for derived data over recomputing in render — these views run
  over tens of thousands of rows.
- Money and hours are formatted through `core/format.js`, never with raw
  `toFixed` in a component.
- Dates are ISO `YYYY-MM-DD` strings everywhere in the data layer. They sort
  lexicographically, which is why filters and grouping compare them directly.
  Use `isoToDate` when a real `Date` is needed — it parses to **local** midnight,
  because `new Date('2026-03-14')` is UTC and shifts the day in western zones.

---

## 10. Open questions / next steps

Carry these forward; update as they're answered.

- [x] ~~Confirm the real column names in the **production** export~~ — done,
      `ScheduledProdRptDtl.xls` profiled 2026-08-24; schema in §11.
- [ ] Confirm the real column names in Concrete Vision's **schedule** export.
      The list in that placeholder is still a guess.
- [ ] What does the `(RL)` suffix on a piece mark mean, and what are the 51
      zero-quantity rows that still carry a piece mark? Both are passed through
      untouched until someone confirms.
- [ ] **Shop status is the biggest gap.** CV's planning view color-codes cards by
      workflow state and the export has none of it. Is there another Concrete
      Vision report that carries per-piece status, pour-sheet flags or shop
      completion? That would make the board a genuine replacement rather than a
      read-only echo.
- [ ] CV shows Est/Act pairs and a Total Emp row. Find out whether an export
      exists that carries actuals and labor estimates per bed-day.
- [ ] `Cert` is empty in every row of the export seen so far. It is mapped as a
      real field regardless, so values will appear if it ever carries any —
      nothing to do unless someone wants it surfaced more prominently.
- [ ] Does the employee time export include a pay-rate or cost column? If so,
      cost rollups become possible — but decide first whether pay data should
      live in a browser cache at all. Note the job cost reports already carry
      labor dollars per cost code (the 30.x and 40.x codes), so the cheaper
      question may be whether timesheet hours can be tied to those instead.
- [ ] Loading two exports covering different date spans currently **replaces**
      the dataset. If merging spans is wanted, it needs a dedupe key (probably
      date + person + job + task). IndexedDB now has the headroom for it.
- [ ] Very large datasets are held entirely in memory and re-aggregated on every
      filter change. If that gets sluggish, the fix is indexing or a web worker,
      not a smaller dataset — measure before optimizing.
- [x] ~~Cross-module analysis needs a story for joining datasets on job name~~ —
      done for cost↔production, 2026-08-26. The key is the job **number**, not
      the name; see §13. Employee Time still has no join — its `job` field has
      never been profiled against a real export (§12), so confirm its format
      before extending the same join to it.
- [ ] No CSV/PNG export from the dashboard yet. It would be most useful on the
      Job Cost tabs — a filtered cost-code table is the thing most likely to be
      wanted in a spreadsheet.
- [ ] **Job cost reports have no date axis.** Each is a snapshot, so there is no
      trend: "Current Mo Act" is the only period figure, and it is
      month-to-date, not weekly. Keeping successive weekly imports would make
      real burn curves possible — the library already stores one file per plant,
      so it would need a second key (plant + as-of) and a chart over the series.
      Worth doing only if someone actually wants the trend.
- [ ] What are the `-IN` companion jobs (`42343-IN`, `44050-IN`)? They are
      separate cost jobs, never appear in the production schedule, and their
      titles carry an `(EX)` suffix — erection/installation contracts, most
      likely. 11 of the 126 jobs are of this form. They are kept as distinct jobs pending confirmation; if they
      should roll up into their base job, that is a change to the join in §13.
- [ ] Monroeville's reports carry **no quantity rows at all** — no D&E/PROD/DELV
      pieces or square feet. Every other plant has them. Is that a setting in
      the source system, or does that plant genuinely not track them? Until it
      is answered, the quantity columns on the "vs Production" tab show "—" for
      those jobs rather than a misleading zero.
- [ ] The cost system's plant list is a subset of Concrete Vision's. Jacksonville
      and Pearland have production but no cost report; confirm whether one
      exists before assuming those jobs are simply uncosted.
- [ ] Consider a per-person weekly-hours view (over/under 40) once real data
      confirms how overtime is represented.

---

## 11. Production module — plan

Built from a real export: **`ScheduledProdRptDtl.xls`** ("Scheduled Production
Report — Detail"), profiled 2026-08-24. It is **forward-looking**: a month of
*scheduled* pours, not actuals. Language in the UI says "scheduled", never
"produced".

### The export

Genuine legacy BIFF `.xls` (not HTML-in-disguise, which ERP exports often are),
one sheet, 20 columns, 4,358 rows covering 2026-08-01 → 2026-08-31.

| Column | Field | Notes |
|---|---|---|
| Plant | `plant` | 7 values |
| Bed Date | `date` | the pour date; 26 dates, Mon–Sat, no Sundays |
| Bed Name | `bed` | 131 beds; **plant-scoped** — no name is shared across plants, but key by plant+bed anyway |
| Leadman | `leadman` | sparse (626/4358) |
| Phase | `phase` | `"N - Name"`; blank on non-pour rows |
| Mold | `mold` | sparse (210/4358) |
| Piece Mark | `mark` | 1,617 distinct; some carry an `(RL)` suffix |
| Qty | `qty` | **only 0, 1 or 2** — sum it for a piece count, never count rows |
| Total SF / CY / LF | `sf` `cy` `lf` | square feet, cubic yards, linear feet |
| Pos | `pos` | position on the bed |
| Cert | `cert` | empty in every row of the sample export, but mapped anyway |
| Job Name | `job` | `"NNNNN - TITLE"` for 60 of 63 — parse defensively |
| Bed Comment | `comment` | carries literal HTML (`<b>Bed Comment:</b> `) and an `N/A` sentinel; both stripped |
| Prd Code | `prdCode` | |
| Cross Section | `crossSection` | |
| Cast No. / CTRL Num / Pour No. | `castNo` `ctrlNum` `pourNo` | identifiers, kept as strings |

### Grain and the modeling decisions

One row = **one scheduled piece on one bed on one date at one plant**.

- **The bed-day is the calendar unit** — 1,765 of them. A bed-day is *not* a
  single pour: 347 carry more than one `Pour No.` and 128 span more than one
  job. Never assume bed+date is one pour or one job.
- **832 rows have `qty = 0`**, and those rows carry zero SF, CY and LF without
  exception. 781 have no piece mark and a comment like *"Bed Maintenance: Build
  New Mold"* — these are **bed activity, not production**, and they are
  **kept, not dropped**: an occupied bed is real schedule information. They are
  flagged `isPour: false` and shown distinctly. The remaining 51 carry a mark
  but zero everything; treated the same way pending an answer in §10.
- `isEmptyRow` therefore drops a row only when it has no date, plant or bed —
  **never on `qty === 0`.**
- Up to 31 pieces land on a single bed-day, so a calendar cell must summarize
  rather than list everything.

### Views (`modules/production/views/`)

| File | Tab | What it shows |
|---|---|---|
| `PlanningBoard.jsx` + `PieceDetail.jsx` | **Board** | The primary view — a bed × day planning grid modeled on Concrete Vision's own Production Planning screen (`fpProdPlanningView.cfm`). Beds down the side, every calendar day across the top, cells holding `<job no> <piece mark>` cards. Per-day totals across the top (pours, pieces, CY, SF); per-week totals interleaved after each Sunday, and per-bed week totals in the same columns. Clicking a card opens every field the export carries for that piece. |
| `Schedule.jsx` + `DayDetail.jsx` | **Calendar** | Month calendar, one cell per day, filtered to a plant. Cell shows the selected metric (pieces / SF / CY / LF) with a sequential heat wash and the busiest beds. Click a day → day detail: every bed, its pieces, and its comments. |
| `Overview.jsx` | **Charts** | Stat tiles, daily scheduled volume as a column chart, cumulative volume through the month, top jobs and plant comparison as ranked bars. |
| `Beds.jsx` | **Beds** | Utilization per bed: days scheduled, pieces, SF, CY, and idle days in the window. |
| `Jobs.jsx` | **Jobs** | Per-job rollup — pieces, SF, CY, date span, plants involved. |
| `Pieces.jsx` | **Pieces** | The searchable, sortable detail table, capped at 300 rows a page. |

Filters shared across tabs: date window, plant, job. **Board and Calendar own
their own plant picker** (it drives what they render), so the shared filter row
omits plant on those two tabs rather than showing two controls for one thing.

### Shared components this adds

- `components/MonthCalendar.jsx` — generic month grid taking
  `{ date, value, label, detail }` cells. Lives in `components/`, not the
  module, because the Schedule module will want the same grid.
- `components/charts/ColumnChart.jsx` — vertical time bars for per-day
  magnitude. Discrete days are columns; `LineChart` stays for accumulation.

The calendar heat is a **sequential** encoding — one hue, low values near the
surface, high values bright — not the categorical palette. Categorical slots
still apply where series are compared (jobs, plants).

### What building it turned up

- **Derive, don't sync.** `Schedule` originally set its visible month in a
  `useEffect`. Effects don't run on the first render, so the calendar received
  `month === null` and threw — in the browser, not just under test. Month and
  selected day are now **derived during render** from the data, which also keeps
  them valid for free when a filter drops them out of range. Prefer derived
  state to an effect that syncs one piece of state to another.
- **`core/` must stay node-importable.** `monthsIn`/`weeksOf` were briefly
  defined inside `MonthCalendar.jsx`, which made them unreachable from the test
  scripts — plain node cannot import `.jsx`. They live in `core/calendar.js`
  now. The layering rule in §2 exists for exactly this.
- **A module renders `null` until its dataset resolves**, so `render-test.jsx`
  marks module-level cases `allowEmpty` — the assertion there is "must not
  throw", not "must produce output".

### The planning board, versus Concrete Vision's

The board deliberately mirrors CV's Production Planning view — same axes, same
`<job no> <piece mark>` cards, same per-day and per-week totals — because that is
the layout the schedulers already read. Verified against a screenshot of the live
view: Ashland City, Pad 2, Wed 08/26 shows `43134 RM101` twice in CV, and the
export produces the same two rows.

**The one thing it cannot reproduce: shop status.** CV tints every card by
workflow state — Preliminary, Return Leg, Pour Sheets Attached, Pour Sheets
Revised, Wood Shop Complete, Steel Shop Complete, Embeds Complete, Mesh/Cage
Complete, Bed Verified/Poured, Missed Pour, Bed Maintenance, Non Prd Day — and
carries a row of per-stage checkboxes on each card. **None of those fields are in
the Scheduled Production Report export.** Cards are therefore tinted by a
dimension the export does have (job, phase or product code), and the UI says so
in a note under the board. Do not fake these colors, and do not infer status from
dates. If status is wanted, it needs a different export or a second report — that
question is in §10.

Also absent from the export and so absent from the board: the **Est/Act split**
(CV shows estimated against actual for employees, pieces, CY and SF — the export
carries one set of scheduled figures) and **Total Emp**, which has no column at
all.

Board specifics worth knowing:

- **Day columns are contiguous**, generated by `daySpan` from the filtered range
  rather than from the dates present. The export has no Sunday rows; skipping
  them would close the gap and misrepresent the week. Days with nothing
  scheduled render as grey `offday` columns.
- **Week totals close each Monday–Sunday week**, and a range ending mid-week
  still gets a total for its trailing partial week.
- **Capped at `MAX_DAYS` (70) columns.** Past that the grid stops being readable;
  narrow the date filter instead of raising the cap.
- Cells are looked up from a `Map` keyed `"bedKey|date"`, built once per render
  pass — 32 beds × 70 days is 2,240 cells, so a linear scan per cell would be
  quadratic over the row set.
- Sticky positioning: the bed column pins left, the date header pins to the top
  of the scroll container, and the corner cell needs both plus a higher
  `z-index`. The summary rows scroll away by design — pinning five more rows
  eats too much vertical space on a laptop.

### Detail views are exhaustive by design

`PieceDetail` lists **every** schema field whether or not it has a value, so
"blank for this piece" is visibly distinct from "not in this report". A field
whose stored value is derived also shows its source text (`Job Name` shows the
cleaned title plus the raw `"43134 - 1401 CHURCH STREET"`; `Phase` and
`Comment` likewise), so no derivation hides the original. `row.extra` is
rendered after the named fields.

There is a "show fields that are empty" toggle for a compact read, defaulting to
**on** — completeness is the point of the panel.

Apply the same rule to any future detail view: show the whole record, mark
empties, never silently omit a field.

---

## 12. Employee Time module

The first module, and the one the legacy single-file dashboard
(`legacy/eng_time_dashboard.html`) was rewritten from.

**Caveat a new agent should know:** unlike production, this schema was derived
from the legacy tool's parser, **not** profiled against a real export. The
column names are believed right and the aliases absorb drift, but nobody has
verified them against a live file the way `ScheduledProdRptDtl.xls` was. Treat
`schema.js` here as informed guesswork until an export confirms it.

### The export

`Effective Date`, `First Name`, `Last Name`, `Job Name`, `Hours` (required);
`Location`, `GL Code`, `Labor Task`, `Deptment` (optional).

**`Deptment` is Concrete Vision's own misspelling** and is the canonical label in
the schema, with correct spellings as aliases. Do not "fix" it.

Derived: `name` (first + last), which is what every view groups people by.
`isEmptyRow` drops a row with no date, no name, or zero hours — unlike
production, a zero here carries no information.

### Views (`modules/employee-time/views/`)

| File | Tab | What it shows |
|---|---|---|
| `Overview.jsx` | Overview | Stat tiles, cumulative burn for the whole selection, top projects ranked. |
| `People.jsx` | People | Sortable, searchable roster — hours, share of total, project count, days charged. |
| `Projects.jsx` | Projects | Same for jobs — hours, headcount, first/last charge. |
| `Cumulative.jsx` | Cumulative | The plotting view. Narrow to a person and/or project, then split into series by project, person, labor task, location, department or GL code; cumulative or per-day. |
| `PersonDetail.jsx` | drill-down | One person: cumulative hours per project, plus their project table. |
| `ProjectDetail.jsx` | drill-down | One job: total burn, cumulative by person, hours by task, team table. |

`useTimeFilters.js` holds the shared date-window / location / department filter
state, mirroring `useProductionFilters.js`.

### Decisions worth keeping

- **The Cumulative view is a small pivot, not six hard-coded charts.** Adding a
  new way to slice hours means adding one entry to its `SPLITS` array.
- Series are capped at the eight validated palette slots via `topNWithOther`;
  the ninth and beyond fold into a grey "Other" with a note saying so (§5).
- `cumulativeSeries` takes a shared date `domain` so every series spans the same
  x range and carries flat across idle days — without it, lines jump
  horizontally past each other and read as though work stopped.

---

## 13. Job Cost module

Built from four real exports profiled 2026-08-26: `<Plant> Job Cost Report -
Active Jobs.xlsx`, one per plant, in the gitignored `weekly job costs/` folder.

**These come from a different system than Concrete Vision.** Same company, same
jobs, different reporting tool — which is why nothing here reuses the production
schema and why the join between them (below) is explicit rather than assumed.

### The export, and why it needs its own parser

It is **not a flat table**, so it does not go through `core/parse.js`. It is a
*formatted report*: **one worksheet per job**, each laid out identically.

```
row 1                                        "As of 8/26/2026"
row 2   "Job Cost Report - Active Jobs"
row 3   "43134   1401 CHURCH STREET…"        Actual Cost      7,415,439.52
row 4     Original Contract  12,279,836      Net Contract     Projected Cost
row 5     Change Orders               0      Amount Billed    Est. OH & Profit  22.1%
row 6     Net Contract       12,279,836      % Billed 64.56%  Net OH & Profit   39.61%
row 8   Task | Description | Est Qty | Est Cost | Projections Total |
        Current Mo Act | Act Qty | | Act Cost | | Variance | % of Proj
        …section banner, detail lines, "TASK GROUP TOTAL" subtotal, repeat…
        Job Totals
        90.100 BUDGET - CONTINGENCY          ← printed *below* the totals
```

Positions are fixed and were verified across all 126 sheets: the header row is
always row 8, the header block always occupies rows 1–6 in the columns above.
`parse.js` walks this explicitly; `COL` names the column indices (7 and 9 are
spacer columns).

Profile: 4 workbooks, 126 job sheets, 3,448 cost lines, 563 quantity rows.
Two different "as of" dates were already in play on day one — Hillsboro at
7/31, the rest at 8/26 — which is the whole reason for §13's library.

### Row taxonomy

Every row in the grid is one of five things, and telling them apart is the
entire job of the parser:

| Row | How it is recognised | Treatment |
|---|---|---|
| **Section banner** | col A ends `TASK GROUP TOTAL` / `TASK GROUPS TOTAL`, or is exactly `OTHER` | Sets the current section; its figures are kept for cross-checking |
| **Quantity row** | col A is `D&E`, `PROD` or `DELV` | Kept **apart from costs** — see below |
| **Cost line** | col A matches `NN.NNN` (and one observed `70.000A`) | The data |
| **Subtotal** | col A empty, col B `TASK GROUP TOTAL` | Ignored — recomputed from the lines |
| **Job Totals** | col A is `Job Totals` | The job's totals |

**Order matters**: `D&E TASK GROUP TOTAL` starts with a stage prefix, so the
banner test must run before the quantity test or the section header is read as
a quantity row. There is a test for exactly this.

### Three things that will produce wrong numbers if you miss them

1. **Quantity rows carry no money.** On a `PROD ARCHITECTURAL (SQ FT)` row the
   "Projections Total" column holds a *projected quantity* and "Variance" holds
   a *quantity* variance. Summing those into a cost rollup adds square feet to
   dollars. They are parsed into a separate `quantities` list for this reason.
2. **`90.100 BUDGET - CONTINGENCY` sits below the Job Totals row and is excluded
   from it.** It is held on the job as `contingency`, never in `costs`. The one
   place it leaks is the `OTHER` section banner, whose *Est Cost* includes it —
   so `OTHER`'s banner is the single figure that does not equal the sum of its
   own lines. Every other banner reconciles exactly. That asymmetry is asserted
   in `job-cost-test.mjs`; it is the report's behaviour, not a parse bug.
3. **A code number is not a unique key.** The same number carries different work
   at different plants — `20.600` is "BACKER CEMENT" in 75 sheets and "READY MIX
   - CONCRETE" in 33; `55.100` has five spellings. The Cost Codes view keys on
   code **and** description and flags the collisions. Rolling up on the number
   alone silently adds unlike things together.

### Est. vs Net OH & Profit

Both are in the header block and they are not the same measure. Verified as
exact identities across all 126 jobs:

- `Est. OH & Profit = Net Contract − Projected Cost` — margin **at completion**.
  This is the margin figure. Everything in the UI that says "margin" means this.
- `Net OH & Profit = Net Contract − Actual Cost` — contract less what has been
  spent *so far*. It starts near 100% and falls as the job spends, so it is not
  a forecast and must never be presented as one.

Also identities, and tested: `Net Contract = Original + Change Orders`,
`% Billed = Amount Billed / Net Contract`.

### Persistence: a library, not a dataset

**This is the module's one structural departure.** `useDataset` holds a single
import and replaces it on upload. Here the reports arrive one per plant, each
refreshed on its own schedule, so replacing would discard three plants to update
a fourth. `core/library.js` (`useLibrary`) keeps **one entry per source, keyed
by plant**; re-importing a plant overwrites just that entry.

- The plant comes from the **filename** — the worksheets carry no plant field.
- The whole library is one IndexedDB value, so an import is atomic.
- `store.js` was generalised into `readRecord`/`writeRecord` so both hooks share
  one storage path with one fallback story. Don't fork it again.
- Because plants refresh independently, **the library routinely holds more than
  one cut-off date**. The strip badges any plant older than the newest and the
  UI says so above the totals. Do not remove that: a company-wide number mixing
  a 7/31 plant with 8/26 plants is wrong in a way nobody would notice.

### The join to Production

Job **number**, not job name — the two systems write the name differently
(`"43134 - 1401 CHURCH STREET"` vs `"43134   1401 CHURCH STREET MOTLEY T1"`) but
agree on the number. Confirmed against real data: 32 of 63 scheduled jobs have a
cost report loaded.

- **Plants do not correspond one-to-one.** CV splits Hillsboro into `Hillsboro`
  and `Hillsboro Structural`; the cost system bills one Hillsboro. CV also runs
  Jacksonville and Pearland, which have no cost report at all. `plants.js` is
  the **only** place that mapping lives — edit it there, nowhere else.
- **The two datasets answer different questions.** Cost figures are cumulative
  **to date**; the production dataset is a **forward** month of scheduled pours.
  The view shows them side by side and says so; they are never summed.
- Non-matches are shown, not hidden: "scheduled but not costed" (usually a plant
  whose report isn't loaded) and "costed but not scheduled" (expected — the
  schedule covers a month, the cost report covers every active job).
- Fixing this join turned up a real bug in `production/schema.js`: `splitJob`
  matched its separator without requiring surrounding spaces, so `00-006` and
  `00-009` both became job number `"00"` — two distinct admin jobs collapsed
  onto one key. The regex now requires whitespace around the dash. Tested.

### Views (`modules/job-cost/views/`)

| File | Tab | What it shows |
|---|---|---|
| `SourceLibrary.jsx` | (strip) | One row per loaded plant — as-of date, job count, file, remove. Drop target accepts several workbooks at once. Replaces `DataBar` here, which describes a single file. |
| `Portfolio.jsx` | **Portfolio** | Stat tiles, margin-at-completion bands, jobs under 10% margin, cost by section and category, per-plant table. |
| `Jobs.jsx` | **Jobs** | The sortable job table — every column sorts, which is the main way in. |
| `CostCodes.jsx` | **Cost Codes** | Cross-job rollup by code. The analysis the source system can't give them, because its reports are per-job. |
| `ProductionLink.jsx` | **vs Production** | The join above. |
| `JobDetail.jsx` | drill-down | The whole report for one job, reproduced. |

`JobDetail` follows the §11 rule: every field is listed whether or not it has a
value, subtotals are **recomputed from the lines on screen** rather than read
from the sheet, and the "show fields that are empty" toggle defaults to **on**.

### Conventions this module added

- `core/format.js` gained `money`, `moneyCompact` and `ratio`. `ratio` formats a
  *stored* ratio (0.7752 → "77.5%"); `pct` divides a part by a total. Using the
  wrong one is off by a factor of the total.
- `FilterBar`'s date window is now optional — omit `range` and it isn't drawn.
  A job cost report is a snapshot, not a series.
- Job-cost styling is scoped under `.jc` in `theme.css`. The numeric columns are
  right-aligned there; the other modules left-align theirs, and changing that
  globally would restyle views nobody has looked at.
- The sample workbooks are **generated in memory** (`scripts/job-cost-sample.mjs`),
  not committed. A real report may never enter the repo (§1), and a binary
  fixture can't be a `samples/*.sample.csv`.

### Not visually verified

The whole module was built and tested without anyone looking at it — there is no
browser automation here (§7). Layout, spacing, colour and interaction need a
human pass at `npm run dev`.
