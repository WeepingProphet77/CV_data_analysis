/**
 * Cost-code taxonomy.
 *
 * The report groups lines into four sections it prints itself — D&E,
 * PRODUCTION, FIELD and OTHER — and those are read from the sheet rather than
 * inferred. The two-digit code prefix gives a finer cut *within* a section, and
 * it is clean: across all 126 profiled jobs every prefix falls under exactly
 * one section, so a category never straddles two.
 *
 * An unrecognised prefix is labelled by the code itself rather than dropped —
 * a new cost code should appear as its own row, not vanish into a bucket.
 */

/** The report's own section banners, in the order it prints them. */
export const SECTIONS = ["D&E", "PRODUCTION", "FIELD", "OTHER"];

export const SECTION_LABELS = {
  "D&E": "Design & Engineering",
  PRODUCTION: "Production",
  FIELD: "Field",
  OTHER: "Other",
};

const BY_PREFIX = {
  20: { id: "materials", label: "Materials", section: "PRODUCTION" },
  33: { id: "materials", label: "Materials", section: "PRODUCTION" },
  30: { id: "prod-labor", label: "Production Labor", section: "PRODUCTION" },
  25: { id: "delivery", label: "Delivery & Erection", section: "FIELD" },
  40: { id: "field-labor", label: "Field Labor", section: "FIELD" },
  41: { id: "field-labor", label: "Field Labor", section: "FIELD" },
  60: { id: "engineering", label: "Engineering & Drafting", section: "D&E" },
  55: { id: "hauling", label: "Hauling", section: "OTHER" },
  70: { id: "work-orders", label: "Work Orders", section: "OTHER" },
  90: { id: "budget", label: "Budget", section: "OTHER" },
};

/** Category for a cost code such as "20.100" or the suffixed "70.000A". */
export function categoryOf(code) {
  const prefix = Number(String(code).slice(0, 2));
  return BY_PREFIX[prefix] || { id: `code-${prefix || "?"}`, label: `Code ${prefix || "?"}xx`, section: "" };
}

/** Every category label, ordered by section then label — for filter options. */
export function categoryOptions() {
  const seen = new Map();
  for (const v of Object.values(BY_PREFIX)) if (!seen.has(v.id)) seen.set(v.id, v);
  return [...seen.values()].sort(
    (a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.label.localeCompare(b.label)
  );
}
