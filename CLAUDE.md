# CLAUDE.md — CV Data Analysis

Guidance for Claude Code (and any human) working in this repository. Keep it
current: when a decision here stops being true, change it here in the same
commit that changes the code.

---

## 0. Start here

**Read §1 (constraints), §2 (layout), §15 (the shell) and §7 (testing) before
changing anything.** Then read the section for the part you are touching:
§12 time, §13 cost. §3 covers adding a tab, a section or a new export; §9 the
code conventions; §6 styling. §11 is a tombstone: Production and Drawings were
retired on 2026-09-25 (`docs/cost-and-time-focus.md`).

### The working cycle

Every change in this repo has gone through the same loop. Follow it:

1. **Profile the real data first** when the work touches an export. Every wrong
   assumption in this project's history was caught by looking at the actual file
   rather than reasoning about it — see the $/SF and hours episodes in §13.
2. **Put pure logic in a `.js` file** the test scripts can import in node, and
   keep `.jsx` for views only (§2).
3. **`npm test`**: four suites. The job cost and data suites additionally
   run against the *real* exports when they are present locally, which is the
   check that matters most.
4. **Update this file in the same commit**, wherever a decision here stopped
   being true. Use an assertion when scripting an edit to it: several edits to
   this document have silently no-op'd because a pattern stopped matching.
5. **Commit, push, then `npm run deploy`** — deploys are manual and pushing to
   `main` does not publish (§8).
6. **Verify the deploy against the new bundle hash**, not "a bundle" (§8).
7. **Say plainly that nothing was visually verified** — there is no browser
   automation here (§7).

### State as of 2026-09-25

| | |
|---|---|
| Live site | https://weepingprophet77.github.io/CV_data_analysis/ |
| Repo | github.com/WeepingProphet77/CV_data_analysis (public) |
| Sections | **Home** · **Projects** · **Cost** · **Time**, plus **Sources** and the **job page**, which are addressed but not in the nav (§15) |
| Retired | **Production** and **Drawings**, 2026-09-25. The pour schedule and the missing-ticket queue moved to other tools. Plan and reasoning in `docs/cost-and-time-focus.md`; the code is recoverable from commit `ca57d86` (tagged `pre-cost-time-focus` locally, push the tag if it is not on the remote yet) |
| Deploys | **manual**: `npm run deploy`. Pushing to `main` does *not* update the site (§8) |
| Tests | four suites, all passing: `npm test` |
| Real data | the timesheet export and the `weekly job costs/` folder sit in the working directory, gitignored. The tests find them **by content, not by name** (§7), so a re-download under any name still gets checked |
| Profiled | both exports. Nothing in the app is fed by a guessed schema |

### Running it

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # gate every change on this
npm run build     # production build into dist/
npm run preview   # serve the built dist/ locally
npm run sample    # regenerate the synthetic CSV samples
npm run deploy    # test, build, publish to gh-pages
```

On the owner's machine there is **no Homebrew and no system Node** — Node 24 LTS
lives in `~/.local/opt/node`, symlinked into `~/.local/bin`. A non-interactive
shell may not pick that up, so prefix commands with
`export PATH="$HOME/.local/bin:$PATH"` if `npm` is not found.

### Things that will bite you

- **Never commit company data.** Exports (`*.xls`/`*.xlsx`/`*.csv`) and UI
  screenshots (`*.png`/`*.jpg`) are gitignored. The real exports sit in the
  working directory and must stay there. Check `git status` before every
  commit.
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
- **My Projects is app-wide, in `core/`** — one starred list scoping every
  module. It is not a job-cost feature any more; don't re-key it per module (§14).
- **Every `$/SF` rate divides by the job square footage**, never by the area cast
  to date. Getting this wrong produces a rate that can't be compared to a budget
  (§13).
- **A missing rate is `null`, not `0`.** A job with no square footage has an
  unknown $/SF, and a zero would read as "costs nothing per foot" (§13).
- **Short-looking totals are a scope question before they are a bug.** The
  order to check: the My Projects switch in the header, the date window (both
  boxes), then Location/Department. `ScopeNotice` states all three on Time.
  Ingest has been reconciled per person against the sheet since 2026-09-01 and
  loses nothing (§7).
- **A workbook can have more than one sheet, and the parser reads all the
  matching ones** (§4). If hours or quantities ever look short, the ingest
  summary at the top of the page is the first thing to read — it states rows
  kept against rows offered and names any sheet it skipped.
- **Never identify an export by its filename.** They are gitignored and
  re-downloaded constantly, so the names drift (`EmpTimeExport (1).xls`). The
  suites resolve them by content via `scripts/find-export.mjs`; the app reads
  whatever is dropped on it and only checks the extension. The single exception
  is the **job cost plant**, which is unavoidable — the workbook carries no
  plant field — and `plantFromFileName` is written defensively for it (§13).
- **The date window is inclusive at both ends, and its boxes default to the
  file's own range** — which is not the month anyone has in mind. An export
  running 2026-01-01 → 2026-09-01 leaves the To box on **September 1**, so
  setting only *From* to Aug 1 quietly adds that day's hours to "August". Ask
  what both boxes say before believing a monthly figure is wrong (§12).
- **A total row shows variance.** Every table that has the column totals it.
- **Three different dates, never conflated.** `fileDate` is the file's mtime
  ("how old is my copy"), the job cost report's `asOf` is the report's own
  cut-off printed inside it, and `importedAt` is when it was dropped on the
  page. A file re-saved today does not make the report inside it newer. The UI
  says "modified", never "exported" (§15).
- **Don't trust a doc edit that wasn't asserted.** Scripted edits to this file
  have silently matched nothing more than once; check the result.
- **Sections are named after questions, not exports.** "Job Cost" and "Employee
  Time" were file names, and a nav of file names only made sense to whoever
  pulls the reports. Don't add a section named after the file that feeds it
  (§15).
- **`modules/sections.js` is plain ESM; `modules/registry.js` attaches the
  components.** The split is what lets the routing rules be tested in node,
  which cannot load `.jsx`. Adding a section means editing both (§15).
- **Datasets are app-wide** (`src/app/AppData.jsx`), not owned by whichever
  module got them first. The job page, Projects and Home need both at once.
- **Tabs are links, and the whole hash is parsed.** `#/cost/codes`,
  `#/job/43134/cost`. Don't reintroduce tab state in a section (§15).
- **`#/production` and `#/drawings` are aliases to Home**, which says in one
  line that those moved to other tools. Keep the aliases; bookmarks outlive
  sections. `dropRetiredRecords` in `core/store.js` deletes their old IndexedDB
  records on startup; keep that too, it is a no-op once they are gone.
- **`Location` in the time export is the person's *office*, not the job's
  plant.** Profiled: 0 of 110 people sit at more than one, while 82 of 267 jobs
  are charged from several. Do not alias it to "plant" and do not run it through
  `job-cost/plants.js` (§12).
- **Both exports carry the job number**, and the timesheet writes it as
  `"<no> - <title>"`. The whitespace-around-dash rule in `splitJob` is
  load-bearing: the time export is 19.2% `00-*` admin jobs, and an unspaced
  match collapses them onto one key (§12). It was first found in the retired
  production schema; its test now lives against the timesheet.

---

## 1. What this project is

A static, browser-only analysis front end for the company's own reports. The
user exports a report, drops it on this site, and gets analysis the source
system's own reporting doesn't give them.

**Two source systems feed it, and they are not the same product:**

- **Concrete Vision**: the ERP the company runs on: employee time, production,
  scheduling. One export feeds the app: the employee time export, a flat
  table read by the schema-driven parser in `core/parse.js` (§4). The
  schedule and missing-ticket exports fed Production and Drawings until those
  were retired on 2026-09-25 (§11).
- **The cost system** — a separate product that issues the weekly job cost
  reports, one workbook per plant. Its export is a *formatted report*, not a
  table, and has its own parser (§13).

They describe **the same jobs**, which is why the whole app is organised around
the job and why every join is on the job *number*, never the name (§13, §15). Don't assume a convention
from one system holds in the other; the two write job names, plant names and
quantities differently, and every place they disagree is documented.

Two exports, four sections. The mapping is not one-to-one on purpose: a
section answers a question and reads whichever sources that question needs
(§15).

**Both have been profiled against real files, and both carry the job number.**
That is what lets them join, and it is the reason the app is organised around
the job.

This started as a single-file React dashboard (`legacy/eng_time_dashboard.html`,
kept for reference). That file is the origin of the visual language and the
Employee Time feature set; it is **not** maintained and should not be edited.

### Non-negotiable constraints

1. **All processing is client-side.** Files are read with the `File` API and
   parsed in the browser. There is no server, no upload endpoint, no analytics.
   Never add one, and never suggest one — the data is employee and job data
   belonging to the company.
2. **No company data in the repository, ever.** `.gitignore` blocks `*.csv`,
   `*.xlsx`, `*.xls`, images, and the whole `weekly job costs/` folder. The sole
   exception is `samples/*.sample.csv`, which is synthetic. Real job names are
   company data too: fabricate them in tests and comments. If a real export ever needs to be inspected, read it from wherever
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
  App.jsx                      shell: header, hash route, error boundary (§15)
  styles/theme.css             ALL styling — design tokens + component classes
  core/                        framework-free logic, no JSX, node-importable
    csv.js                     RFC 4180 CSV reader (hand-rolled, dependency-free)
    idb.js                     IndexedDB wrapper (dependency-free)
    parse.js                   schema-driven ingest: coercion, column mapping
    aggregate.js               groupBy / rollup / cumulativeSeries / topNWithOther
    routing.js                 hash-route parsing — the WHOLE hash (§15)
    appData.js                 the app-wide data context + useAppData (§15)
    store.js                   useDataset: one import per key, IndexedDB;
                               dropRetiredRecords for the retired sections
    library.js                 useLibrary — multi-source persistence (see §13)
    persisted.js               usePersistedState — one small saved preference,
                               with read-forward migration from older keys
    myProjects.js              useMyProjects — the APP-WIDE starred job list (§14)
    palette.js                 the 8 validated categorical series colors + colorMapFor
    format.js                  fmt / pct / compact / money / perSf / dates
    hooks.js                   useSize (ResizeObserver)
  app/                         the shell layer: may import from core/ AND modules/
    AppData.jsx                assembles every dataset onto one context (§15)
    sources.js                 describeSources / sourceSummary / VERBS — pure ESM
  components/                  shared, module-agnostic UI
    ui.jsx                     Badge, MiniBar, StatCard, Panel, sorting
    Page.jsx                   PageHeader, RouteTabs, NeedsSource (§15)
    AppHeader.jsx              the shell header: nav, scope switch, data chip
    SourceStrip.jsx            one row layout and three verbs for every file
    FileImport.jsx             ImportPrompt (empty state) + ImportButton
    Filters.jsx                FilterBar — date window + dimension selects
    MyProjects.jsx             the star, the All / My Projects switch (§14)
    IngestSummary.jsx          rows kept out of rows offered, per import (§4)
    ScopeNotice.jsx            states what is narrowing a pool (§14)
    charts/
      LineChart.jsx            multi-series time lines, crosshair, table view
      BarChart.jsx             ranked horizontal bars
      scale.js                 niceTicks / sampleTicks / linear
  modules/
    sections.js                THE section list — plain ESM, node-importable
    registry.js                the same list with each Component attached
    home/                      the front door: what this is, what is loaded (§15)
    sources/                   every file, one vocabulary, one page (§15)
    job/                       ONE JOB across every source (§15)
      assemble.js              the gather — pure ESM, node-importable
    projects/                  the unified job list
      rows.js                  the cost + time merge, pure ESM
    job-cost/                  weekly job cost by plant (see §13)
      parse.js                 the report walker — pure ESM, node-importable
      importFile.js            File -> source; owns the lazy SheetJS import
      schema.js                field catalog for the detail view (NOT a
                               core/parse.js schema — this export isn't flat)
      categories.js            cost-code prefix -> category
      plants.js                the known cost plants (filename rescue)
      squarefeet.js            job square footage and every $/SF rate
      engineering.js           the D&E roll-up: budget, hours, design progress
      reportGroups.js          one job as section -> category -> line (Job Report)
      jobMetrics.js            deriveJob — the fields every view expects
      useJobCost.js            derived data + filter state
    employee-time/             timesheet analysis, routed at #/time (§12)
scripts/
  make-sample.mjs              generates the synthetic employee-time CSV
  find-export.mjs              locates a real export by its content (§7)
  smoke-test.mjs               employee-time + core data layer + ROUTING,
                               the project merge and the job gather (§15)
  job-cost-test.mjs            job cost parse, reconciliation, $/SF, D&E
  job-cost-sample.mjs          synthetic job cost workbooks, built in memory
  storage-test.mjs             IndexedDB persistence (fake-indexeddb),
                               including the retired-record cleanup
  render-test.jsx              server-renders every view against the samples
  deploy-pages.sh              manual gh-pages deploy (see §8)
  pages-deploy.workflow.yml    the Actions workflow, parked until scope (see §8)
samples/*.sample.csv               synthetic, safe to commit
legacy/eng_time_dashboard.html     the original single-file tool; reference only
docs/interface-proposal.md         the IA rework this structure came from
docs/cost-and-time-focus.md        the retirement of Production and Drawings
```

### The layering rule

`core/` never imports from `components/`, `app/` or `modules/`. `components/`
never imports from `modules/`. A module may import from `core/` and
`components/`. `app/` is the shell layer and is the **only** place allowed to
import from modules — it is where the datasets are assembled, because that job
inherently crosses every module (§15). Anything a second module would want
belongs in `core/` or `components/`, not copied.

The one thing that would be a cycle is avoided deliberately: the data *context*
lives in `core/appData.js` and the *provider* in `app/AppData.jsx`, so a module
importing `useAppData` never imports from `app/`.

`core/` files are plain ESM with no JSX and no React — except the four that are
hooks by nature: `store.js`, `library.js`, `persisted.js` and `hooks.js`. That is
what lets the test scripts import the rest directly in node with no build step.

The same rule applies **inside** a module: anything a test needs to reach lives in
a `.js` file, never a `.jsx` one, because plain node cannot load JSX. That is why
`job-cost/` keeps its parser, roll-ups and metrics as plain ESM and only its views
as `.jsx`.

---

## 3. How a section works

A section owns its filters and its views. `src/modules/sections.js` declares it;
`src/modules/registry.js` attaches its component. It does **not** own its data —
the datasets are app-wide (§15).

```
modules/<id>/
  index.jsx          entry component — takes { tab, params, route }, renders views
  use<X>Filters.js   filter state and the derived filtered rows
  views/*.jsx        one file per tab or drill-down screen
  *.js               any pure helper the views share (job-cost has
                     squarefeet.js and engineering.js; projects has rows.js;
                     job has assemble.js).
                     Keep these as plain ESM — the test scripts import them
                     directly in node, which cannot load .jsx.
```

A section is handed its `tab` by the router and must not hold tab state of its
own. Tabs are links (`components/Page.jsx` → `RouteTabs`), so every one is an
address (§15).

### Adding a section

1. Add an entry to `src/modules/sections.js`: `id`, `label`, `blurb`, `needs`
   (which sources it is useless without), and its `tabs`. **No JSX in that
   file** — it is imported by the test scripts in node.
2. Add the component to the `COMPONENTS` map in `registry.js`.
3. Write `index.jsx` taking `{ tab }`, reading data with `useAppData()`, and
   rendering `<PageHeader>` + `<RouteTabs>` + views. Show `<NeedsSource>` rather
   than an empty dashboard when its file is not loaded.
4. Add a task entry to `modules/home/index.jsx` if it is something a person
   would come to the app to do.
5. Add render cases to `scripts/render-test.jsx` — including the empty state,
   using the `withApp(..., appEmpty)` fixture.

### Adding a new export

A new file is a new **source**, not necessarily a new section:

1. Parse it. A flat table goes through `core/parse.js` with a schema; anything
   with merged cells, a header block or one sheet per entity needs its own
   walker (§4, §13).
2. Add the record to `src/app/AppData.jsx` and a descriptor to
   `src/app/sources.js`. The descriptor is what makes it appear on Home, on the
   Sources page and in the header chip — including any `warn` sentence, which is
   how a warning reaches the whole app instead of one tab.
3. Add its import controls to `modules/sources/index.jsx`.
4. Decide which section reads it. Two reports that answer different questions
   get two sections, as the schedule and the ticket report did before they
   were retired (§11).

### Adding a tab or measure to a section that already exists

Most work is this. The shape that has held up:

1. **Look at the real export before designing.** Profile it in a throwaway
   script; do not reason from the schema. Every measure in §13 that turned out
   wrong on the first attempt was wrong because it was inferred rather than
   checked, and every one was caught by printing actual cells.
2. **Put the arithmetic in a plain `.js` file in the section** —
   `engineering.js`, `squarefeet.js`, `projects/rows.js` and
   `job/assemble.js` are the models. It must be importable by node so the
   arithmetic can be tested without a browser or a build.
3. **Add the tab to `sections.js`** and render it in the section's `index.jsx`.
   Filters are shared; a tab that needs its own control owns it (the Cumulative
   view on Time owns its split picker).
4. **Test the arithmetic, not the markup.** Assert that breakdowns sum back to
   the same total, that no figure is `NaN`/`Infinity`, and that a rate divides
   by what you think it does — see the `$/SF` invariant in §13, which is the
   single most valuable test in the suite.
5. **Add render cases** to `scripts/render-test.jsx`, including the empty,
   single-row and degenerate (zero contract, no quantities) states.
6. **Say what is derived.** If a figure is not a column in the export, label it
   as derived in the UI. `Est OH & Profit` is stated; `variance to budget` is
   not, and the difference matters to whoever reads it.

## 4. Data ingest

`core/parse.js` → `parseFile(file, schema)` → `{ rows, meta }`.

- **Every sheet whose columns satisfy the schema is read, not just the first.**
  `parseFile` used to take `SheetNames[0]` and mention the rest in a note behind
  a collapsed disclosure, so a workbook paginated across sheets silently lost
  everything after the first — and the totals still looked plausible, which is
  what makes that shape of bug expensive. Sheets are chosen by *content*: a
  second page carries the same header row, a "Parameters" or "Notes" tab does
  not and is **named in a warning** rather than read as data. Every skipped
  sheet is stated; silence is what let this hide.
- **The import states what it took in**, via `components/IngestSummary.jsx` on
  Time: rows kept out of rows offered, from how many sheets. It
  is a quiet hint when everything was read and an amber notice when it was not
  — "did it count all of it?" must be answerable from the page, not only from a
  test script. `meta` carries `recordsRead`, `dropped`, `sheetsRead` and
  `sheetsSkipped` for it. An older saved import has none of those and the
  component renders **nothing**, rather than claiming a completeness it cannot
  show.
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

`useDataset(key)` keeps the last import in **IndexedDB** under
`cv.analysis.<key>.v1`, via the dependency-free wrapper in `core/idb.js`. The
keys are unchanged from when each module owned its own record
(`employee-time` and the job cost library), but both are now created once in
`src/app/AppData.jsx` and read from the context (§15).

The retired sections' records (`production`, `production-tickets`,
`production-baseline`) are deleted on startup by `dropRetiredRecords`, so a
browser that once held a schedule does not carry it forever. `test:storage`
asserts that exactly those three go and nothing else does.

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
npm test                # all four suites; the deploy script gates on this
npm run test:data       # core/ logic in plain node — fast, no build
npm run test:jobcost    # job cost parse + reconciliation (see §13)
npm run test:storage    # IndexedDB persistence, against fake-indexeddb
npm run test:render     # server-renders every view against the sample data
```

`test:data` runs against the **real** `EmpTimeExport.xls` when it is present:
it asserts the schema absorbs every header with none left unmapped, that the job
number parses on essentially every row (the join depends on it), that dashed
admin numbers survive intact, and that `Location` still tracks the person rather
than the job.

It finds that export **by its columns, not by its name** — see
`scripts/find-export.mjs`, which every suite now uses. A re-download landing as
`EmpTimeExport (1).xls` used to skip the entire real-data block —
reconciliation included — while the suite still reported all green. A check
that vanishes when the file is re-downloaded is worse than no check, because
nothing announces that it went away.

`findExport({ hint, identify })` ranks the workbooks in the directory (newest
first, name hints promoted) and then **opens them until one is identified by
content**. `headerSignature` is the identifier: the columns that make an export
*that* export: `Effective Date` + `Deptment` is the timesheet. (The retired
schedule and ticket exports had signatures of their own; the job cost reports
are found by folder, not by signature.) A schema's required set is not enough on its own, because
`core/parse.js` falls back to substring containment and two exports both
carrying a date and a job name can satisfy each other's schema. Every run
prints the file it used and says whether the name or the content found it.
When there were three flat exports, all three resolved correctly when renamed
to `aaa.xls`, `bbb.xlsx` and `zz-random-name.xls` in one directory; that was
the test of it.

It also **reconciles the hours**, the same way the job cost walker reconciles
its totals: the sheet's own `Hours` column must sum to the parsed
total, *and* to the same figure person by person, with every person surviving
ingest. That is the check that answers "is Time under-counting somebody?"
mechanically — every per-person figure in the section is `groupBy(name)` +
`sumBy(hrs)` over these rows, so if the sums agree, a short number on screen is
a filter or the My Projects scope rather than ingest. Counting rows and
asserting no `NaN`, which is all this did before, cannot tell a dropped row from
an absent one. Note the two claims are separate: `isEmptyRow` drops zero-hour
rows, which conserve a sum by definition. The counts it prints — rows, people, job numbers, hours, the
admin share — move between pulls and are printed rather than asserted.

`test:jobcost` runs against the real `weekly job costs/` folder when it is present. It also
**prints** the headline figures §13 quotes — job counts, hours, blended rates,
lump-sum line counts, the hours-agreement share and the `$/SF` rates — so a
session can see at a glance whether the documented numbers have drifted from the
current reports. Those are printed rather than asserted on purpose: the exports
are refreshed weekly and the counts legitimately move.

Its central assertion is **reconciliation**: for every job, the parsed cost lines
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

It also covers the timesheet job number — `splitJob`, including the `00-*`
admin cases the whitespace rule protects (§12) — and the shell (§15), which is
why `modules/sections.js` is plain ESM:

- **Routing**: a stale bookmark falls back to something real rather than a
  blank page; the job page's id precedes its tab (`#/job/43134/cost`); segments
  a section takes for itself survive encoding; every section's bare route
  resolves to its own first tab; `#/production` and `#/drawings` alias to Home.
- **The project merge**: one row per job number, a cost-only and a
  time-only job both present, and **a rate with no denominator is `null`,
  never `0`**.
- **The job gather** — each source found separately, and the timesheet join an
  equality match on the derived job number (`1000` must not match `100`).
- **The Job Report route** keeps its job number and a plant name with spaces
  intact.

`test:storage` runs the real IndexedDB code path against `fake-indexeddb` and
asserts that a dataset far larger than the localStorage cap saves and reloads
intact. Keep the oversized case — it is the regression guard for the bug that
motivated the switch. It also asserts that `dropRetiredRecords` removes the
three retired records and leaves the timesheet, the cost library and the
starred list alone.

`test:render` mounts every view — plus empty, single-row and unknown-key
datasets — and asserts the chart actually emitted geometry. It catches broken
imports and crashes, **not** visual regressions.

**No suite looks at the page.** There is no browser automation in this
environment — the Claude-in-Chrome extension is not set up, so nothing here can
screenshot or click the UI. When a change affects layout, spacing, color or
interaction, **say plainly that it was not visually verified** and ask the user
to look at `npm run dev`. Do not imply otherwise.

The render suite has still caught real browser bugs: it once found the (now
retired) production calendar being passed `month === null` on first render,
which threw in Chrome too. Treat a render failure as a real defect until
proven otherwise.

Where new tests go: `core/` logic, routing, the project merge or the job gather
→ `smoke-test.mjs`; job cost parsing, cost-code classification or the
known-plant list → `job-cost-test.mjs`; storage rules → `storage-test.mjs`; a new view → a case in
`render-test.jsx`, including its empty and single-row states. A section that
reads `useAppData` gets its case wrapped in the `withApp(...)` fixture there,
with a second case against `appEmpty` — "no file loaded" is a state each of
those pages is supposed to *explain*, so rendering blank is a failure. The harnesses are
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
first, and publishes into a throwaway worktree.

**If the deploy appears to stall, it is the push waiting on a credential
prompt** with no terminal to show it — seen 2026-08-31, hung for ten minutes and
had to be killed. Run it with `GIT_TERMINAL_PROMPT=0` so it fails fast and says
so instead of hanging. Also note `timeout` is **not** on macOS (it is `gtimeout`,
from coreutils); wrapping the deploy in it silently runs nothing and still exits
0, which looks exactly like a successful deploy until you check the bundle hash.
Which is the other reason to check the bundle hash. **The `gh-pages` branch holds
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
- Money, rates and areas go through `core/format.js` — `money`, `moneyCompact`,
  `ratio`, `perSf`, `sqft` — never a raw `toFixed` in a component. Note `ratio`
  formats a stored ratio (`0.7752` → `"77.5%"`) while `pct` divides a part by a
  total; using the wrong one is off by a factor of the total.
- **Detail views are exhaustive by design.** List **every** field whether or
  not it has a value, so "blank for this record" is visibly distinct from "not
  in this report". Where a stored value is derived, show its source text too,
  so no derivation hides the original. Render `row.extra` after the named
  fields, and give the panel a "show fields that are empty" toggle defaulting
  to **on**, because completeness is the point. (Written for the retired
  piece detail; `JobDetail` and the Time drill-downs follow it.)
- Dates are ISO `YYYY-MM-DD` strings everywhere in the data layer. They sort
  lexicographically, which is why filters and grouping compare them directly.
  Use `isoToDate` when a real `Date` is needed — it parses to **local** midnight,
  because `new Date('2026-03-14')` is UTC and shifts the day in western zones.

---

## 10. Open questions / next steps

Split by what blocks them: the first group needs an answer from someone at the
company, the second can be picked up now.

### Needs an answer from the business

- [ ] **Are `Est Qty` / `Act Qty` on the 60.x codes hours?** The report never
      says so. The inference is strong in aggregate — the implied rate is
      quantized to $51.84 drafting / $68.59 engineering, and the values are
      fractional — but it holds on only 56% of lines individually. Confirm with
      whoever owns the report. If it is not hours, only the hours section of the
      D&E tab needs relabelling; no cost figure depends on it (§13).
- [ ] **Monroeville reports no quantity rows at all** — no pieces, no square
      feet, across all 15 jobs. Every other plant has them. A setting, or does
      that plant genuinely not track them? Until answered, its $/SF and design
      columns show "—" rather than a misleading zero.
- [ ] What are the `-IN` companion jobs (`42343-IN`, `44050-IN`)? 11 of 126,
      never scheduled, titles suffixed `(EX)` — erection contracts, most likely.
      Kept as distinct jobs; if they should roll into their base job that is a
      change to the join in §13.
- [ ] Does the employee time export carry a pay-rate or cost column? The
      profiled export does **not** — 11 columns, no money (§12). Decide first
      whether pay data should sit in a browser cache at all. Note the job cost
      reports already carry labor dollars per code (30.x, 40.x), so the cheaper
      question may be whether timesheet hours can tie to those.
- [ ] **What are the `Location` codes `MDS`, `Oxf`, `Win`, `ARK`, `Atl`?** They
      are offices, not plants (§12) — `Kis`/`Hil`/`Ash`/`Mon`/`Jac`/`Pea` line
      up with plant names but these five do not. Shown verbatim until someone
      says what they are. **Do not guess them into `plants.js`.**
- [ ] **Why is `Emp Number` blank on 46.7% of rows**, covering only 64 of 110
      people? A field filled for some employment types and not others, or an
      export setting? The name is the person key either way (§12).
- [ ] **Should `00-*` admin jobs appear in the Projects list?** They are real
      job numbers carrying 19.2% of all hours, so they are listed like any
      other time-only job. If they should be folded into an "overhead" bucket
      instead, that is a change to `projects/rows.js`.
- [ ] **Can D&E cost be read against booked hours per job?** The job page now
      shows both — 60.x cost from the cost report, hours from the timesheet —
      side by side and deliberately unsummed. Whether they *should* reconcile
      (is 49-8300 the same work as 60.x?) is a question for whoever owns both
      reports. `costPerHour` is computed in `projects/rows.js` and shown
      nowhere until that is answered.

### Could be built now

- [ ] **Weekly trend for job cost.** Each report is a snapshot with no date
      axis; `Current Mo Act` is the only period figure and it is month-to-date.
      Keeping successive imports would give real burn curves — the library
      already stores one entry per plant, so it needs a second key
      (plant + as-of) and a chart over the series. Only worth it if someone
      wants the trend.
- [ ] **CSV / PNG export from the dashboard.** Most useful on the job cost
      tabs; a filtered cost-code table is the thing most likely to be wanted in
      a spreadsheet.
- [x] **Section names, navigation, routing and the front door** — reworked
      2026-08-31 (§15). `docs/interface-proposal.md` has the diagnosis and the
      mapping of every old surface to its new home.
- [x] **Employee Time ↔ everything join** — the export was profiled 2026-08-31
      and carries the job number in `"<no> - <title>"`, parsing on 100.0% of
      rows. Time now joins on the job number like every other source and takes
      part in My Projects (§12, §14).
- [ ] **Cost vs Hours.** The natural successor to the retired Cost vs
      Schedule tab: 60.x D&E cost against timesheet hours, per job. Deferred
      until the D&E question above is answered, because building it first
      would imply the two reconcile (`docs/cost-and-time-focus.md`).
- [ ] **Merging exports that cover different date spans.** Loading a second one
      currently replaces the dataset. Merging needs a dedupe key — probably
      date + person + job + task. IndexedDB has the headroom.
- [ ] Per-person weekly-hours view (over/under 40), once real data confirms how
      overtime is represented.
- [ ] Large datasets are held in memory and re-aggregated on every filter
      change. If that gets sluggish the fix is indexing or a web worker, not a
      smaller dataset — **measure before optimizing**.

### Settled, kept for the reasoning

The production and ticket questions (shop status, drafting groups, blank
`Drawn By`, stale bed dates, a stable piece id, the `(RL)` suffix, plan vs
actual) closed with the retirement on 2026-09-25 rather than with an answer.
They are in `CLAUDE.md` at commit `ca57d86` if either section ever returns.

- [x] Column names in the **job cost** export — profiled 2026-08-26 (§13).
- [x] Cross-module join: on job **number**, never name (§13). It was
      cost↔production first; it is cost↔time now.
- [x] What `$/SF` should divide by — the job square footage, never area cast to
      date (§13). Getting this wrong produces a rate that cannot be compared to
      a budget.

---

## 11. Production and Drawings (retired 2026-09-25)

**Retired.** The pour schedule and the missing-ticket queue are now covered by
other tools, so the app no longer reads the Scheduled Production Report or the
Missing Piece Mark Ticket report. The plan, the list of everything removed and
the decisions behind it are in `docs/cost-and-time-focus.md`.

This section is kept as a tombstone so that every "§12", "§13" and "§15"
reference elsewhere still points where it says. To recover the code or the
full write-up (the export profile, the board, the ticket walker and its
reconciliation, the schedule-movement alignment), check out commit `ca57d86`,
tagged `pre-cost-time-focus`.

What survives from it, and where:

- **The whitespace rule in `splitJob`** was found here first, when `00-006` and
  `00-009` collapsed onto one key. It lives in `employee-time/schema.js` now,
  and its test moved to the timesheet in both `test:data` and `test:jobcost`.
- **The "measure it in rows, not endpoints" lesson** from the ticket coverage
  trap applies to any two exports compared by date: two stale rows can make
  reports that share nothing look like they overlap.
- **Old addresses.** `#/production` and `#/drawings` alias to Home, and
  `dropRetiredRecords` clears the three stored records on startup (§4).

---

## 12. Time section (`modules/employee-time/`, routed at `#/time`)

The first module, and the one the legacy single-file dashboard
(`legacy/eng_time_dashboard.html`) was rewritten from. The folder keeps its
original name; the section is `time`.

**Profiled against the real `EmpTimeExport.xls` on 2026-08-31**, which closed
the last guessed schema in the app. The headline: the inferred schema was
*right* — every required column mapped on the first try — and the export turned
out to carry the job number, which is what turned the timesheet join from a
labelled guess into a real one. With Production and Drawings retired (§11) it
is one of the app's two sources.

### The export

One sheet, a flat table, 11 columns, 29,267 rows covering 2026-01-01 →
2026-08-31 (218 days, 110 people, 266 job numbers, 124,035 hours). Genuine BIFF
`.xls`, not HTML-in-disguise.

| Column | Field | Notes |
|---|---|---|
| Effective Date | `date` | Excel serial |
| First Name / Last Name | `firstName` `lastName` | → `name`, the person key |
| Emp Number | `empNo` | **blank on 46.7% of rows**, covering only 64 of the 110 people. Mapped and shown; never the person key |
| Location | `loc` | 12 codes — `Kis`, `Hil`, `MDS`, `Ash`, `Oxf`, `Mon`, `Jac`, `Win`, `ARK`, `Pea`, `Atl`, `Corp`. **The person's office, not the job's plant** — see below |
| Job Name | `job` | `"NNNNN - TITLE"`; → `jobNo` + `jobTitle` |
| GL Code | `gl` | 13 values, `"49-8300 - Architectural Drafting/Eng"` |
| Labor Task | `task` | 41 values |
| Deptment | `dept` | 9 values. 92.8% of rows are `ENG - Engineering` |
| Hours | `hrs` | 0.05 – 18.5. **No zeros and no negatives in the real export** |
| Summary | `note` | free text the person typed, filled on 31% of rows |

**`Deptment` is Concrete Vision's own misspelling** and is the canonical label in
the schema, with correct spellings as aliases. Do not "fix" it.

`isEmptyRow` drops a row with no date, no name, or zero hours. The real export
contains no zero-hour rows, so nothing is actually dropped, and a zero here
would carry no information anyway.

### The job number, and why this export joins

**Hours are reconciled against the sheet, per person, on every test run** —
see §7. As of 2026-09-01 the parse loses nothing: 29,510 rows in, 29,510 out,
124,692 hours, 110 people, none short. Spot-checked end to end against a figure
the owner supplied: one person's August 2026 total is 168.00 across 21 weekday
rows at 8h, and the filter-plus-grouping path reproduces it exactly. So a report that "Time isn't counting
all of somebody's hours" is not an ingest bug until that check fails; look at
the My Projects scope in the header, the date/location/department filters, and
the entry count in the page subtitle first.

**`Job Name` parses to a job number on 100.0% of rows** (29,262 of 29,267; the 5
that fail carry a title with no number at all, and keep `jobNo: ""`). `splitJob`
in `schema.js` was copied deliberately from the retired production schema,
including **the requirement that the separator be surrounded by whitespace**.

That rule is not cosmetic here. **19.2% of all hours sit on `00-*` admin jobs**
(`00-001 - Corporate Admin Job` … `00-008`), and an unspaced match would cut
`00-001` in half and collapse every one of them onto a single `00` key. The bug
was fixed once in the retired production schema, and would have been far more
expensive in this export. There is a test for it.

How far the join reaches, against the reports loaded on 2026-08-31: **86 of
the 266 timesheet job numbers (32.3%) are also in the cost reports.** The rest
are expected: the cost reports cover **active** jobs only, and 19.2% of hours
sit on `00-*` admin jobs that no cost report carries.

The profile's hours-coverage figures (73.7% of all hours, 89.8% of project
hours, on a job some other source knew) counted the schedule as well as cost,
so they overstate the cost-only join. Re-measure before quoting a cost-only
share.

### `Location` is an office, not a plant

The most important negative result from the profile, and the one most likely to
be "fixed" wrongly later.

- **0 of 110 people appear at more than one Location.**
- **82 of 267 jobs are charged from more than one.**

So it tracks the *person*, not the job. Cross-tabulating it against the plant a
job is actually costed at gives a diffuse mess — `Kis` against Kissimmee (22
jobs) but also Hillsboro (10), Monroeville (8), Jacksonville (3). That is what
you would expect of a company whose engineers draft other plants' jobs, and
92.8% of these rows are engineering.

**Do not map `Location` to `job-cost/plants.js`, and do not alias it to
"plant".** `MDS`, `Oxf`, `Win`, `ARK`, `Atl` and `Corp` have no plant at all.
There is a test asserting the person/job asymmetry, so if it ever flips someone
will be told rather than left to assume.

### The person key is the name, not `Emp Number`

`Emp Number` is blank on 46.7% of rows and covers 64 of the 110 people, so
grouping on it would silently drop half of everyone's hours into an unknown
bucket. Profiled: no employee number carries two names, but one name carries two
numbers. The name stays the key; the number is mapped and shown.

### Views (`modules/employee-time/views/`)

| File | Tab | What it shows |
|---|---|---|
| `Overview.jsx` | Overview | Stat tiles, cumulative burn for the whole selection, top projects ranked. |
| `People.jsx` | People | Sortable, searchable roster — hours, share of total, project count, days charged. |
| `Projects.jsx` | Projects | Same for jobs — hours, headcount, first/last charge. |
| `Cumulative.jsx` | Cumulative | The plotting view. Narrow to a person and/or project, then split into series by project, person, labor task, location, department or GL code; cumulative or per-day. |
| `PersonDetail.jsx` | drill-down | One person: cumulative hours per project, plus their project table. Routed at `#/time/person/<name>`. |
| `ProjectDetail.jsx` | drill-down | One job: total burn, cumulative by person, hours by task, team table. Routed at `#/time/job/<name>`. |

The **Projects** tab is labelled **Jobs**, for one word per concept across the
app (§15). Each row carries the job number as well as the name, and a `Job →`
button out to the whole project across every source.

**This section takes part in the My Projects scope**, keyed on the job number
like every other section (§14). It was excluded until the export was profiled,
because scoping on a name match would have hidden rows rather than narrowed
them; that reason is gone.

`useTimeFilters.js` holds the shared date-window / location / department filter
state.

### Decisions worth keeping

- **The Cumulative view is a small pivot, not six hard-coded charts.** Adding a
  new way to slice hours means adding one entry to its `SPLITS` array.
- Series are capped at the eight validated palette slots via `topNWithOther`;
  the ninth and beyond fold into a grey "Other" with a note saying so (§5).
- `cumulativeSeries` takes a shared date `domain` so every series spans the same
  x range and carries flat across idle days — without it, lines jump
  horizontally past each other and read as though work stopped.

---

## 13. Cost section (`modules/job-cost/`, routed at `#/cost`)

Built from four real exports profiled 2026-08-26: `<Plant> Job Cost Report -
Active Jobs.xlsx`, one per plant, in the gitignored `weekly job costs/` folder.

> **Every number quoted in this section is from that snapshot.** The reports are
> refreshed weekly, so the counts move. `npm run test:jobcost` prints the current
> figures — jobs, hours, rates, lump-sum line counts, the hours-agreement share
> and the `$/SF` rates — against whatever is in the folder now. If they have
> drifted far from what is written here, update this section rather than trusting
> it. The *reasoning* below does not go stale; the arithmetic does.

**These come from a different system than Concrete Vision.** Same company, same
jobs, different reporting tool — which is why nothing here reuses a Concrete
Vision schema and why the join to the timesheet is explicit rather than
assumed.

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

**This is the one source that is several files at once.** `useDataset` holds a single
import and replaces it on upload. Here the reports arrive one per plant, each
refreshed on its own schedule, so replacing would discard three plants to update
a fourth. `core/library.js` (`useLibrary`) keeps **one entry per source, keyed
by plant**; re-importing a plant overwrites just that entry.

- The plant comes from the **filename** — the worksheets carry no plant field.
  This is the one place in the app where a filename carries meaning, and the
  plant is also the library key, so a misread does not merely mislabel a
  source: it files the report under a plant nobody has instead of replacing the
  one it should. `plantFromFileName` therefore tries three readings in order —
  the documented `"<Plant> Job Cost Report - Active Jobs.xlsx"` shape, then any
  plant already in `plants.js` appearing anywhere in the name (which rescues
  `"Copy of ashland city (1).xlsx"`), then the cleaned filename. `(1)` and
  `copy` suffixes are stripped first. It never returns `""` — an empty key
  would collide with every other unnamed source and silently overwrite it.
- The whole library is one IndexedDB value, so an import is atomic.
- It is created in `app/AppData.jsx` like every other record, because Projects
  and the job page read it too (§15). It is still `useLibrary`, still one entry
  per plant — don't "simplify" it back to `useDataset`.
- `store.js` was generalised into `readRecord`/`writeRecord` so both hooks share
  one storage path with one fallback story. Don't fork it again.
- Because plants refresh independently, **the library routinely holds more than
  one cut-off date**. The strip badges any plant older than the newest and the
  UI says so above the totals. Do not remove that: a company-wide number mixing
  a 7/31 plant with 8/26 plants is wrong in a way nobody would notice.

### The join, now to the timesheet

Job **number**, not job name. The two systems write the name differently
(`"43134 - 1401 CHURCH STREET"` vs `"43134   1401 CHURCH STREET MOTLEY T1"`) but
agree on the number. The join was built against the production schedule and
went with it on 2026-09-25 (§11); the timesheet joins on the same key (§12).

- **The two datasets answer different questions.** Cost is dollars booked to
  codes, cumulative **to date**; the timesheet is hours booked by people over
  whatever window it was run for. The job page and Projects show them side by
  side and say so; they are never summed.
- **`plants.js` is now just the list of cost plants**, read by
  `plantFromFileName`. The Concrete Vision plant aliasing it used to hold
  (Hillsboro vs Hillsboro Structural; Jacksonville and Pearland with no cost
  report) existed only for the schedule join. The timesheet's `Location` is an
  office, not a plant, and must never be mapped through it (§12).
- Fixing the original join turned up a real bug: `splitJob` matched its
  separator without requiring surrounding spaces, so `00-006` and `00-009` both
  became job number `"00"`, two distinct admin jobs collapsed onto one key. The
  regex requires whitespace around the dash, and the rule lives on in the
  timesheet's `splitJob`. Tested.

### Views (`modules/job-cost/views/`)

| File | Tab | What it shows |
|---|---|---|
| `SourceLibrary.jsx` | (import) | The workbook drop target. Accepts several files at once; each overwrites just its own plant. The *listing* of what is loaded is the shared strip now (§15). |
| `Portfolio.jsx` | **Portfolio** | Stat tiles, margin-at-completion bands, jobs under 10% margin, cost by section and category, per-plant table. |
| `CostCodes.jsx` | **Cost Codes** | Cross-job rollup by code. The analysis the source system can't give them, because its reports are per-job. |
| `Engineering.jsx` | **Drafting & Engineering** | The role dashboard — see below. |
| `JobReport.jsx` | **Job Report** | Pick any costed job and read its full report without leaving Cost. `#/cost/report/<jobNo>/<plant>`; with no job it is the job list. Any job clicked elsewhere in Cost opens here. A job number costed at two plants gets a plant switch, never a sum. |
| `JobDetail.jsx` | (Job Report, and the job page's Full Cost Report tab) | The whole report for one job. Its cost grid is grouped **section → category → line** by `reportGroups.js`, collapsible at each level, and sits directly under the headline figures. |

The **Jobs** table left this section for `projects` (§15), where it is one row
per job number with booked hours beside it. **Cost vs Schedule**
(`ProductionLink.jsx`) was retired with Production on 2026-09-25 (§11).

`JobDetail` follows the exhaustive-detail rule (§9): every field is listed whether or not it has a
value, subtotals are **recomputed from the lines on screen** rather than read
from the sheet, and the "show fields that are empty" toggle defaults to **on**.

### The Job Report grouping

Added 2026-09-26 at the owner's request: the full report should be reachable
from Cost and readable a section at a time. The report prints four sections and
one subtotal each, which is too coarse (Production alone mixes materials and
labor), so `reportGroups.js` splits each section one level further:

- **D&E by discipline** (Drafting / Engineering / Checking / Outsourced), the
  same `disciplineOf` the D&E tab uses. Outsourced lines are lump sums, not
  hours (§13 below), which is the reason they must not sit mixed in with
  in-house labor.
- **Every other section by category**, from the code prefix in
  `categories.js` (Materials / Production Labor, Delivery & Erection / Field
  Labor, Hauling / Work Orders / Budget).

The grid opens with every section showing its categories and every category
folded, so a job reads as a dozen subtotals first; **Expand all lines** shows it
the way the report prints it. Every section, category and job total row carries
variance and % of Proj, recomputed from the lines under it. `test:jobcost`
asserts, over every synthetic job and every real one when present, that each
line lands in exactly one category, categories sum to their section, and
sections sum to the report's own Job Totals.

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

### My Projects

The starred-projects selection is **app-wide** and lives in `core/`, not here —
see §14. This section applies it via `useJobCostFilters(data, mine)`, which
narrows the job pool itself rather than each view applying it. The *switch* is
in the shell header (§15).

### Cost per square foot

**The number the business is judged on.** Derived once in `squarefeet.js` and
attached to every job by `jobMetrics.deriveJob`, so no view recomputes it.

Footage comes from the PROD quantity rows whose product name ends `(SQ FT)`,
summed across product types. The matching `(PCS)` rows are piece counts and must
never be added in — there is a test for exactly that.

**Every rate divides by the same denominator — the job square footage**
(`sf.job`, the forecast area, falling back to the estimate). Not the area cast
so far. That is the whole point: budget, forecast and actual are then directly
comparable, and actual rises toward forecast as the job completes.

| Rate | | Portfolio total |
|---|---|---|
| Contract / SF | Net Contract ÷ job SF | $78.57 |
| Budget / SF | Est Cost ÷ job SF | $54.62 |
| Forecast / SF | Projections ÷ job SF | $58.48 |
| Actual / SF | Act Cost ÷ job SF | $39.41 |
| Margin / SF | Est. OH & Profit ÷ job SF | $20.09 |

**Don't divide by area produced to date.** An earlier cut paired each rate with
its own stage's footage — actual cost over as-built area — which sounds
principled and is wrong for this purpose: it produces a number that starts
enormous, falls as production catches up, and cannot be read against a budget
rate at all. The invariant to hold onto, and there is a test for it:

> actual /SF ÷ forecast /SF **must equal** cost progress.

That only holds when both divide by the same area. If it drifts, a rate is
dividing by something else.

`asBid` is the one deliberate exception — Est Cost over the area *estimated at
bid time*, kept because it answers a different question. Where a job's scope has
moved it differs from `budget`, and the job detail page says so rather than
smoothing it away. Across the portfolio the scope grew from 5.20M to 6.76M SF,
which is why as-bid is $71.03/SF against a budget rate of $54.62.

Area cast to date is kept as **`sfComplete`**, a progress figure, deliberately
out of any cost denominator.

**Coverage is partial, and that stays visible.** 82 of 126 jobs carry footage;
**Monroeville carries none at all** (0 of 15). A job without it gets `hasSf:
false` and **null** rates — never `0`. `perSf()` returns null rather than zero
precisely so a missing rate renders as a dash and can't be mistaken for a job
that costs nothing per foot. Aggregates divide only over the jobs that report
footage, so the rate is not diluted by the ones that don't, and the UI states
how many jobs a rate is based on.

### The Drafting & Engineering tab

A role dashboard over the D&E section (60.x) plus the D&E quantity rows, which
track *pieces designed*. `engineering.js` holds all of it as plain ESM so the
tests can import it in node.

**The tab leads with budget, cost and variance** — figures the report states
outright — and puts hours below them, because hours are an inference.

The report carries **two budgets**, and only computes variance against one:

| Column | Meaning | D&E total |
|---|---|---|
| `Est Cost` (D) | the original estimate | $25.88M |
| `Projections Total` (E) | the current forecast | $30.81M |
| `Act Cost` (I) | booked to date | $20.70M |
| `Variance` (K) | **Projections − Actual**, the report's own | $10.11M |
| — | Est Cost − Actual, **derived here** | $5.18M |

They disagree on **86% of D&E lines** (157 revised up, 98 down), so the choice
is not cosmetic: D&E is forecast $4.93M *above* its original estimate, which the
forecast column alone hides. Both are shown, and the derived one is labelled
derived everywhere it appears — never let it pass as a figure the report states.

**Hours take care, and are deliberately secondary.** On in-house
labor codes the report's Est/Act **Qty** columns are hours — the implied
cost-per-unit is quantized to standard rates ($52 drafting, $69 engineering,
$16–52 checking) across all 126 profiled jobs. On outsourced codes (60.7x) they
are not: those imply $6,000–$100,000 per unit and are a lump sum against a
contract.

Some in-house lines also book a lump sum to a labor code, **and the estimate and
actual sides do it independently**. Of 218 in-house D&E lines, **54** carry a
lump-sum *estimate* (`estQty` of 1 against six figures) and **36 of those still
book real hours as their actual** — so a line can be unusable on one side and
sound on the other. A further **14** carry an *actual* that cannot be read as
hours; those are the ones the lump-sum panel lists. `estIsHours` and
`actIsHours` therefore judge each side separately.

This is not a rounding concern. Reading the estimate side uncritically puts the
estimated rate at **$104/hr against a $59/hr actual**, which invents a rate
problem that does not exist. Judged properly both sit near $59 and the real
finding is **35,855 hours over budget** — the overrun is hours, not rate. A view
that got this wrong would send someone to renegotiate rates instead of looking
at scope.

Lines excluded from hours are **never dropped**: their cost stays in every
total, only their hours are withheld, and they are listed in their own panel
with the implied per-unit figure so the exclusion is auditable.

The band (`RATE_BAND`, $10–$250/hr) is wide on purpose — real rates top out
around $69 and excluded lines start above $220, so nothing sits near a boundary
and the threshold is not sensitive.

**Hours are better covered than square feet, despite appearances.** Hours reach
97 of 126 jobs (77%) across all four plants; square feet reach 82 (65%) and skip
Monroeville entirely. Both are shown; neither is a complete denominator.

**How far to trust hours at all.** The column is headed `Est Qty`, not "Est
Hours" — reading it as hours is inference. It is sound in aggregate but soft per
line: of the 57 lines carrying quantities on both sides, only **32 (56%)** have
an estimated rate within 15% of their actual, and job 43134 estimates
engineering at $52/unit while booking at $161/unit. `hoursAgreement()` computes
that share and the UI states it on the hours panel. Do not promote hours above
the cost figures, and do not quote a single job's hours without checking it.

Two derived measures worth keeping:

- **Design lag** — pieces designed against how far the *whole job* has spent. A
  job spending faster than it is being designed is the one an engineering lead
  wants first, and it is not visible anywhere in the source report.
- **Blended rate** is always total cost over total hours, never an average of
  per-line rates, and each rate divides a cost by the hours from the *same*
  lines.

### Completion bars

Every row that closes a group — each section subtotal and the Job Totals row —
carries the same "% of Proj" figure and bar as the detail lines it closes,
through the shared `PctCell`. **Every total row also carries variance**, in
every view that has the column: the cost grid, the cost-code roll-up, the plant
table and each engineering table. A total that omits it forces the reader to do
the subtraction. A group with nothing projected shows a dash, not
0%: an empty projection makes the ratio meaningless rather than zero. Section
totals are summed once in the `bySection` memo rather than per cell.

### Visual review status

The owner reviewed the module on 2026-08-27 and approved the look. Everything
added after that point — the budget/forecast columns, `$/SF` throughout, the
hours section, and the whole 2026-08-31 interface rework (§15) — has **not**
been looked at, and there is no browser automation
here to check it (§7). The tables that grew most columns are Jobs, the plant
table and the D&E project table; those are where crowding would show first.
The 2026-09-25 retirement touched `JobDetail` (the "Scheduled in Production"
button is gone), and the 2026-09-26 Job Report tab and grouped grid replaced
its cost table. Neither has been looked at yet.

Keep saying plainly which changes were and were not visually verified.

---

## 14. My Projects

A starred subset of jobs, persisted, scoping **every section**: Projects,
Cost and Time all read the same list (Production and Drawings did too, until
they were retired). It started as a job-cost feature and moved
into `core/myProjects.js` on 2026-08-31, because the same handful of projects is
what an engineering manager wants to see in all of them: starring a job in one
place and having to star it again in the next is the thing this avoids.

**The switch lives in the shell header**, not in a section's filter row. It is
app-wide state; mounting it inside two sections made it look like a per-section
filter and made it vanish on the third (§15).

- **Membership is keyed on the job number**, not a plant-scoped key. The number
  is the project's identity in every system here: it is what the cost report
  and the timesheet both carry and what they join on (§12, §13), so a star
  survives a plant's report being re-imported or removed, and survives a job
  being costed under a different plant.
- **One record, `cv.analysis.app.my-projects.v1`**, via `core/persisted.js`. It
  is deliberately separate from any dataset or library record: clearing imported
  files must not forget what was starred. That is asserted in `test:storage`.
- **It read to live under `cv.analysis.job-cost.my-projects.v1`.**
  `usePersistedState` takes a `legacyKeys` list and adopts the old record on
  first read, writes it forward and deletes the old key — the same
  read-forward-then-drop story `store.js` uses for the localStorage records it
  replaced (§4). A hand-curated list must not silently reset because the scope
  widened. Tested.
- **The scope narrows the row/job pool itself**, in each module's filter hook,
  not per view. A view therefore cannot forget to apply it and show
  company-wide figures under a "My Projects" heading.
- **The pickers list only what the scope can show**, so choosing an option never
  lands on an unexplained empty view.
- **The list is never pruned against the loaded data.** A starred job whose
  plant is not imported, or which has no hours in the timesheet's window, is
  still a project someone picked; dropping it silently would mean re-starring
  everything whenever a file is removed. That includes stars placed on jobs
  that only ever appeared in the retired schedule: they stay, harmlessly. Each
  module reports how many of the selections it cannot currently show, in its
  own words: job cost says the plant's report may not be imported, Projects
  says no hours are booked to them.
- **A scoped pool states itself, above the figures**
  (`components/ScopeNotice.jsx`, on Time). §14 guarded against showing
  company-wide numbers under a "My Projects" heading; the opposite failure is
  the one that bit. On 2026-09-01 the owner read one employee's August as short
  and reported the app was losing hours: the page showed 1,538.6 hours where
  the export holds 16,423.9 for that month, across 8 of 130 jobs, with nothing
  on screen saying eight starred jobs were narrowing it. The switch is in the
  header (§15), which is easy to miss from a page of numbers, and a stat tile
  cannot carry the caveat — the number is the whole point of it. The notice
  names the scope, the window and any dimension filter, and offers the way
  out. It renders nothing when nothing is narrowing.
- **A person's hours are spread across *many* jobs, admin included**, so any
  job-scoped view shows them short *correctly*. The case that prompted this:
  168 hours in August across **9** job numbers, 48 of them on `00-001`. That
  is not an under-count, and the notice is what makes the difference legible.
- `scope: "mine"` with an empty list is a dead end, so `active` is false until
  something is starred, and a module shows `NoProjectsYet` rather than a blank
  dashboard. `clearMembers` returns the scope to All for the same reason.
- **The shell gates the first render on every record resolving**, `mine.ready`
  included, so a saved "My Projects" choice can never flash as "All". A section
  no longer has to remember to do this itself (§15).

The star (`StarButton`) and the All / My Projects switch (`ScopeToggle`) live in
`components/MyProjects.jsx`. A section that lists jobs should mount the star in
that table (the Projects table, the job page and the cost report's job detail
all do) so the list can be curated from wherever you
happen to be looking. `ScopeToggle` is mounted once, by `AppHeader`.

---

## 15. The shell: sections, routing and sources

Reworked 2026-08-31. The diagnosis, and a line-by-line map of every old surface
to its new home, is in `docs/interface-proposal.md`. **No analysis or control
was removed**; three things were added and the rest was regrouped.

Narrowed 2026-09-25: Production, Drawings and the Cost vs Schedule tab were
retired (`docs/cost-and-time-focus.md`, §11). The "What was wrong" list below
describes the app as it was on 2026-08-31 and is kept as history.

### What was wrong

The app grew a module at a time and the navigation recorded that history rather
than what the app is for. Concretely:

- The nav was four **file names**, meaningful only to whoever pulls the reports,
  and they did not even denote the same kind of thing: one export, three
  records, a four-file library, and a placeholder.
- There was **no front door** — the default route was a module, so a first-time
  viewer landed inside one subsection facing a dropzone, with no statement of
  what the app was or which files it wanted.
- **Five import strips with five vocabularies** for three actions.
- The **job** was the spine of the app and had no home: four screens, one
  one-way link that forgot the job on arrival, and two names for one entity
  ("Project" in Employee Time, "Job" everywhere else).
- **Switching module remounted everything**, and only the first hash segment was
  read, so no tab or drill-down was addressable.
- **My Projects was app-wide in code only** — mounted in two modules' filter
  rows, absent from the third.
- The most dangerous warnings in the app (a ticket report that misses the
  schedule; plants at mixed cut-off dates) were announced **only to someone
  already standing on the tab that computed them**.

### The organising idea

> The application is about **jobs**. Everything else (a timesheet, a cost
> workbook) is a source of evidence about jobs.

So sections are named after the question they answer, sources are one thing with
one vocabulary, and the job has a page.

### Sections

| Route | Section | Tabs |
|---|---|---|
| `#/` | **Home** | — |
| `#/projects` | **Projects** | All Jobs |
| `#/cost` | **Cost** | Portfolio · Job Report · Cost Codes · Drafting & Engineering |
| `#/time` | **Time** | Overview · People · Jobs · Cumulative |
| `#/sources` | Sources | — (reached from the header chip and Home, not the nav) |
| `#/job/<jobNo>` | Job page | Summary · Full Cost Report |
| `#/production`, `#/drawings` | (retired) | alias to Home, which says where they went |

`modules/sections.js` is the declaration and is **plain ESM** so the routing
rules are testable in node; `modules/registry.js` attaches the components.
Adding a section means editing both.

### Routing

`core/routing.js` parses the **whole** hash. `parseRoute` takes `isSection`,
`tabsFor` and `paramsFor` as injected functions, so it knows nothing about the
registry and can be driven by a fixture in the tests.

- An unknown section or tab **falls back** rather than rendering blank — a stale
  bookmark has to land somewhere real.
- `paramsFor` is 0 for every section except the job page, which is
  `#/job/<jobNo>/<tab>`: the job is what the page is *about*, so it precedes the
  tab, exactly as it reads aloud.
- Tabs are `<a href>`, not buttons. A section is **handed** its tab and must not
  keep tab state.
- The error boundary is keyed on the **section**, not the route, so switching
  tab does not remount the view and throw away its scroll position.
- **Routed drill-downs:** the job page, `#/cost/report/<jobNo>/<plant>`,
  `#/time/person/<name>`, `#/time/job/<name>`. A drill-down gets a route only when its record has a
  stable key to put in the URL; don't invent one from an array index. (The
  retired piece and day panels were unrouted for exactly that reason.)

### Data

Every dataset is created once in `src/app/AppData.jsx` and read through
`useAppData()` from `core/appData.js`. The keys and the hooks are unchanged.

This is not tidiness. Job cost was once reaching across the module boundary
with its own `useDataset` of another module's record, which was the first sign
the boundary was wrong; and the job page, Projects and Home need both sources
at once.

Startup also runs `dropRetiredRecords` (`core/store.js`), which deletes the
three records Production and Drawings left behind (§4).

`useAppData` **throws** without a provider, on purpose: a section rendered
outside the shell would otherwise show empty dashboards that look like "no data
loaded" rather than the wiring fault they are.

The shell holds a placeholder until **every** record resolves. Sections no
longer each remember to gate on `ready`.

### File age

Every source states **when its file was last modified**, on Sources, on Home and
in each section's own strip — the question "how old is this and do I need to
refresh it" was previously unanswerable for two of the four sources the app
then held.

- `core/parse.js` exports `isoFromMtime`, and both import paths use it: the
  flat-table parser already did, and `job-cost/importFile.js` captured **no
  date at all** until 2026-08-31.
- It is the file's **mtime**, so the UI says "modified" and never "exported". A
  copied or re-saved file carries a newer mtime than the report inside it.
- **Do not conflate it with the cost report's `asOf`**, which the report prints
  inside itself and which is the more authoritative of the two where it exists.
  Both are shown, side by side, on every plant row.
- The cost card reports its **oldest** plant: a library is only as current as
  its stalest member.
- `STALE_AFTER_DAYS` (14) in `app/sources.js` raises an amber badge and the
  header chip. It is a **rule of thumb, not anyone's policy**, and the page says
  so in as many words — the cost reports are weekly, so a fortnight means a
  refresh was missed. Change it there if the real cadence differs.
- **Unknown is neither fresh nor stale.** Sources imported before the date was
  captured render "date unknown" and are never accused of being old. Tested.
- Build phrases like "modified 2026-08-30" as **one template string**, not
  adjacent JSX text nodes: React's server renderer splits those with `<!-- -->`,
  which makes the phrase unreadable in the DOM and unassertable in a test. That
  is how the first attempt was caught.

### Sources: one vocabulary

`app/sources.js` describes every file the app can hold — pure ESM, so its
warning rules are testable. Three verbs, used verbatim everywhere:
**Add** / **Replace** / **Remove** (plus **Remove all**). Removing anything that
took an upload asks once. `components/SourceStrip.jsx` is the one row layout.

A descriptor's `warn` is a **sentence**, not a flag, because whatever raises the
header chip has to be able to say why in the same breath. This is how the
mixed-cut-off trap reaches Home and the header instead of being trapped in one
tab (as the ticket coverage trap did, before it was retired). **When you add
a source, its `warn` is the part that matters most.**

### The job page

`modules/job/assemble.js` gathers one job from every source; `index.jsx` is
presentation only. Rules it holds to:

- Keyed on the job **number**, never the name.
- Each source is its own section, with its own as-of stated. The figures are
  **never summed across sources**: cost is dollars to date, the timesheet is
  hours over whatever window it was run for.
- "Not loaded" and "loaded but says nothing about this job" are **visibly
  different**. Neither renders zeros.
- The Hours block was a labelled guess until the time export was profiled on
  2026-08-31. It is now a real join on the job number like every other source,
  and it breaks the hours down by task and by person — the question the cost
  report cannot answer, since 60.x books cost to a code rather than time to a
  person. The two are shown side by side and **never added** (§12).

### Projects: the merged table

`modules/projects/rows.js` merges the cost job list and the timesheet into one
row per job number. A job present in only one source leaves the other
side **dashed, not zeroed** — a dash says "this source doesn't mention it", a
zero would say "it has none". Tested.

### Vocabulary

One word per concept. Job (not Project) for the entity; Overview (not Charts or
Portfolio) for that kind of screen; `Job No` for the number and `Job` for the
name; `Budget / SF` spacing on every rate; `Variance to Forecast` spelled out.
Keep this list true when adding a column.

### Visual review status

**None of this has been looked at**, including the 2026-09-25 retirement.
There is no browser automation here (§7). The four suites pass, but they prove
that views mount and that arithmetic holds, not that anything looks right. The
places most likely to need adjusting, in order: the shell header (a new
persistent row on every page, now with four nav items), the Projects table
(cost columns, hours and people in one row, many of them dashed), the job page
(two sources on one screen) and Home (a shorter task list and the retirement
note). Ask the owner to look at `npm run dev`.
