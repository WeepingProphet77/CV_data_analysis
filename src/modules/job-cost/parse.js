/**
 * Job Cost Report ingest.
 *
 * This export does NOT go through core/parse.js. That parser is schema-driven
 * and expects one flat table with a header row; a Job Cost Report is a
 * *formatted report* — one worksheet per job, a header block of contract
 * figures, then cost lines grouped into sections and closed by subtotal rows.
 * So the shape is walked explicitly here instead.
 *
 * Everything below is pure: it takes an array-of-arrays per sheet, never a
 * File and never SheetJS, so the test scripts can import it straight into node.
 * Reading the workbook lives in ./importFile.js, which keeps the lazy
 * SheetJS chunk out of a user who only ever loads CSVs (CLAUDE.md §4).
 *
 * See CLAUDE.md §13 for the profile of the source workbook.
 */

/** Column positions in the detail grid. 7 and 9 are spacer columns. */
export const COL = {
  task: 0, desc: 1, estQty: 2, estCost: 3, projCost: 4,
  curMo: 5, actQty: 6, actCost: 8, variance: 10, pctProj: 11,
};

/** The header row is always row 8 (index 7) — verified across 126 sheets. */
export const HEADER_ROW = 7;

/** Stage prefixes on the quantity-tracking rows. */
export const STAGES = { "D&E": "Designed", PROD: "Produced", DELV: "Delivered" };

const text = (v) => (v == null ? "" : String(v).trim());

/**
 * Forgiving numeric coercion, matching core/parse.js: an unreadable value
 * becomes 0 rather than NaN, which would poison every downstream sum.
 */
export function num(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** "As of 8/26/2026" -> "2026-08-26". Anything unparseable returns "". */
export function asOfToIso(v) {
  const s = text(v).replace(/^As of\s*/i, "");
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return "";
  const [, mo, d, y] = m;
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  const p = (n) => String(n).padStart(2, "0");
  return `${year}-${p(mo)}-${p(d)}`;
}

/**
 * "43134   1401 CHURCH STREET MOTLEY T1" -> { number, title }.
 *
 * The number and title are separated by a run of spaces, never a dash — job
 * *numbers* here carry their own internal dashes ("42343-IN", "43208-IN"), so
 * splitting on a dash would cut them in half. A title with no separator at all
 * degrades to an all-title record rather than being force-split.
 */
export function splitJobTitle(v) {
  const s = text(v);
  const m = s.match(/^(\S+)\s{2,}(.+)$/) || s.match(/^(\S+)\s+(.+)$/);
  return m ? { number: m[1], title: m[2].trim() } : { number: s, title: "" };
}

const measures = (row) => ({
  estQty: num(row[COL.estQty]),
  estCost: num(row[COL.estCost]),
  projCost: num(row[COL.projCost]),
  curMo: num(row[COL.curMo]),
  actQty: num(row[COL.actQty]),
  actCost: num(row[COL.actCost]),
  variance: num(row[COL.variance]),
  pctProj: num(row[COL.pctProj]),
});

/** A cost code: "60.120", and the one observed suffixed form "70.000A". */
const isCostCode = (s) => /^\d{2}\.\d{3}[A-Z]?$/.test(s);

/**
 * Parse one worksheet (one job) given as an array-of-arrays.
 *
 * Returns null for a sheet that carries no recognisable job header, so a
 * stray tab in the workbook is skipped rather than becoming a phantom job.
 */
export function parseJobSheet(aoa, sheetName = "") {
  const rows = Array.isArray(aoa) ? aoa : [];
  const at = (r, c) => (rows[r] ? rows[r][c] : undefined);

  /*
   * Establish this really is a job sheet before reading anything. Falling back
   * to the tab name alone is not enough: an empty worksheet would then become a
   * phantom job named after its tab, carrying zeros into every total.
   */
  const a3 = text(at(2, 0));
  const hdr = rows[HEADER_ROW] || [];
  const hasHeader = /^task$/i.test(text(hdr[COL.task])) && /^desc/i.test(text(hdr[COL.desc]));
  if (!a3 && !hasHeader) return null;

  const { number, title } = splitJobTitle(a3);
  const jobNo = number || text(sheetName);
  if (!jobNo) return null;

  /*
   * The header block. Contract figures sit in two stacks: names in column 1
   * with values in column 2, names in column 5 with values in column 6, and
   * the cost/margin stack labelled in column 8 with values in 10 (and a
   * percentage in 11). Positions are fixed — all 126 sheets profiled identical.
   */
  const job = {
    jobNo,
    jobTitle: title,
    asOf: asOfToIso(at(0, 7)),
    originalContract: num(at(3, 2)),
    changeOrders: num(at(4, 2)),
    netContract: num(at(5, 2)),
    amountBilled: num(at(4, 6)),
    pctBilled: num(at(5, 6)),
    actualCost: num(at(2, 10)),
    projectedCost: num(at(3, 10)),
    estOhProfit: num(at(4, 10)),
    estOhProfitPct: num(at(4, 11)),
    netOhProfit: num(at(5, 10)),
    netOhProfitPct: num(at(5, 11)),
  };

  const costs = [];
  const quantities = [];
  const sections = [];
  let section = "";
  let contingency = null;
  let jobTotals = null;
  let afterTotals = false;

  for (let i = HEADER_ROW + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const c0 = text(row[COL.task]);
    const c1 = text(row[COL.desc]);
    if (!c0 && !c1) continue;

    if (c0 === "Job Totals") {
      jobTotals = measures(row);
      afterTotals = true;
      continue;
    }

    // Section banner: "D&E TASK GROUP TOTAL", "FIELD TASK GROUPS TOTAL", "OTHER".
    // Tested before the stage check, because "D&E TASK GROUP TOTAL" also
    // starts with a stage prefix.
    if (/TASK GROUPS? TOTAL$/.test(c0) || c0 === "OTHER") {
      section = c0 === "OTHER" ? "OTHER" : c0.replace(/\s*TASK GROUPS? TOTAL$/, "").trim();
      sections.push({ section, ...measures(row) });
      continue;
    }

    // Intra-section subtotals are recomputed from the detail lines, never read.
    if (!c0 && /TASK GROUP TOTAL/i.test(c1)) continue;

    // Quantity-tracking rows carry no money: their "Projections Total" and
    // "Variance" columns hold *quantities*, so they are kept apart from costs
    // and would corrupt any cost rollup they were mixed into.
    if (STAGES[c0] && !isCostCode(c0)) {
      const m = measures(row);
      quantities.push({
        section, stage: c0, stageLabel: STAGES[c0], product: c1,
        estQty: m.estQty, projQty: m.projCost, actQty: m.actQty,
        varianceQty: m.variance, pctProj: m.pctProj,
      });
      continue;
    }

    const line = { section, code: c0, desc: c1, ...measures(row) };

    // 90.100 BUDGET - CONTINGENCY is printed *below* the Job Totals row and is
    // excluded from it. It is held separately so it can be shown without
    // silently inflating any total. See CLAUDE.md §13.
    if (afterTotals) { if (!contingency) contingency = line; continue; }
    costs.push(line);
  }

  return { job, costs, quantities, sections, jobTotals, contingency };
}

import { COST_TO_PRODUCTION } from "./plants.js";

/**
 * Every plant name the app already knows, from the single place that mapping
 * lives (§13). Used only as a fallback reading of a drifted filename.
 */
const KNOWN_PLANTS = Object.keys(COST_TO_PRODUCTION);

/**
 * Derive the plant from the export's filename.
 *
 * **This is the one place in the app where a filename carries meaning**, and it
 * is unavoidable: the workbook has one worksheet per job and carries no plant
 * field anywhere (§13). The plant is also the library key, so getting it wrong
 * does not just mislabel a source — it files the report under a plant nobody
 * has, instead of replacing the one it should.
 *
 * Names drift, because these are downloaded weekly and a re-download arrives as
 * "... (1).xlsx". So three readings are tried, in order of how much they prove:
 *
 *   1. the documented shape, "<Plant> Job Cost Report - Active Jobs.xlsx"
 *   2. a plant we already know (plants.js) appearing anywhere in the name —
 *      this is what rescues "Copy of ashland city (1).xlsx"
 *   3. the filename itself, cleaned up
 *
 * It never returns "", because an empty library key would collide with every
 * other unnamed source and silently overwrite it. Step 3 can still produce a
 * plant no one recognises; that is visible rather than silent, since an
 * unmapped plant shows as unmatched against production (`plants.js`).
 */
export function plantFromFileName(fileName) {
  const base = text(fileName)
    .replace(/\.(xlsx?|csv)$/i, "")
    // "(1)", "copy", "copy 2" — what a browser and a Finder duplicate add.
    .replace(/[\s._-]*\((\d+)\)\s*$/i, "")
    .replace(/[\s._-]*\bcopy(\s*\d+)?\s*$/i, "")
    .trim();

  const m = base.match(/^(.*?)\s*[-—]?\s*Job\s*Cost\s*Report/i);
  const guess = m ? m[1].trim() : "";
  if (guess) return guess;

  // A plant we already know, matched on the same normalisation core/parse.js
  // uses for headers, so "ashland_city" and "Ashland City" are one plant.
  const flat = (v) => String(v).toLowerCase().replace(/[^a-z0-9]/g, "");
  const haystack = flat(base);
  const known = KNOWN_PLANTS.filter((p) => haystack.includes(flat(p)))
    // Longest first, so a plant whose name contains another's wins.
    .sort((a, b) => flat(b).length - flat(a).length)[0];
  if (known) return known;

  return base || text(fileName) || "Unnamed plant";
}

/**
 * Assemble one library source from a whole workbook.
 *
 * `sheets` is [{ name, aoa }]. `plant` identifies the source and is what a
 * re-import overwrites, so it is the library key.
 */
export function buildSource(sheets, { plant, fileName, fileDate = "" }) {
  const jobs = [];
  const costs = [];
  const quantities = [];
  const warnings = [];
  const skipped = [];

  for (const { name, aoa } of sheets) {
    const parsed = parseJobSheet(aoa, name);
    if (!parsed) { skipped.push(name); continue; }
    const { job, costs: c, quantities: q, sections, jobTotals, contingency } = parsed;
    const key = `${plant}|${job.jobNo}`;

    jobs.push({
      ...job, plant, sheet: name, key,
      sections,
      contingency,
      // Totals come from the report's own Job Totals row when it has one, and
      // are recomputed from the detail lines when it does not, so a job always
      // has a comparable set of figures.
      totals: jobTotals || c.reduce(
        (t, x) => ({
          estQty: 0, pctProj: 0, variance: t.variance + x.variance,
          estCost: t.estCost + x.estCost, projCost: t.projCost + x.projCost,
          curMo: t.curMo + x.curMo, actQty: 0, actCost: t.actCost + x.actCost,
        }),
        { estQty: 0, estCost: 0, projCost: 0, curMo: 0, actQty: 0, actCost: 0, variance: 0, pctProj: 0 }
      ),
      hasJobTotals: Boolean(jobTotals),
    });

    for (const x of c) costs.push({ ...x, plant, jobNo: job.jobNo, jobKey: key });
    for (const x of q) quantities.push({ ...x, plant, jobNo: job.jobNo, jobKey: key });
  }

  if (skipped.length) {
    warnings.push(`${skipped.length} sheet(s) carried no job header and were skipped: ${skipped.slice(0, 6).join(", ")}${skipped.length > 6 ? "…" : ""}`);
  }
  if (!jobs.length) {
    throw new Error(
      `No job sheets found in "${fileName}". A Job Cost Report has one worksheet per job, ` +
      `each with the job number and name in cell A3 and a "Task / Description" header on row 8.`
    );
  }

  const asOf = jobs.map((j) => j.asOf).filter(Boolean).sort();
  const mixed = new Set(asOf);
  if (mixed.size > 1) {
    warnings.push(`Sheets carry more than one "As of" date (${[...mixed].join(", ")}); the latest is used.`);
  }

  return {
    id: plant,
    plant,
    fileName,
    // The report's own cut-off, printed inside it ("As of 8/26/2026").
    asOf: asOf[asOf.length - 1] || "",
    // When the *file* was last written, which is a different question and the
    // only age signal the other exports have at all. Blank on sources imported
    // before this was captured — rendered as unknown, never as a guess.
    fileDate,
    importedAt: new Date().toISOString(),
    jobs, costs, quantities, warnings,
  };
}
