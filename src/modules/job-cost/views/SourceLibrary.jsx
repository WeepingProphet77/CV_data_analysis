/**
 * The loaded-files strip.
 *
 * DataBar shows one file and replaces it. This module holds a file per plant,
 * each refreshed on its own schedule, so the strip lists them all and every row
 * is independently replaceable. Dropping a file whose plant is already present
 * overwrites that plant and leaves the others alone.
 */
import React, { useCallback, useRef, useState } from "react";
import { Badge } from "../../../components/ui.jsx";
import { ErrorBox } from "../../../components/FileImport.jsx";
import { readJobCostFile } from "../importFile.js";
import { count } from "../../../core/format.js";

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
        header row. The plant is taken from the filename.
      </p>
      <p className="hint">
        Files are parsed in your browser and cached in this browser only. Nothing is uploaded anywhere.
      </p>
    </div>
  );
}

/** The strip listing what is loaded, one row per plant. */
export default function SourceLibrary({ sources, data, onSource, onRemove, onClear, persistWarning }) {
  const warnings = sources.flatMap((s) => s.warnings.map((w) => `${s.plant}: ${w}`));

  return (
    <>
      <div className="topbar">
        <div>
          <div className="title">Job Cost</div>
          <div className="subtitle">
            {count(data.jobs.length)} active jobs across {sources.length} plant{sources.length === 1 ? "" : "s"}
            {data.asOfRange.max && (
              data.mixedAsOf
                ? ` — as of ${data.asOfRange.min} to ${data.asOfRange.max}`
                : ` — as of ${data.asOfRange.max}`
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <SourceDrop onSource={onSource} compact />
          <button
            className="btn danger"
            onClick={() => { if (window.confirm("Remove every plant's cost report from this browser?")) onClear(); }}
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="srclist">
        {sources.map((s) => (
          <div className="srcrow" key={s.id}>
            <span className="srcplant">{s.plant}</span>
            {/* A plant refreshed later than another is the trap this strip
                exists to prevent: comparing plants across different cut-offs. */}
            <Badge tone={data.mixedAsOf && s.asOf !== data.asOfRange.max ? "amber" : "blue"}
                   title={data.mixedAsOf && s.asOf !== data.asOfRange.max
                     ? `Older than the newest report loaded (${data.asOfRange.max})`
                     : "Report cut-off date"}>
              as of {s.asOf || "unknown"}
            </Badge>
            <span className="muted">{count(s.jobs.length)} jobs</span>
            <span className="muted" title={s.fileName} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.fileName}
            </span>
            <button className="btn ghost" onClick={() => onRemove(s.id)} title={`Remove ${s.plant}`}>Remove</button>
          </div>
        ))}
      </div>

      {data.mixedAsOf && (
        <div className="notice amber">
          Plants were exported on different dates ({data.asOfRange.min} — {data.asOfRange.max}).
          Company-wide totals mix those cut-offs; refresh the older plants before reading them as one number.
        </div>
      )}

      {persistWarning && <div className="notice amber">{persistWarning}</div>}

      {warnings.length > 0 && (
        <details style={{ marginBottom: 12, fontSize: 11 }}>
          <summary className="muted" style={{ cursor: "pointer" }}>{warnings.length} import note(s)</summary>
          <ul style={{ margin: "6px 0 0 18px", color: "var(--text-secondary)", lineHeight: 1.7 }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </details>
      )}
    </>
  );
}
