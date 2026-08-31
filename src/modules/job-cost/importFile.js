/**
 * Reading a Job Cost Report workbook from a File.
 *
 * SheetJS is imported dynamically so the ~500KB parser stays a separate chunk
 * (CLAUDE.md §4). Keep it that way: never add a top-level `import * as XLSX`.
 *
 * Everything after "get the sheets as arrays-of-arrays" lives in ./parse.js,
 * which is pure and node-importable.
 */
import { buildSource, plantFromFileName } from "./parse.js";
import { isoFromMtime } from "../../core/parse.js";

/**
 * readJobCostFile(file, { plant }) -> a library source.
 *
 * `plant` overrides the name derived from the filename; it is the library key,
 * so re-importing the same plant replaces that plant and nothing else.
 */
export async function readJobCostFile(file, { plant } = {}) {
  if (!file) throw new Error("No file selected.");

  const name = file.name || "";
  if (!/\.(xlsx|xls)$/i.test(name)) {
    throw new Error(
      `"${name}" is not a workbook. A Job Cost Report exports as .xlsx or .xls — ` +
      "it has one worksheet per job, which a CSV cannot carry."
    );
  }

  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  const sheets = wb.SheetNames.map((n) => ({
    name: n,
    aoa: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true }),
  }));

  return buildSource(sheets, {
    plant: plant || plantFromFileName(name),
    fileName: name,
    // How old the file itself is — the question "do I need to refresh this?"
    // is asked of every source, and only the flat-table parser was answering it.
    fileDate: isoFromMtime(file.lastModified),
  });
}
