# CLAUDE.md — CV Data Analysis

Guidance for Claude Code (and any human) working in this repository. Keep it
current: when a decision here stops being true, change it here in the same
commit that changes the code.

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
    csv.js                     RFC 4180 CSV reader (hand-rolled, dependency-free)
    parse.js                   schema-driven ingest: coercion, column mapping
    aggregate.js               groupBy / rollup / cumulativeSeries / topNWithOther
    store.js                   useDataset — per-module localStorage persistence
    palette.js                 the 8 validated categorical series colors
    format.js                  fmt / pct / compact / date helpers
    hooks.js                   useSize (ResizeObserver)
  components/                  shared, module-agnostic UI
    ui.jsx                     Badge, MiniBar, StatCard, Tabs, Panel, sorting
    FileImport.jsx             ImportPrompt (empty state) + ImportButton
    DataBar.jsx                loaded-file strip: source, replace, clear
    Filters.jsx                FilterBar — date window + dimension selects
    ModulePlaceholder.jsx      stub UI for reserved-but-unbuilt modules
    charts/
      LineChart.jsx            multi-series time lines, crosshair, table view
      BarChart.jsx             ranked horizontal bars
      scale.js                 niceTicks / sampleTicks / linear
  modules/
    registry.js                THE list of modules — nav and router read this
    employee-time/             built
    production/                placeholder
    schedule/                  placeholder
scripts/
  make-sample.mjs              generates the synthetic sample CSV
  smoke-test.mjs               data-layer checks (pure, no DOM)
  render-test.jsx              server-renders every view against the sample
samples/employee-time.sample.csv   synthetic, safe to commit
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

The two placeholders (`production`, `schedule`) render `<ModulePlaceholder>`,
which states the intended scope and the export columns each is expected to
consume. **Those column lists are guesses** — confirm them against a real
Concrete Vision export before building either module out.

---

## 4. Data ingest

`core/parse.js` → `parseFile(file, schema)` → `{ rows, meta }`.

- `.csv` goes through `core/csv.js`. `.xlsx`/`.xls` **dynamically import**
  SheetJS, so the ~500KB parser is a separate chunk that a CSV user never
  downloads. Keep it that way: never add a top-level `import * as XLSX`.
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
  headers actually found. Missing optional columns are silent; unused columns
  become an import note.

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
npm test             # all three suites; the deploy script gates on this
npm run test:data    # core/ logic in plain node — fast, no build
npm run test:storage # IndexedDB persistence, against fake-indexeddb
npm run test:render  # server-renders every view against the sample data
```

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

**Neither suite looks at the page.** There is no browser automation here. When a
change affects layout, spacing, color or interaction, say plainly that it was
not visually verified, and ask the user to look at `npm run dev`.

When adding logic to `core/`, add a case to `smoke-test.mjs`. It is a hand-rolled
harness on purpose — no test framework dependency.

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

- [ ] Confirm the real column names in Concrete Vision's **production** and
      **schedule** exports. The lists in the placeholders are guesses.
- [ ] Does the employee time export include a pay-rate or cost column? If so,
      cost rollups become possible — but decide first whether pay data should
      live in a browser cache at all.
- [ ] Loading two exports covering different date spans currently **replaces**
      the dataset. If merging spans is wanted, it needs a dedupe key (probably
      date + person + job + task). IndexedDB now has the headroom for it.
- [ ] Very large datasets are held entirely in memory and re-aggregated on every
      filter change. If that gets sluggish, the fix is indexing or a web worker,
      not a smaller dataset — measure before optimizing.
- [ ] Cross-module analysis (labor hours per unit produced; charged hours versus
      schedule) is the reason the modules share a core. It needs a story for
      joining datasets on job name.
- [ ] No CSV/PNG export from the dashboard yet.
- [ ] Consider a per-person weekly-hours view (over/under 40) once real data
      confirms how overtime is represented.
