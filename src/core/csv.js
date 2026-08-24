/**
 * RFC 4180 CSV reader.
 *
 * Kept in-house so a .csv import costs nothing at load time — the ~430KB
 * SheetJS bundle is only fetched when an actual .xlsx/.xls is opened.
 * Handles quoted fields, escaped quotes, embedded newlines and commas,
 * CRLF/LF/CR line endings, and a UTF-8 BOM.
 */

/** Split CSV text into an array of string arrays. */
export function parseCsv(text, delimiter = ",") {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let i = 0;

  while (i < src.length) {
    const c = src[i];

    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }  // escaped ""
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }

    if (c === '"') { quoted = true; i++; continue; }
    if (c === delimiter) { row.push(field); field = ""; i++; continue; }
    if (c === "\r" || c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
      i += c === "\r" && src[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += c; i++;
  }

  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Guess the delimiter from the header line — exports vary by locale. */
export function sniffDelimiter(text) {
  const line = text.slice(0, 4000).split(/\r?\n/)[0] || "";
  const counts = [",", ";", "\t", "|"].map((d) => [d, (line.match(new RegExp(`\\${d}`, "g")) || []).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/**
 * CSV text -> records keyed by header, mirroring what SheetJS returns so the
 * two ingest paths converge on one shape.
 */
export function csvToRecords(text) {
  const rows = parseCsv(text, sniffDelimiter(text)).filter((r) => r.some((c) => c !== ""));
  if (!rows.length) return { headers: [], records: [] };

  const headers = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((cells) => {
    const rec = {};
    headers.forEach((h, i) => { rec[h] = cells[i] ?? ""; });
    return rec;
  });
  return { headers, records };
}
