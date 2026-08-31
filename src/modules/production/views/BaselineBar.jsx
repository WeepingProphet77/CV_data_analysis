/**
 * The "compared against" strip.
 *
 * Shown whenever a baseline exists, on every tab — because the board is
 * quietly drawing movement chips from it, and a reader has to be able to see
 * what "moved 3 days" is measured *from* without hunting for it.
 */
import React from "react";
import { Badge } from "../../../components/ui.jsx";
import { count } from "../../../core/format.js";

export default function BaselineBar({ meta, stats, onDiscard }) {
  if (!meta) return null;

  const quiet = !stats || (!stats.moved && !stats.added && !stats.removed);

  return (
    <div className="srclist">
      <div className="srcrow">
        <span className="srcplant">Compared against</span>
        <Badge tone="blue" title="The schedule this one replaced">
          {meta.fileName || "the previous upload"}
        </Badge>
        <span className="muted">
          {meta.fileDate ? `modified ${meta.fileDate}` : "modified date unknown"}
          {meta.replacedOn ? ` · replaced ${meta.replacedOn}` : ""}
          {meta.rowCount ? ` · ${count(meta.rowCount)} rows` : ""}
        </span>
        <span className="muted">
          {quiet ? (
            "nothing moved"
          ) : (
            <>
              {stats.earlier ? <><strong style={{ color: "var(--good)" }}>{count(stats.earlier)} earlier</strong>{" · "}</> : null}
              {stats.later ? <><strong style={{ color: "var(--warning)" }}>{count(stats.later)} later</strong>{" · "}</> : null}
              {stats.added ? `${count(stats.added)} new · ` : ""}
              {stats.removed ? `${count(stats.removed)} dropped` : ""}
            </>
          )}
        </span>
        <button className="btn ghost" onClick={onDiscard}
                title="Forget the previous schedule and stop comparing">
          Stop comparing
        </button>
      </div>
    </div>
  );
}
