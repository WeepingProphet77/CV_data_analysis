/**
 * Importing a job cost workbook.
 *
 * This module holds a file per plant, each refreshed on its own schedule, so an
 * import overwrites just that plant and leaves the others alone — and several
 * files can be dropped at once. The *listing* of what is loaded is the shared
 * strip now (components/SourceStrip.jsx); only the import belongs here, because
 * only this source reads workbooks and owns the lazy SheetJS import.
 */
import React, { useCallback, useRef, useState } from "react";
import { ErrorBox } from "../../../components/FileImport.jsx";
import { readJobCostFile } from "../importFile.js";

const ACCEPT = ".xlsx,.xls";

function useWorkbookImport(onSource) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(0);

  const ingest = useCallback(
    async (fileList) => {
      const files = [...(fileList || [])];
      if (!files.length) return;
      setError("");
      setBusy(files.length);
      const failed = [];
      // Sequential: each import writes the whole library, so running them in
      // parallel would race and the last write would drop the others.
      for (const file of files) {
        try {
          onSource(await readJobCostFile(file));
        } catch (err) {
          failed.push(`${file.name}: ${err?.message || String(err)}`);
        } finally {
          setBusy((n) => n - 1);
        }
      }
      if (failed.length) setError(failed.join("\n\n"));
    },
    [onSource]
  );

  return { ingest, error, setError, busy };
}

/** Drop target — shown full-size when the library is empty, compact once loaded. */
export function SourceDrop({ onSource, compact }) {
  const { ingest, error, setError, busy } = useWorkbookImport(onSource);
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);

  const open = () => inputRef.current?.click();
  const input = (
    <input ref={inputRef} type="file" accept={ACCEPT} hidden multiple
           onChange={(e) => { ingest(e.target.files); e.target.value = ""; }} />
  );

  if (compact) {
    return (
      <>
        <button className="btn" disabled={busy > 0} onClick={open}>
          {busy > 0 ? `Reading ${busy}…` : "Add / Replace Plant"}
        </button>
        {input}
        {error && <div style={{ flexBasis: "100%" }}><ErrorBox message={error} onDismiss={() => setError("")} /></div>}
      </>
    );
  }

  return (
    <div className="empty">
      <h2>Job Cost</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        Drop the weekly Job Cost Report for each plant. Files stay loaded between visits —
        drop a plant again to refresh just that plant.
      </p>

      <div
        className={`dropzone${over ? " over" : ""}`}
        onClick={open}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); ingest(e.dataTransfer.files); }}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") open(); }}
      >
        <div style={{ color: "var(--accent)", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", fontSize: 12 }}>
          {busy > 0 ? `Reading ${busy} file(s)…` : "Drop reports here, or click to browse"}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>Accepts .xlsx and .xls — several at once is fine</div>
        {input}
      </div>

      {error && <ErrorBox message={error} />}

      <p className="hint" style={{ marginTop: 14 }}>
        <strong style={{ color: "var(--text-secondary)" }}>Expected shape:</strong>{" "}
        one worksheet per job, the job number and name in cell A3, and a Task / Description
        header row. The plant is read from the filename — the workbook carries no plant
        field — so a "(1)" or "copy" suffix is fine, but a file renamed past recognition
        is filed under that name instead of its plant.
      </p>
      <p className="hint">
        Files are parsed in your browser and cached in this browser only. Nothing is uploaded anywhere.
      </p>
    </div>
  );
}
