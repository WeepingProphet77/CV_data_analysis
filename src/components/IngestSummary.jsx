/**
 * What the last import actually took in.
 *
 * "Is it counting everything in the file?" was unanswerable from the page: the
 * only evidence was an entry count with nothing to compare it against, and the
 * import notes — including "a sheet was not read" — sat behind a collapsed
 * disclosure. So a parser that quietly dropped rows looked exactly like one
 * that did not.
 *
 * This states the arithmetic instead: rows kept, out of rows offered, from how
 * many sheets. It is quiet when everything was read and loud when it was not,
 * which is the only way a reader can tell those two apart at a glance.
 */
import React from "react";
import { count } from "../core/format.js";

export default function IngestSummary({ meta }) {
  // Imports made before these fields existed have nothing to report; saying
  // nothing is right, since claiming completeness we cannot show would be worse.
  if (!meta || meta.recordsRead == null) return null;

  const { recordsRead, dropped = 0, rowCount = 0, sheetsRead = [], sheetsSkipped = [] } = meta;
  const skipped = sheetsSkipped.length;
  const clean = dropped === 0 && skipped === 0;

  const sheets =
    sheetsRead.length > 1
      ? ` from all ${sheetsRead.length} matching sheets`
      : sheetsRead.length === 1 && sheetsRead[0].name
        ? ` from sheet "${sheetsRead[0].name}"`
        : "";

  if (clean) {
    return (
      <p className="hint" style={{ marginBottom: 12 }}>
        {`Read every row: ${count(rowCount)} of ${count(recordsRead)}${sheets}.`}
      </p>
    );
  }

  return (
    <div className="notice amber">
      <strong>{`Read ${count(rowCount)} of ${count(recordsRead)} rows${sheets}.`}</strong>{" "}
      {dropped > 0 &&
        `${count(dropped)} row(s) were skipped as blank or zero — they carry no hours or quantities. `}
      {skipped > 0 && (
        <>
          {`${skipped} sheet(s) in the workbook were not read: `}
          {sheetsSkipped.map((s) => `"${s.name}" (${s.why})`).join(", ")}
          {`. If one of those holds data, this import is incomplete.`}
        </>
      )}
    </div>
  );
}
