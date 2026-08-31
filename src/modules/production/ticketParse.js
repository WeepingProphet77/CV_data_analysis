/**
 * Concrete Vision — Missing Piece Mark Ticket report.
 *
 * Same database as the Scheduled Production Report, but a different *shape*:
 * this one is a **grouped report**, not a flat table, so it does not go through
 * core/parse.js. Rows are nested plant > job > piece, with a banner row opening
 * each group and a "Total Pieces: N" row closing it:
 *
 *   row 0    (blank) (blank) Plant Name | Job Num | Job Name | Piece Mark | ...
 *   row 1    "Ashland City (100 pieces)"                       <- col A banner
 *   row 2      "43134 - TITLE (Gate - Bre) - 25 pieces"        <- col B banner
 *   row 3        (blank) (blank) Ashland City | 43134 | ...    <- detail, col C+
 *   ...
 *              "Total Pieces: 25"                              <- col F subtotal
 *              "<strong>Grand Total: 213</strong>"             <- col F, literal HTML
 *
 * The detail rows are self-describing — each carries its own plant, job number
 * and job name — so the banners are not needed to read a row. They are still
 * walked, because their declared piece counts are the report's own arithmetic
 * and reconciling against them is what proves the walk classified every row
 * correctly. That is the same check that makes the job cost figures trustworthy
 * (CLAUDE.md §13), and it is asserted in scripts/production-test.mjs.
 *
 * Pure ESM, no JSX, node-importable — the test scripts import it directly.
 */
import { toIsoDate, toNumber } from "../../core/parse.js";

/** Fixed column positions, verified across every group in the real export. */
export const TCOL = {
  plantBanner: 0,
  jobBanner: 1,
  plant: 2,
  jobNo: 3,
  jobName: 4,
  mark: 5,
  drawnBy: 6,
  length: 7,
  width: 8,
  depth: 9,
  weight: 10,
  sf: 11,
  cy: 12,
  lf: 13,
  date: 14,
};

const text = (v) => (v == null ? "" : String(v).trim());

/** The report writes its grand total inside literal markup, as bed comments do. */
const stripTags = (s) => s.replace(/<[^>]*>/g, "").trim();

/**
 * "Ashland City (100 pieces)" -> { plant, declared }
 * A banner that doesn't carry a count still names the plant; the count becomes
 * null rather than 0, so "not stated" can't be read as "no pieces".
 */
export function parsePlantBanner(v) {
  const s = text(v);
  const m = s.match(/^(.*?)\s*\((\d+)\s+pieces?\)\s*$/i);
  return m ? { plant: m[1].trim(), declared: +m[2] } : { plant: s, declared: null };
}

/**
 * "43134 - 1401 CHURCH STREET (Gate - Bre) - 25 pieces"
 *   -> { jobNo, jobTitle, group: "Gate - Bre", declared: 25 }
 *
 * The parenthesised code is only ever in the banner — no detail row carries it —
 * which is the sole reason the banners are parsed for content rather than just
 * counted. Observed values are "Gate - Bre/Ash/Kis/Win" and "UA"; what they
 * denote is an open question (CLAUDE.md §10), so it is surfaced verbatim and
 * labelled "Drafting group" rather than interpreted.
 */
export function parseJobBanner(v) {
  const s = text(v);
  const m = s.match(/^(\S+)\s+-\s+(.*?)\s*(?:\(([^()]*)\))?\s*-\s*(\d+)\s+pieces?\s*$/i);
  if (m) {
    return { jobNo: m[1], jobTitle: m[2].trim(), group: (m[3] || "").trim(), declared: +m[4] };
  }
  // Degrade rather than lose the group: an unrecognised banner still names a
  // job, and its rows are self-describing anyway.
  const alt = s.match(/^(\S+)\s+-\s+(.+)$/);
  return alt
    ? { jobNo: alt[1], jobTitle: alt[2].trim(), group: "", declared: null }
    : { jobNo: "", jobTitle: s, group: "", declared: null };
}

const TOTAL_RE = /^total\s+pieces:\s*(\d+)/i;
const GRAND_RE = /^grand\s+total:\s*(\d+)/i;

/**
 * buildTicketSource(aoa, { fileName }) -> { rows, jobs, plants, range, totals, warnings }
 *
 * `aoa` is the worksheet as an array of arrays (raw values, blanks as null).
 * One output row = one piece that has no ticket.
 */
export function buildTicketSource(aoa, { fileName = "", fileDate = "" } = {}) {
  const warnings = [];

  // The header row is the one naming the columns; found rather than assumed, so
  // a report that grows a title row above it still parses.
  const headerIdx = aoa.findIndex(
    (r) => /^plant\s*name$/i.test(text(r?.[TCOL.plant])) && /^job\s*num/i.test(text(r?.[TCOL.jobNo]))
  );
  if (headerIdx < 0) {
    throw new Error(
      `"${fileName || "This file"}" doesn't look like a Missing Piece Mark Ticket report — ` +
      "no row was found with Plant Name and Job Num as column headers. " +
      "Export the report from Concrete Vision and upload the .xlsx it produces."
    );
  }
  const headers = aoa[headerIdx].map(text).filter(Boolean);

  const rows = [];
  const plants = [];
  const jobs = [];
  let plant = null;
  let job = null;
  let grandTotal = null;

  /** Close the open job/plant group, comparing its declared count to what was walked. */
  const closeJob = () => {
    if (!job) return;
    if (job.declared != null && job.declared !== job.pieces) {
      warnings.push(
        `Job ${job.jobNo}: banner declares ${job.declared} piece(s), ${job.pieces} row(s) found.`
      );
    }
    jobs.push(job);
    job = null;
  };
  const closePlant = () => {
    closeJob();
    if (!plant) return;
    if (plant.declared != null && plant.declared !== plant.pieces) {
      warnings.push(
        `${plant.plant}: banner declares ${plant.declared} piece(s), ${plant.pieces} row(s) found.`
      );
    }
    plants.push(plant);
    plant = null;
  };

  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    const a = text(r[TCOL.plantBanner]);
    const b = text(r[TCOL.jobBanner]);
    const c = text(r[TCOL.plant]);

    if (a) {
      closePlant();
      const p = parsePlantBanner(a);
      plant = { ...p, pieces: 0, jobs: 0 };
      continue;
    }
    if (b) {
      closeJob();
      const j = parseJobBanner(b);
      job = { ...j, plant: plant?.plant || "", pieces: 0 };
      if (plant) plant.jobs++;
      continue;
    }
    if (c) {
      const mark = text(r[TCOL.mark]);
      const jobNo = text(r[TCOL.jobNo]);
      // A row that can't be keyed can't be joined to the schedule, which is the
      // whole point of holding it. Count it as a warning rather than a silent drop.
      if (!jobNo || !mark) {
        warnings.push(`Row ${i + 1}: skipped — no job number or piece mark.`);
        continue;
      }
      rows.push({
        plant: c,
        jobNo,
        jobTitle: text(r[TCOL.jobName]),
        mark,
        // Sparse in the real export (37 of 213). Blank means the drawing is not
        // assigned to anyone, which is a different problem from assigned-but-late,
        // so it is kept distinguishable rather than defaulted.
        drawnBy: text(r[TCOL.drawnBy]),
        // Feet-and-inches strings ("11'-3 1/4\""), not numbers. Coercing them
        // would read 11'-3 1/4" as 11.
        length: text(r[TCOL.length]),
        width: text(r[TCOL.width]),
        depth: text(r[TCOL.depth]),
        weight: toNumber(r[TCOL.weight]),
        sf: toNumber(r[TCOL.sf]),
        cy: toNumber(r[TCOL.cy]),
        lf: toNumber(r[TCOL.lf]),
        // The bed date as of *this* report's pull. The schedule export carries
        // its own, and they disagree whenever the schedule has moved since —
        // see ticketKey() in tickets.js for why the join ignores both.
        date: toIsoDate(r[TCOL.date]),
        group: job?.group || "",
        key: ticketKeyOf(jobNo, mark),
      });
      if (job) job.pieces++;
      if (plant) plant.pieces++;
      continue;
    }

    const f = stripTags(text(r[TCOL.mark]));
    if (!f) continue;
    const g = f.match(GRAND_RE);
    if (g) { grandTotal = +g[1]; continue; }
    if (TOTAL_RE.test(f)) continue;   // subtotals are recomputed, never read
    warnings.push(`Row ${i + 1}: unrecognised — "${f.slice(0, 60)}".`);
  }
  closePlant();

  if (grandTotal != null && grandTotal !== rows.length) {
    warnings.push(`Grand Total says ${grandTotal} piece(s); ${rows.length} row(s) were read.`);
  }

  const dates = rows.map((r) => r.date).filter(Boolean).sort();

  return {
    fileName,
    // When the file was last written. Blank on reports imported before this
    // was captured — shown as unknown rather than guessed at.
    fileDate,
    headers,
    rows,
    jobs,
    plants,
    grandTotal,
    range: { min: dates[0] || "", max: dates[dates.length - 1] || "" },
    warnings,
  };
}

/**
 * The join key to the production schedule: **job number + piece mark**.
 *
 * Not the bed date. Both reports carry one and they disagree on every piece
 * that overlapped in the real exports — the schedule moves between pulls, and a
 * date-sensitive key would silently unflag a piece the moment it was
 * rescheduled. Not the plant either: job 45154 appears under two plants in the
 * ticket report, and the two systems don't name plants identically anyway.
 *
 * Marks are compared case-insensitively after trimming; nothing else is
 * normalised, because the schedule's "(RL)" suffix is part of the mark.
 */
export function ticketKeyOf(jobNo, mark) {
  return `${String(jobNo ?? "").trim()}|${String(mark ?? "").trim().toUpperCase()}`;
}
