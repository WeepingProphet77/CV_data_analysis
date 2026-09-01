/**
 * Locating the real exports on disk, without depending on what they are called.
 *
 * The exports are gitignored (CLAUDE.md §1) and re-downloaded whenever someone
 * refreshes a report, so their names drift: a second download of the timesheet
 * arrives as "EmpTimeExport (1).xls", a report re-run from Concrete Vision may
 * be saved under any name at all. The suites used to name each file exactly,
 * which meant a renamed export *silently skipped* every real-data check that
 * depended on it while the run still reported all green — the worst possible
 * failure, because nothing announces that a check went away.
 *
 * So a file is identified by what is **inside** it. The name is only ever a
 * hint that decides which candidate to open first.
 */
import { readdirSync, statSync } from "node:fs";

const WORKBOOK = /\.(xlsx|xls)$/i;
/** Excel writes "~$name.xlsx" lock files beside an open workbook. */
const LOCK = /^~\$/;

/** Normalize a header the way core/parse.js does, so signatures compare alike. */
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Every workbook in `dir`, newest first, with any name-hint matches promoted to
 * the front. Newest-first matters: a re-download is the file someone means.
 */
function candidates(dir, hint) {
  const files = readdirSync(dir)
    .filter((f) => WORKBOOK.test(f) && !LOCK.test(f))
    .map((f) => ({ f, mtime: statSync(`${dir}/${f}`).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map((x) => x.f);
  if (!hint) return files;
  const named = files.filter((f) => hint.test(f));
  return [...named, ...files.filter((f) => !named.includes(f))];
}

/**
 * findExport({ dir, hint, identify }) -> { file, byName } | null
 *
 * `identify(file)` must return true only for the export being looked for. It is
 * what actually decides, so a lying filename is caught and an honest one that
 * nobody predicted still works.
 */
export function findExport({ dir = ".", hint, identify }) {
  for (const file of candidates(dir, hint)) {
    let ok = false;
    // A workbook that cannot be opened or sniffed is simply not this export.
    try { ok = identify(`${dir}/${file}`, file); } catch { ok = false; }
    if (ok) return { file: dir === "." ? file : `${dir}/${file}`, byName: Boolean(hint?.test(file)) };
  }
  return null;
}

/**
 * A content test for a flat table: every header in `signature` must be present.
 *
 * Signatures are the columns that make an export *that* export — "Bed Date" and
 * "Piece Mark" are the schedule and nothing else. Requiring the schema's whole
 * required set is not enough on its own, because core/parse.js falls back to
 * substring containment and two exports both carrying a date and a job name can
 * satisfy each other's schema.
 */
export function headerSignature(XLSX, signature) {
  const want = signature.map(norm);
  return (path) => {
    const wb = XLSX.read(readFileSyncCached(path), { type: "buffer", sheetRows: 1 });
    if (!wb.SheetNames.length) return false;
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
    const have = new Set((aoa[0] || []).map(norm));
    return want.every((w) => have.has(w));
  };
}

/**
 * Sniffing reads only the header row (`sheetRows: 1`), but the file still has to
 * come off disk; a 5MB .xls in the candidate list would otherwise be read once
 * per export being resolved.
 */
import { readFileSync } from "node:fs";
const cache = new Map();
function readFileSyncCached(path) {
  if (!cache.has(path)) cache.set(path, readFileSync(path));
  return cache.get(path);
}

/** Say how it was found, so a run never leaves you guessing which file it used. */
export const describeFound = (found, what) =>
  found
    ? `${what} — ${found.file}${found.byName ? "" : " (matched on content; the name did not say)"}`
    : `${what} — not present, skipped`;
