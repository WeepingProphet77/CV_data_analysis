/**
 * One job's cost lines, arranged the way a person dissects the report:
 * section, then category, then line.
 *
 * The report prints four sections (D&E, PRODUCTION, FIELD, OTHER) and one
 * subtotal per section. That is too coarse to read a job by: Production alone
 * mixes materials and labor, and D&E mixes in-house drafting with outsourced
 * contracts that are not even the same kind of number (§13). So each section is
 * split one level further:
 *
 *   D&E        by discipline, from the 60.x sub-prefix (engineering.js) —
 *              Drafting / Engineering / Checking / Outsourced
 *   elsewhere  by category, from the two-digit code prefix (categories.js) —
 *              Materials / Production Labor, Delivery & Erection / Field Labor …
 *
 * Both groupings already exist and are already tested; this file only arranges
 * lines by them. Every subtotal is recomputed from the lines under it, never
 * read from the sheet, so what is on screen is exactly what is summed.
 *
 * Plain ESM, node-importable. The invariants the tests hold it to: every line
 * lands in exactly one group, groups sum to their section, and sections sum to
 * the lines.
 */

import { SECTIONS, SECTION_LABELS, categoryOf } from "./categories.js";
import { disciplineOf, DISCIPLINE_ORDER } from "./engineering.js";

/** The money measures every total row carries, variance included (§13). */
export const MEASURES = ["estCost", "projCost", "curMo", "actCost", "variance"];

/** Sum each measure over a set of lines. Missing values count as 0. */
export function totalsOf(lines) {
  const t = {};
  for (const k of MEASURES) t[k] = lines.reduce((s, c) => s + (c[k] || 0), 0);
  // Completion is a ratio of the summed figures, never an average of per-line
  // percentages; with nothing projected it is unknown, not zero.
  t.pctProj = t.projCost > 0 ? t.actCost / t.projCost : null;
  t.over = t.projCost > 0 && t.actCost > t.projCost;
  return t;
}

/** The group a line belongs to within its section. */
export function groupOf(line) {
  if (line.section === "D&E") {
    const d = disciplineOf(line.code);
    return { id: `de-${d.id}`, label: d.label };
  }
  const c = categoryOf(line.code);
  return { id: c.id, label: c.label };
}

const byCode = (a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true });

/** D&E groups in discipline order; everything else in the order its codes run. */
function groupRank(section, group) {
  if (section !== "D&E") return null;
  const i = DISCIPLINE_ORDER.indexOf(group.id.replace(/^de-/, ""));
  return i === -1 ? DISCIPLINE_ORDER.length : i;
}

/**
 * groupReport(lines) -> { sections: [...], totals }
 *
 * Sections come in the order the report prints them, then any section the
 * report carries that this app does not know yet (kept, never dropped).
 * Each section: { section, label, totals, groups: [{ id, label, totals, lines }] }.
 */
export function groupReport(lines = []) {
  const present = SECTIONS.filter((s) => lines.some((c) => c.section === s));
  const extra = [...new Set(lines.map((c) => c.section))].filter((s) => !SECTIONS.includes(s));

  const sections = [...present, ...extra].map((section) => {
    const inSection = lines.filter((c) => c.section === section).sort(byCode);

    const groups = new Map();
    for (const line of inSection) {
      const g = groupOf(line);
      if (!groups.has(g.id)) groups.set(g.id, { ...g, lines: [] });
      groups.get(g.id).lines.push(line);
    }

    const ordered = [...groups.values()]
      .map((g) => ({ ...g, totals: totalsOf(g.lines) }))
      .sort((a, b) => {
        const ra = groupRank(section, a);
        const rb = groupRank(section, b);
        if (ra != null && rb != null && ra !== rb) return ra - rb;
        return byCode(a.lines[0], b.lines[0]);
      });

    return {
      section,
      label: SECTION_LABELS[section] || section || "Unsectioned",
      totals: totalsOf(inSection),
      groups: ordered,
      lineCount: inSection.length,
    };
  });

  return { sections, totals: totalsOf(lines) };
}
