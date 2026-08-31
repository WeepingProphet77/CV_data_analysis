/**
 * Reading a Missing Piece Mark Ticket workbook from a File.
 *
 * SheetJS is imported dynamically so the ~500KB parser stays a separate chunk
 * (CLAUDE.md §4). Keep it that way: never add a top-level `import * as XLSX`.
 *
 * Everything after "get the sheet as an array-of-arrays" lives in
 * ./ticketParse.js, which is pure and node-importable.
 */
import { buildTicketSource } from "./ticketParse.js";
import { isoFromMtime } from "../../core/parse.js";

export async function readTicketFile(file) {
  if (!file) throw new Error("No file selected.");

  const name = file.name || "";
  if (!/\.(xlsx|xls)$/i.test(name)) {
    throw new Error(
      `"${name}" is not a workbook. The Missing Piece Mark Ticket report exports as ` +
      ".xlsx — it is a grouped report with banner rows, which a CSV flattens away."
    );
  }

  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1, raw: true, defval: null, blankrows: true,
  });

  const src = buildTicketSource(aoa, { fileName: name, fileDate: isoFromMtime(file.lastModified) });
  if (!src.rows.length) {
    throw new Error(
      `No missing-ticket rows were found in "${name}". If every piece in the ` +
      "reported range has its ticket, that is good news — but check the range " +
      "the report was run over before reading it that way."
    );
  }
  return src;
}
