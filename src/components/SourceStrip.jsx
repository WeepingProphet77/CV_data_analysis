/**
 * One row layout and one set of verbs for every file the app holds.
 *
 * There used to be five strips with five vocabularies — "Upload New Data",
 * "Add / Replace Plant", "Clear Data", "Clear All", "Remove", "Stop comparing"
 * — for what are really three actions: add a file, swap a file, forget a file.
 * The words are fixed in app/sources.js (VERBS) and used verbatim here.
 *
 * Confirmation is consistent too: forgetting anything that took an upload to
 * create asks once.
 */
import React from "react";
import { Badge } from "./ui.jsx";
import { VERBS } from "../app/sources.js";

/** The container. A strip is a list of rows, never a single row on its own. */
export function SourceStrip({ children }) {
  return <div className="srclist">{children}</div>;
}

/**
 * One loaded thing.
 *
 * `badge` carries the figure that matters for that source (rows, pieces, an
 * as-of date); `detail` the rest; `actions` the verbs. Everything is optional
 * because the four sources genuinely describe themselves differently — what is
 * shared is the shape, not the content.
 */
export function SourceRow({ name, badge, badgeTone = "blue", badgeTitle, detail, fileName, actions }) {
  return (
    <div className="srcrow">
      <span className="srcplant">{name}</span>
      {badge && <Badge tone={badgeTone} title={badgeTitle}>{badge}</Badge>}
      {detail && <span className="muted">{detail}</span>}
      {fileName && (
        <span
          className="muted"
          title={fileName}
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {fileName}
        </span>
      )}
      {actions && <span style={{ display: "flex", gap: 6 }}>{actions}</span>}
    </div>
  );
}

/** Remove, with the one confirmation prompt every removal uses. */
export function RemoveButton({ onRemove, what, label = VERBS.remove, ghost = true }) {
  return (
    <button
      className={ghost ? "btn ghost" : "btn danger"}
      title={`${label} ${what}`}
      onClick={() => {
        if (window.confirm(`${label} ${what}? It is only stored in this browser.`)) onRemove();
      }}
    >
      {label}
    </button>
  );
}

export { VERBS };
