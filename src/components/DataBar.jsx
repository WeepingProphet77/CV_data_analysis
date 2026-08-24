/** "What's loaded" strip: source file, row count, replace / clear controls. */
import React from "react";
import { ImportButton } from "./FileImport.jsx";
import { count } from "../core/format.js";

export function DataBar({ title, meta, rowCount, schema, onLoaded, onClear, persistWarning }) {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="title">{title}</div>
          <div className="subtitle">
            {meta?.fileName ? (
              <>
                {meta.fileName} — exported {meta.fileDate} — {count(rowCount)} entries
              </>
            ) : (
              <>{count(rowCount)} entries</>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <ImportButton schema={schema} onLoaded={onLoaded} />
          <button
            className="btn danger"
            onClick={() => {
              if (window.confirm("Clear the data stored in this browser for this module?")) onClear();
            }}
          >
            Clear Data
          </button>
        </div>
      </div>

      {persistWarning && (
        <div style={{
          marginBottom: 12, padding: "8px 10px", fontSize: 11, borderRadius: 4,
          border: "1px solid rgba(201,133,0,.45)", background: "rgba(201,133,0,.10)", color: "#ecb84a",
        }}>
          {persistWarning}
        </div>
      )}

      {meta?.warnings?.length > 0 && (
        <details style={{ marginBottom: 12, fontSize: 11 }}>
          <summary className="muted" style={{ cursor: "pointer" }}>
            {meta.warnings.length} import note(s)
          </summary>
          <ul style={{ margin: "6px 0 0 18px", color: "var(--text-secondary)", lineHeight: 1.7 }}>
            {meta.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </details>
      )}
    </>
  );
}

export default DataBar;
