/**
 * Schema-driven ingest for Concrete Vision exports.
 *
 * Every module declares a schema (see e.g. modules/employee-time/schema.js);
 * this file turns a user-selected .csv/.xlsx/.xls into typed rows against that
 * schema. Column matching is alias-based and case/whitespace/punctuation
 * insensitive, so an export whose headers drift slightly — or that carries one
 * of Concrete Vision's own misspellings, like "Deptment" — still loads.
 *
 * Everything runs in the browser. No file ever leaves the machine.
 */
import { csvToRecords } from "./csv.js";

/** Normalize a header for matching: lowercase, alphanumerics only. */
const norm = (s) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/* -- Cell coercion ------------------------------------------------------ */

/** Excel serial day -> ISO date. Day 25569 is the 1970 epoch. */
function serialToIso(serial) {
  const ms = Math.round((serial - 25569) * 86_400_000);
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  // Serials are timezone-free, so read the UTC parts verbatim.
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function toIsoDate(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return serialToIso(v);
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);          // 2026-03-14
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);      // 3/14/2026
  if (m) {
    const yr = m[3].length === 2 ? String(2000 + +m[3]) : m[3];
    return `${yr}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  const d = new Date(s);                                     // last resort
  if (!Number.isNaN(d.getTime())) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return "";
}

export function toNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  // Strip currency symbols, thousands separators and stray spaces;
  // read a parenthesized figure as negative, the way accounting exports write it.
  const s = String(v).trim();
  const neg = /^\(.*\)$/.test(s);
  const n = parseFloat(s.replace(/[()]/g, "").replace(/[^0-9.eE+-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

const toText = (v) => (v == null ? "" : String(v).trim());

/* -- Reading a file ----------------------------------------------------- */

const isExcel = (name) => /\.(xlsx|xlsm|xlsb|xls)$/i.test(name);

/**
 * Read a File into { records, headers, sheetName, sheetNames }.
 *
 * CSV goes through the local reader. Excel pulls in SheetJS on demand, so the
 * initial page load never pays for a parser most imports don't need.
 */
async function readRecords(file) {
  if (!isExcel(file.name)) {
    const { headers, records } = csvToRecords(await file.text());
    return { records, headers, sheetName: null, sheetNames: [] };
  }

  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, raw: true });
  if (!wb.SheetNames.length) throw new Error(`${file.name} contains no sheets.`);
  const sheetName = wb.SheetNames[0];
  const records = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: true });
  return {
    records,
    headers: records.length ? Object.keys(records[0]) : [],
    sheetName,
    sheetNames: wb.SheetNames,
  };
}

/* -- Column mapping ----------------------------------------------------- */

/**
 * Match each schema field to a column present in the file.
 * Returns { mapping: {fieldKey: header}, missing: [field], unmapped: [header] }.
 */
export function mapColumns(headers, schema) {
  const byNorm = new Map(headers.map((h) => [norm(h), h]));
  const mapping = {};
  const missing = [];

  for (const field of schema.fields) {
    const candidates = [field.key, field.label, ...(field.aliases || [])];
    let header = candidates.map(norm).map((n) => byNorm.get(n)).find(Boolean);

    // Fall back to a containment match ("Job Name (Full)" for alias "job name")
    if (!header) {
      const wanted = candidates.map(norm);
      header = headers.find((h) => wanted.some((w) => w && norm(h).includes(w)));
    }
    if (header) mapping[field.key] = header;
    else if (field.required) missing.push(field);
  }

  const used = new Set(Object.values(mapping));
  return { mapping, missing, unmapped: headers.filter((h) => !used.has(h)) };
}

/* -- Public API --------------------------------------------------------- */

/**
 * Parse a File into typed rows for `schema`.
 * Resolves to { rows, meta } or rejects with a message safe to show the user.
 */
export async function parseFile(file, schema) {
  const { records, headers, sheetName, sheetNames } = await readRecords(file);

  if (!records.length) throw new Error(`No data rows found in "${file.name}".`);

  const { mapping, missing, unmapped } = mapColumns(headers, schema);

  if (missing.length) {
    throw new Error(
      `"${file.name}" is missing required column(s): ${missing
        .map((f) => f.label)
        .join(", ")}.\n\nColumns found: ${headers.join(", ")}`
    );
  }

  const coerce = { date: toIsoDate, number: toNumber, string: toText };
  const warnings = [];
  let dropped = 0;

  const rows = [];
  for (const rec of records) {
    const row = {};
    for (const field of schema.fields) {
      const header = mapping[field.key];
      const raw = header == null ? undefined : rec[header];
      row[field.key] = (coerce[field.type] || toText)(raw);
    }
    if (schema.derive) Object.assign(row, schema.derive(row, rec));
    if (schema.isEmptyRow?.(row)) { dropped++; continue; }
    rows.push(row);
  }

  if (dropped) warnings.push(`${dropped} blank or zero row(s) skipped.`);
  if (unmapped.length) warnings.push(`Unused columns: ${unmapped.join(", ")}`);
  if (sheetNames.length > 1)
    warnings.push(`Read sheet "${sheetName}" of ${sheetNames.length} in the workbook.`);

  return {
    rows,
    meta: {
      fileName: file.name,
      fileDate: new Date(file.lastModified).toISOString().slice(0, 10),
      importedAt: new Date().toISOString(),
      rowCount: rows.length,
      sheetName,
      headers,
      mapping,
      warnings,
    },
  };
}
