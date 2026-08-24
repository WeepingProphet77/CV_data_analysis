/**
 * Stub shown by a module that has been reserved but not yet built.
 *
 * It states what the module will consume and what it will show, so the scope is
 * written down where the next person to open the file will see it.
 */
import React from "react";

export default function ModulePlaceholder({ title, summary, planned = [], expects = [] }) {
  return (
    <div>
      <div className="topbar">
        <div>
          <div className="title">{title}</div>
          <div className="subtitle">Not built yet — placeholder</div>
        </div>
      </div>

      <div className="panel">
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 14 }}>{summary}</p>

        {planned.length > 0 && (
          <>
            <div className="section-label">Planned</div>
            <ul style={{ margin: "0 0 16px 18px", color: "var(--text-secondary)", lineHeight: 1.9, fontSize: 12 }}>
              {planned.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </>
        )}

        {expects.length > 0 && (
          <>
            <div className="section-label">Expected export columns (to confirm)</div>
            <div>{expects.map((e) => <span className="badge" key={e}>{e}</span>)}</div>
          </>
        )}
      </div>

      <p className="hint">
        This module will reuse the shared import, filter, table and chart layers, so building it
        is mostly a matter of writing its schema and its views.
      </p>
    </div>
  );
}
