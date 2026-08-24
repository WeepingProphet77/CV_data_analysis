/** Drag-and-drop / click file picker plus the loaded-file status bar. */
import React, { useCallback, useRef, useState } from "react";
import { parseFile } from "../core/parse.js";

const ACCEPT = ".csv,.xlsx,.xls";

function useImport(schema, onLoaded) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const ingest = useCallback(
    async (file) => {
      if (!file) return;
      setBusy(true);
      setError("");
      try {
        const { rows, meta } = await parseFile(file, schema);
        if (!rows.length) throw new Error(`No usable rows in "${file.name}".`);
        onLoaded(rows, meta);
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setBusy(false);
      }
    },
    [schema, onLoaded]
  );

  return { ingest, error, setError, busy };
}

/** Full-page empty state shown before any data is loaded. */
export function ImportPrompt({ schema, title, blurb, onLoaded }) {
  const { ingest, error, busy } = useImport(schema, onLoaded);
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);

  const required = schema.fields.filter((f) => f.required).map((f) => f.label);

  return (
    <div className="empty">
      <h2>{title}</h2>
      <p className="muted" style={{ fontSize: 13 }}>{blurb}</p>

      <div
        className={`dropzone${over ? " over" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); ingest(e.dataTransfer.files[0]); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      >
        <div style={{ color: "var(--accent)", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", fontSize: 12 }}>
          {busy ? "Reading…" : "Drop export here, or click to browse"}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>Accepts .csv, .xlsx and .xls</div>
        <input ref={inputRef} type="file" accept={ACCEPT} hidden
               onChange={(e) => { ingest(e.target.files[0]); e.target.value = ""; }} />
      </div>

      {error && <ErrorBox message={error} />}

      <p className="hint" style={{ marginTop: 14 }}>
        <strong style={{ color: "var(--text-secondary)" }}>Expected columns:</strong> {required.join(", ")}
      </p>
      <p className="hint">
        Files are parsed in your browser and cached in this browser only. Nothing is uploaded anywhere.
      </p>
    </div>
  );
}

/** Compact "replace data" control for the header of a loaded module. */
export function ImportButton({ schema, onLoaded, label = "Upload New Data" }) {
  const { ingest, error, setError, busy } = useImport(schema, onLoaded);
  const inputRef = useRef(null);
  return (
    <>
      <button className="btn" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Reading…" : label}
      </button>
      <input ref={inputRef} type="file" accept={ACCEPT} hidden
             onChange={(e) => { ingest(e.target.files[0]); e.target.value = ""; }} />
      {error && (
        <div style={{ flexBasis: "100%" }}>
          <ErrorBox message={error} onDismiss={() => setError("")} />
        </div>
      )}
    </>
  );
}

export function ErrorBox({ message, onDismiss }) {
  return (
    <div style={{
      marginTop: 12, padding: "10px 12px", borderRadius: 4, maxWidth: 620, textAlign: "left",
      border: "1px solid rgba(230,103,103,.45)", background: "rgba(230,103,103,.10)",
      color: "#f0a5a5", fontSize: 11, whiteSpace: "pre-wrap", lineHeight: 1.6,
    }}>
      {message}
      {onDismiss && (
        <button className="btn ghost" style={{ marginLeft: 10 }} onClick={onDismiss}>Dismiss</button>
      )}
    </div>
  );
}
