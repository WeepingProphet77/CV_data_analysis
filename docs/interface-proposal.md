# Interface proposal — making CV Data Analysis read as one application

**Status:** **implemented** 2026-08-31 — phases 1–3, and phase 4's Employee Time
half once the real export arrived (it carries the job number; the hours join is
real and Time joined the app-wide scope). What remains of phase 4 is confirming
the plan-vs-actual export's columns, which needs a file nobody has yet.

CLAUDE.md §12 and §15 are the maintained description of what was built; this
document is kept for the diagnosis and for the accounting in §8. Where a claim
here was overtaken by the profile, it is marked in place rather than rewritten —
the reasoning is the point of keeping it.
**Written:** 2026-08-31, against commit `e137fbe`.
**Scope:** the interface — navigation, entry point, vocabulary, routing, and where
each existing view lives. **No analysis, view or control is removed.** §8 is a
line-by-line accounting of every surface in the app today and where it lands.

---

## 1. What a first-time viewer actually sees

Open the live site with nothing loaded:

1. The URL rewrites itself to `#/employee-time` (`registry.js:43`, `App.jsx:24`).
2. A nav row of four uppercase words — EMPLOYEE TIME, PRODUCTION, JOB COST,
   SCHEDULE — and a 10px grey subtitle on the right reading
   "Concrete Vision · Data Analysis".
3. Below it: a dropzone headed **Employee Time**, asking for a file, listing
   five expected column names.

At that moment the viewer knows none of: what the application is for, which four
things those nav words are, which files it wants, whether they need all four, or
that everything stays in their browser (that sentence exists, but only inside the
import prompt they happen to be standing on). Three of the four nav items are
also empty, and clicking each one to find out is the only way to learn what it
holds.

The landing module is also the weakest one: Employee Time's schema was inferred
from the legacy HTML tool and has never been checked against a real export
(CLAUDE.md §12). The app's front door is the one module most likely to reject
the first file it is given.

That is the headline problem. The rest of this section is the specific ways the
interface shows its seams.

---

## 2. Diagnosis

### A. The navigation is named after source files, not after questions

"Employee Time", "Production", "Job Cost", "Schedule" are the names of four
exports. They are meaningful to whoever pulls the reports and opaque to everyone
else — and they are not even consistent in what a nav item stands for:

| Nav item | Actually holds |
|---|---|
| Employee Time | one export, replaced on upload |
| Production | **three** records — schedule, ticket report, previous-schedule baseline |
| Job Cost | a **library** — one workbook per plant, four loaded, two cut-off dates |
| Schedule | nothing. A placeholder for a report nobody has confirmed exists |

A viewer cannot tell from the nav that Production will ask for two different
files, or that Job Cost wants four at once, or that Schedule will never show
them anything.

### B. There is no front door

There is no home, no overview, no statement of purpose, and no place that shows
what is loaded. The default route is a module (`DEFAULT_MODULE = "employee-time"`),
so the app opens mid-way into one of its own subsections.

### C. Four different idioms for loading a file

| Surface | Where | Verbs |
|---|---|---|
| `ImportPrompt` | full-page empty state | click/drop |
| `DataBar` | top bar, one file | **Upload New Data**, **Clear Data** |
| `SourceLibrary` | top bar + row list | **Add / Replace Plant**, **Clear All**, per-row **Remove** |
| `TicketBar` | row list, under DataBar | **Replace**, **Remove** |
| `BaselineBar` | row list | **Stop comparing** |

Five components, four layouts, and five verbs for what are really three actions:
add a file, swap a file, forget a file. `Clear Data` / `Clear All` / `Remove` /
`Stop comparing` all mean "forget this", and one of them prompts for
confirmation while the others do not.

Production can stack **four** of these strips (DataBar, BaselineBar, TicketBar,
plus a coverage notice and a My Projects notice) above the tab row before any
content appears.

### D. The job is the spine of the app, and has no home

Every module is ultimately about a job, and the job number is the key that joins
all of them (CLAUDE.md §13, §14). Yet a single job is scattered across four
places with no route between them:

- its money — Job Cost → Jobs → `JobDetail`
- its schedule — Production → Jobs, or the Board filtered to it
- its drawing status — Production → Tickets
- its hours — Employee Time → Projects → `ProjectDetail`

There is exactly **one** cross-module link in the codebase, and it is one-way and
lossy: `job-cost/index.jsx:63` sets `window.location.hash = "#/production"` and
the job is forgotten on arrival.

The same entity is also called two different things: **Project** in Employee
Time, **Job** everywhere else.

### E. Your place is lost every time you switch modules

`App.jsx:53` mounts the active module as `<ErrorBoundary key={moduleId}>`, so
changing nav item remounts the whole subtree. Tab, filters, search, drill-down —
all reset. The *data* persists across sessions in IndexedDB; the *place* does not
survive a single click.

And nothing below module level is addressable: `App.jsx:14` truncates the hash at
the first segment (`.split("/")[0]`). A drill-down cannot be bookmarked or
shared, and the browser Back button skips past every drill-down and leaves the
app entirely.

### F. "My Projects" is app-wide in the code and not in the interface

`core/myProjects.js` is app-wide by design (CLAUDE.md §14). In practice:

- Production and Job Cost read it. **Employee Time does not import it at all**
  (`useTimeFilters.js` takes no `mine` argument).
- Its switch (`ScopeToggle`) is mounted inside two modules' filter rows, so an
  app-wide setting looks like a per-module filter, and disappears on the third
  module without explanation.
- `NoProjectsYet` tells the viewer stars appear "in a Jobs table" — but the
  star is mounted in five specific tables, and there is no single place to see
  or curate the list.

### G. Tab vocabulary drifts across modules

Same kind of thing, three names:

| Employee Time | Production | Job Cost |
|---|---|---|
| **Overview** | **Charts** | **Portfolio** |
| **Projects** | **Jobs** | **Jobs** |

"Board", "Calendar", "Moved", "Cumulative", "vs Production", "Drafting & Eng"
mix nouns, verbs and abbreviations. Inside views the drift continues:
`Budget / SF` and `Budget /SF`, `Variance to Forecast` and `Var to Fcst`, `Job`
and `Job #` all appear as labels in the same app.

### H. Seventeen tabs, no hierarchy

Four nav items expand into 17 tabs and 5 drill-down screens. Production alone has
eight tabs in one flat row, covering three unrelated jobs: planning the week
(Board, Calendar), analysing the schedule (Charts, Beds, Jobs, Pieces), checking
drawings (Tickets), and comparing uploads (Moved). Tickets — the one an
engineering manager would open first — is seventh.

### I. Nothing shows what is loaded

Each module hides its own state. Standing in Employee Time there is no way to
know that Job Cost holds four plants at two different cut-off dates, or that the
ticket report loaded under Production covers a month the schedule does not — the
single most misleading state the app can be in (CLAUDE.md §11), and it is
announced only to someone already standing on that tab.

*(Minor, while in the area: `employee-time/index.jsx:23` declares a `TABS`
constant that nothing reads.)*

---

## 3. The organizing idea

> **The application is about jobs. Everything else — a timesheet, a pour
> schedule, a cost workbook, a ticket report — is a source of evidence about
> jobs.**

The current interface is organised by *evidence*. It should be organised by
*question*, with the evidence gathered in one place behind it. Three structural
additions carry most of the improvement:

1. **A Home page** — what this is, what is loaded, what to do next.
2. **A Job page** — one project, all four sources, one URL.
3. **One Sources model** — every file, one vocabulary, one place.

Everything else in this proposal is regrouping and renaming around those.

---

## 4. Proposed information architecture

### Nav

| # | Item | Route | Holds |
|---|---|---|---|
| 1 | **Home** | `#/` | Purpose, what is loaded, what is missing, entry points |
| 2 | **Projects** | `#/projects` | The job list across all sources; the Job page; My Projects |
| 3 | **Production** | `#/production` | Board, Calendar, Charts, Beds, Pieces, Moved |
| 4 | **Drawings** | `#/drawings` | The missing-ticket queue, promoted out of Production's tab 7 |
| 5 | **Cost** | `#/cost` | Portfolio, Cost Codes, Drafting & Engineering |
| 6 | **Time** | `#/time` | Overview, People, Jobs, Cumulative |
| — | **Sources** | `#/sources` | Every loaded file. Reached from Home and from a header chip |

Six items, each a question a person has, none of them a filename. "Schedule"
leaves the nav — it is a dead end today — and its placeholder text (planned
scope, expected columns) moves to Home's roadmap block, ready to return as a
**Plan vs Actual** tab inside Production when that export is confirmed.

### Persistent shell

A slim header on every page, replacing today's bare nav row:

```
CV DATA ANALYSIS · Concrete Vision                 [ All ▾ / ★ My Projects (7) ]  [ 6 files ⚠ ]
Home   Projects   Production   Drawings   Cost   Time
```

- **The scope switch moves into the shell.** It is app-wide state; it should be
  app-wide chrome, not a control that appears in two modules' filter rows and
  vanishes in a third.
- **The data chip** shows the file count and turns amber when something needs
  attention — mixed cut-off dates, a ticket report that does not cover the
  schedule, a save failure. Clicking it opens Sources. This is the fix for
  finding I: the warnings currently trapped inside one tab become visible from
  everywhere.

### Tabs per section

| Section | Tabs |
|---|---|
| Projects | **All Jobs** · **Cost vs Schedule** (today's "vs Production") |
| Production | **Board** · **Calendar** · **Charts** · **Beds** · **Pieces** · **Moved** |
| Drawings | **Queue** (by urgency) · **By Job** · **By Drafter** |
| Cost | **Portfolio** · **Cost Codes** · **Drafting & Engineering** |
| Time | **Overview** · **People** · **Jobs** · **Cumulative** |

Production drops from eight tabs to six; Tickets becomes a section, and its
existing internal breakdowns (urgency buckets, by-job table, by-drafter table)
become its tabs rather than stacked panels.

---

## 5. The three new surfaces

### 5.1 Home

Four blocks, in this order:

**a. What this is** — two sentences. *"Analysis of Concrete Vision and job cost
reports. Drop an export on the page and read it. Everything is parsed and stored
in this browser; nothing is uploaded anywhere."* The privacy statement currently
lives only inside import prompts; it belongs where a first-time viewer meets it.

**b. What is loaded** — one row per source, using the Sources vocabulary:

```
Schedule            ScheduledProdRptDtl.xls      4,358 rows   Aug 1 – Aug 31       [Replace] [Remove]
Missing tickets     MissingPieceMarkTicket.xlsx    213 pieces  Sep 1 – Sep 30  ⚠   [Replace] [Remove]
Job cost · 4 plants Ashland City, Hillsboro…       126 jobs    as of Jul 31–Aug 26 ⚠ [Manage]
Employee time       — not loaded —                                                  [Add]
```

The two ⚠ rows are exactly the conditions CLAUDE.md flags as dangerous to miss:
a ticket report that does not overlap the schedule, and plants at mixed cut-off
dates. **They must be visible before the reader forms a conclusion**, not after.

**c. Start here** — task-shaped links, each stating the file it needs:

- *Plan the week's pours* → Production → Board *(needs the schedule)*
- *Find pieces with no drawing* → Drawings *(needs the schedule + ticket report)*
- *See what moved since last week* → Production → Moved *(appears once a schedule has been replaced)*
- *Check margin across the portfolio* → Cost *(needs the job cost workbooks)*
- *Look up one job* → Projects
- *Where are hours going* → Time *(needs the timesheet export)*

An entry whose file is missing stays visible and says which file it needs. A
first-time viewer learns the shape of the whole app from one screen without
clicking into three empty modules.

**d. Not built yet** — the Schedule placeholder's planned scope and expected
columns, plus the standing note that the column list is unconfirmed.

### 5.2 The Job page — `#/job/<jobNo>`

One project, everything known about it, assembled from data the app already
computes. Nothing new is analysed; the sections are the existing views scoped to
one job.

```
43134 — 1401 CHURCH STREET                                   ★ My Projects
Ashland City · cost as of 2026-08-26 · scheduled Aug 3 – Aug 28

[ Cost ]  Net contract  Actual  Projected  Margin at completion  $/SF
[ Schedule ] pieces scheduled · beds · date span · what moved since the last upload
[ Drawings ] N pieces with no ticket        (or "not covered by the loaded ticket report")
[ Hours ]    from the timesheet export      (or "not matched — see the note below")
                                                            → full cost report · → board
```

- Every section states which source it comes from and its as-of date, so the
  reader can never mistake a cumulative cost figure for a forward schedule
  figure (CLAUDE.md §13).
- A section whose file is not loaded says so and offers the import — it does not
  render zeros.
- **Hours carry an honest caveat.** Employee Time's `job` field is a free-text
  job name that has never been profiled against a real export (CLAUDE.md §12,
  §10), so it cannot be joined on job number yet. The section shows a
  best-effort name match clearly labelled as such, or states that the join is
  unavailable. It must not silently imply a link that does not exist.
  > **Superseded 2026-08-31.** The export was profiled and it *does* carry the
  > job number, on 100.0% of rows. The hours join is real, the caveat is gone,
  > and the block breaks hours down by task and by person. See CLAUDE.md §12.
- **This replaces the lossy hash jump** at `job-cost/index.jsx:63`. Every job
  number in every table in the app links here.

### 5.3 Sources — `#/sources`

One page, one component, one vocabulary, for every file the app holds.

| Action | Verb | Applies to |
|---|---|---|
| Load a file for the first time | **Add** | all |
| Swap the file for a newer one | **Replace** | all |
| Forget a file | **Remove** | all |
| Forget everything | **Remove all** | the page |

The per-module strips do not disappear — `DataBar`, `SourceLibrary` and
`TicketBar` continue to show, in place, what that section is reading — but they
are rebuilt on one shared component with these four verbs and one layout.
`BaselineBar` keeps its distinct wording ("Compared against… / Stop comparing"),
because it describes a comparison rather than a loaded file, but adopts the same
row layout.

Confirmation is consistent: removing anything that took a file upload to create
prompts once.

---

## 6. Vocabulary

One word per concept, everywhere.

| Today | Proposed | Note |
|---|---|---|
| Project *(Employee Time)* | **Job** | One name for the entity. "My Projects" keeps its name as a saved *list* |
| Overview / Charts / Portfolio | **Overview** | Same kind of screen, same word |
| vs Production | **Cost vs Schedule** | Says what is compared |
| Moved | **Schedule Changes** | Reads without knowing the feature |
| Drafting & Eng | **Drafting & Engineering** | No abbreviation in a nav or tab |
| Upload New Data / Add / Replace Plant | **Add** / **Replace** | §5.3 |
| Clear Data / Clear All / Remove | **Remove** / **Remove all** | §5.3 |
| `Budget / SF`, `Budget /SF` | `Budget / SF` | One spacing rule for every rate |
| `Variance to Forecast`, `Var to Fcst` | `Variance to Forecast` | Abbreviate only where a column forces it, and then consistently |
| `Job`, `Job #` | `Job` for the name, `Job No` for the number | They are different columns |

A short "labels" note in CLAUDE.md §9 should record these, so the next module
inherits them instead of inventing a sixth variant.

---

## 7. Routing and state

Three changes, all in `App.jsx` and `registry.js`:

1. **Parse the whole hash, not the first segment.** `#/production/board`,
   `#/cost/codes`, `#/job/43134`, `#/drawings/queue`. Every tab and every
   drill-down becomes a link that can be bookmarked, shared and reached with the
   Back button. Today `App.jsx:14` discards everything after the first `/`.
2. **Stop remounting on nav.** Keep the `ErrorBoundary` (it earns its place) but
   move the `key` off `moduleId`, or hold each section's tab and filter state
   above the boundary. Switching to Cost and back should return you to the bed
   and week you were looking at.
3. **Route the drill-downs.** `PersonDetail`, `ProjectDetail`, `JobDetail`,
   `PieceDetail` and `DayDetail` are currently `useState` inside a module. Given
   1 and 2 they become routes, which is also what makes the Job page linkable
   from every table.

`registry.js` stays the single declaration point for a section — it gains a
`tabs` list so the router can validate a second segment, and the nav, Home and
the router keep reading one array.

---

## 8. Nothing is lost — the accounting

Every surface in the app today, and where it ends up.

### Shell

| Today | Destination |
|---|---|
| Module nav (4 items) | Shell nav (6 items) — §4 |
| "Concrete Vision · Data Analysis" subtitle | Shell header, as the app title |
| Error boundary with retry | Unchanged, re-keyed on route (§7.2) |

### Employee Time → **Time**

| Today | Destination |
|---|---|
| `ImportPrompt` empty state | Kept; also reachable from Home and Sources |
| `DataBar` (file, export date, entry count) | Rebuilt on the shared strip; same information |
| Persist warning · import notes | Kept, plus surfaced on the shell data chip |
| Filters: date window, Locations, Departments, Clear | Unchanged |
| Search (People / Jobs tabs) | Unchanged |
| Tab **Overview** | Time → **Overview** |
| Tab **People** *(n)* | Time → **People** |
| Tab **Projects** *(n)* | Time → **Jobs** (renamed, §6) |
| Tab **Cumulative** | Time → **Cumulative** |
| `PersonDetail` drill-down | Route `#/time/person/<name>` |
| `ProjectDetail` drill-down | Route `#/time/job/<name>`, and linked from the Job page's Hours section |
| *(new)* | Scope switch appears — **blocked** until the job field is profiled; see §11 |

### Production → **Production** + **Drawings**

| Today | Destination |
|---|---|
| `ImportPrompt` (schedule) | Kept |
| `DataBar` (schedule) | Shared strip |
| `BaselineBar` + Stop comparing | Kept; same row layout, same wording |
| `TicketBar` + Replace / Remove | Moves with Tickets into **Drawings**; the coverage warning also raises the shell chip |
| `CoverageNotice` | Kept verbatim, shown on Drawings **and** on Home (§5.1b) |
| My Projects "stranded jobs" notice | Kept |
| Filters: date, plant, job, scope, search | Kept, including per-tab omissions (Board and Calendar own the plant picker) |
| Tab **Board** (+ colour-by, ticket flag, movement chips, only-missing / only-moved filters) | Production → **Board**, unchanged |
| `PieceDetail` drill-down | Route `#/production/piece/…` |
| Tab **Calendar** | Production → **Calendar** |
| `DayDetail` drill-down | Route |
| Tab **Charts** | Production → **Overview** (§6) |
| Tab **Beds** *(n)* | Production → **Beds** |
| Tab **Jobs** *(n)* | **Merged into Projects → All Jobs** as its schedule columns; every job links to the Job page. See §11 — this is the one merge worth debating |
| Tab **Pieces** | Production → **Pieces** |
| Tab **Tickets** *(n)* | **Drawings** section: urgency queue, by-job, by-drafter become its three tabs |
| `TicketDrop` empty state | Drawings empty state |
| Tab **Moved** *(n)* | Production → **Schedule Changes** (§6), unchanged content |

### Job Cost → **Cost** + **Projects**

| Today | Destination |
|---|---|
| `SourceDrop` empty state | Kept; also on Sources |
| `SourceLibrary` strip (per-plant rows, as-of badges, Remove) | Rebuilt on the shared strip; **the mixed-as-of amber notice is kept and also raises the shell chip** |
| Missing-from-library notice | Kept |
| Filters: scope, plant, job, category, search | Kept, including the category picker appearing only where cost lines are on screen |
| Tab **Portfolio** | Cost → **Portfolio** |
| Tab **Drafting & Eng** | Cost → **Drafting & Engineering** |
| Tab **Jobs** *(n)* | **Projects → All Jobs**, with cost columns |
| Tab **Cost Codes** | Cost → **Cost Codes** |
| Tab **vs Production** | **Projects → Cost vs Schedule**; the matched / scheduled-not-costed / costed-not-scheduled lists are kept verbatim |
| `JobDetail` drill-down | Route `#/job/<jobNo>`, reached from the Job page's "full cost report" link — **the whole reproduced report is kept, including the empty-fields toggle** |
| `MyProjects` star + scope toggle | Star stays in every job table; the toggle moves to the shell (§4) |

### Schedule

| Today | Destination |
|---|---|
| `ModulePlaceholder` (planned scope, expected columns, "guess" caveat) | Home → "Not built yet". The component stays, ready to mount as a Production tab when the export is confirmed |

**Removed outright: nothing.** The only deletions proposed are the unused `TABS`
constant at `employee-time/index.jsx:23` and one nav entry that renders a
placeholder, whose content moves to Home.

---

## 9. Phasing

Each phase is independently shippable and leaves the app coherent.

### Phase 1 — front door and one vocabulary *(highest value, lowest risk)*

- Home page (§5.1)
- Shell header: app title, scope switch, data chip (§4)
- One shared source strip and four verbs (§5.3), applied to all five strips
- Vocabulary pass (§6): tab names and label spelling only
- Delete the dead `TABS` constant

No routing changes, no view merges, no module boundaries touched. A first-time
viewer gets a comprehensible app; every existing screen keeps working exactly as
it does. **This is where I would stop and look at it before going further.**

### Phase 2 — routing and the Job page

- Full hash parsing, routed tabs and drill-downs, no remount on nav (§7)
- The Job page (§5.2), linked from every job number in the app
- Replace the lossy `#/production` jump

Higher risk: it touches `App.jsx`, `registry.js` and the drill-down state in all
three modules. `render-test.jsx` needs a case per new route, including a Job page
for a job that exists in one source and not the others.

### Phase 3 — the regroup

- Split Drawings out of Production; split Projects out of Job Cost
- Merge the two Jobs tables into Projects → All Jobs
- Production and Cost tab renames

This is the phase that changes where people find things. It is worth doing only
after Phases 1 and 2 have been looked at in a browser, because it is the one that
would be annoying to reverse.

### Phase 4 — the honest gaps

- ~~Profile a real Employee Time export, so its job field can join on job
  number~~ — **done 2026-08-31.** The schema was right, the export carries the
  job number, the join is real, and Time now takes part in My Projects. It also
  turned up a trap worth recording: `Location` is the person's *office*, not the
  job's plant, so it must never be wired to `plants.js` (CLAUDE.md §12).
- Confirm the plan-vs-actual export's columns and mount it as a Production tab.
  Still open — nobody has produced that file.

---

## 10. What this does not change

Every constraint in CLAUDE.md holds:

- **All processing stays client-side.** No server, no upload, no analytics. The
  Home page states this more prominently than the app does today.
- **`core/` never imports from `components/` or `modules/`.** Home, the Job page
  and the shared strip are `components/`; the Job page's assembly logic goes in
  a plain `.js` file so the test scripts can import it in node.
- **`registry.js` stays the only place a section is declared.**
- **Eight categorical colours, never a ninth.** Nothing here adds a series
  colour; the shell chip and the ⚠ markers use `--warning` / `--critical`, which
  are already reserved status tokens.
- **Job Cost keeps its library.** It is not folded back to `useDataset`.
- **My Projects stays keyed on job number**, one record, never pruned against
  loaded data.
- **The theme is unchanged.** New surfaces use existing tokens and classes; new
  colours would go in as tokens under `:root`, not literals.

---

## 11. Decisions that need the owner

1. **Merging the two Jobs tables.** Production → Jobs and Job Cost → Jobs list
   the same entity with different columns. Merging them into one Projects table
   is the single biggest legibility win — and it means the schedule-only columns
   and the cost-only columns share a table where many cells will be blank for
   jobs missing one source. If that reads badly, the fallback is one Projects
   table with a source filter, keeping the two column sets as views of it.
2. **Six nav items instead of four.** More top-level items, each meaning
   something. The alternative is to keep four and rely on Home plus the Job page
   to do the explaining — Phase 1 alone, essentially.
3. **Is "Drawings" the right word** for the missing-ticket queue, or is there a
   term the shop already uses?
4. **Does the Job page want hours at all** before the Employee Time export is
   profiled, or should that section wait until the join is real?
5. Which of the six entry points on Home matters most — that one should be the
   default route for a returning viewer.

---

## 12. Verification

**Nothing in this proposal has been looked at in a browser.** There is no browser
automation in this environment (CLAUDE.md §7), so every layout claim here is
reasoning from the code, not observation. Whichever phase is built, the result
needs a pass on `npm run dev` before it is trusted — especially the shell header,
which adds a persistent row to every page, and the Job page, which packs four
sources into one screen.

Tests each phase must carry:

- `render-test.jsx` — a case for Home with nothing loaded, Home with everything
  loaded, the Job page for a job present in all four sources, and the Job page
  for a job present in exactly one.
- `storage-test.mjs` — the existing assertions still hold: clearing the schedule
  clears the baseline; clearing imports does not clear My Projects.
- No change to `job-cost-test.mjs` or `production-test.mjs` is expected — this
  proposal moves no arithmetic. If a suite needs changing, something has been
  moved that should not have been.
