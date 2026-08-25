/**
 * Concrete Vision — Scheduled Production Report (Detail).
 *
 * One row = one scheduled piece, on one bed, on one date, at one plant. The
 * report is forward-looking: these are pours that are *scheduled*, not poured.
 *
 * See CLAUDE.md §11 for the full profile of the source export.
 */

/** Bed comments arrive with literal markup and an "N/A" sentinel. */
function cleanComment(v) {
  const s = String(v ?? "").trim();
  if (!s || s.toUpperCase() === "N/A") return "";
  return s
    .replace(/<[^>]*>/g, " ")          // strip the <b>Bed Comment:</b> wrapper
    .replace(/^\s*Bed Comment:\s*/i, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "43134 - 1401 CHURCH STREET" -> { jobNo: "43134", jobTitle: "1401 CHURCH STREET" }
 *
 * Job numbers are not always purely numeric -- the export also carries
 * "P10031", "45112P2", "45166P2" -- so the leading token is alphanumeric.
 * A string with no leading token becomes all title rather than being
 * force-split, so an unexpected format degrades instead of losing the name.
 */
function splitJob(v) {
  const s = String(v ?? "").trim();
  const m = s.match(/^([A-Za-z0-9]+)\s*-\s*(.+)$/);
  return m ? { jobNo: m[1], jobTitle: m[2].trim() } : { jobNo: "", jobTitle: s };
}

/** "1 - Engineering" -> "Engineering". Blank on non-pour rows. */
function phaseLabel(v) {
  const s = String(v ?? "").trim();
  const m = s.match(/^\d+\s*-\s*(.+)$/);
  return m ? m[1].trim() : s;
}

export const productionSchema = {
  id: "production",
  fields: [
    { key: "plant", label: "Plant", type: "string", required: true,
      aliases: ["plant name", "facility", "location"] },
    { key: "date", label: "Bed Date", type: "date", required: true,
      aliases: ["date", "pour date", "cast date", "scheduled date", "beddate"] },
    { key: "bed", label: "Bed Name", type: "string", required: true,
      aliases: ["bed", "bedname", "form", "pad"] },
    { key: "leadman", label: "Leadman", type: "string", required: false,
      aliases: ["lead man", "foreman", "crew lead"] },
    { key: "phase", label: "Phase", type: "string", required: false,
      aliases: ["job phase", "building"] },
    { key: "mold", label: "Mold", type: "string", required: false },
    { key: "mark", label: "Piece Mark", type: "string", required: false,
      aliases: ["piecemark", "mark", "piece"] },
    { key: "qty", label: "Qty", type: "number", required: true,
      aliases: ["quantity", "pieces", "piece count"] },
    { key: "sf", label: "Total SF", type: "number", required: false,
      aliases: ["sf", "square feet", "sq ft", "totalsf", "area"] },
    { key: "cy", label: "Total CY", type: "number", required: false,
      aliases: ["cy", "cubic yards", "totalcy", "volume", "concrete"] },
    { key: "lf", label: "Total LF", type: "number", required: false,
      aliases: ["lf", "linear feet", "totallf", "length"] },
    { key: "pos", label: "Pos", type: "number", required: false,
      aliases: ["position", "bed position"] },
    { key: "cert", label: "Cert", type: "string", required: false,
      aliases: ["certification", "cert code"] },
    { key: "job", label: "Job Name", type: "string", required: true,
      aliases: ["job", "project", "jobname", "project name"] },
    { key: "comment", label: "Bed Comment", type: "string", required: false,
      aliases: ["comment", "bedcomment", "notes", "remarks"] },
    { key: "prdCode", label: "Prd Code", type: "string", required: false,
      aliases: ["product code", "prdcode", "product"] },
    { key: "crossSection", label: "Cross Section", type: "string", required: false,
      aliases: ["crosssection", "section", "shape"] },
    { key: "castNo", label: "Cast No.", type: "string", required: false,
      aliases: ["cast no", "castno", "cast number"] },
    { key: "ctrlNum", label: "CTRL Num", type: "string", required: false,
      aliases: ["ctrl num", "ctrlnum", "control number", "control num"] },
    { key: "pourNo", label: "Pour No.", type: "string", required: false,
      aliases: ["pour no", "pourno", "pour number"] },
  ],

  derive: (row) => {
    const { jobNo, jobTitle } = splitJob(row.job);
    return {
      jobNo,
      jobTitle,
      phaseName: phaseLabel(row.phase),
      note: cleanComment(row.comment),
      // A row with no quantity is bed activity (a mold build, maintenance),
      // not production. It never carries SF/CY/LF, so it contributes nothing
      // to any total -- but it does occupy the bed, so it is kept and shown.
      isPour: (row.qty || 0) > 0,
      // Beds are plant-scoped in the source, but key on both so a future
      // export that reuses a bed name across plants can't silently merge them.
      bedKey: `${row.plant} · ${row.bed}`,
    };
  },

  /**
   * Only a row that can't be placed on the calendar is useless. Notably NOT
   * dropped on qty === 0: an occupied bed is real schedule information.
   */
  isEmptyRow: (row) => !row.date || !row.plant || !row.bed,
};

export default productionSchema;
