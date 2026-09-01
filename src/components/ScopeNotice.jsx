/**
 * What the figures on this page actually cover.
 *
 * §14 guarded against showing company-wide numbers under a "My Projects"
 * heading. The opposite failure was the one that bit: a scoped pool presented
 * with **no indication at all**. A person checking one employee's month saw
 * 1,538.6 hours where the export holds 16,423.9 for that month, with nothing on
 * screen to say eight starred jobs were doing the narrowing — so the only
 * available reading was "the app is losing hours".
 *
 * A stat tile cannot carry that caveat; the numbers are the whole point of it.
 * So the pool states itself, above the figures, whenever anything is narrowing
 * it — and says nothing at all when nothing is.
 *
 * The scope switch lives in the shell header (§15), which is easy to miss from
 * a page of numbers, so this repeats the state where the confusion happens and
 * offers the way out of it.
 */
import React from "react";
import { count } from "../core/format.js";
import { SCOPE_ALL } from "../core/myProjects.js";

export default function ScopeNotice({ mine, dateFrom, dateTo, range, dimensions = [], onClear, dirty }) {
  const scoped = Boolean(mine?.active);
  // Only a window the user actually chose narrows anything; the boxes sit on
  // the file's own range by default and that is not a filter.
  const windowed = Boolean(dateFrom || dateTo);
  const dims = dimensions.filter((d) => d.value && d.value !== "All");

  if (!scoped && !windowed && !dims.length) return null;

  const parts = [];
  if (scoped) parts.push(`My Projects — ${count(mine.count)} starred job${mine.count === 1 ? "" : "s"}`);
  if (windowed) parts.push(`${dateFrom || range?.min || "start"} to ${dateTo || range?.max || "end"}`);
  for (const d of dims) parts.push(`${d.label}: ${d.value}`);

  return (
    <div className="notice">
      <strong>These figures cover {parts.join(" · ")}.</strong>{" "}
      {scoped
        ? "Hours booked to any job outside that list are not counted here — including a person's admin and overhead time, which sits on its own job numbers."
        : "Everything outside that is excluded from the totals below."}{" "}
      {scoped && (
        <button className="btn ghost" onClick={() => mine.setScope(SCOPE_ALL)}>
          Show all jobs
        </button>
      )}
      {dirty && onClear && (
        <button className="btn ghost" onClick={onClear}>Clear filters</button>
      )}
    </div>
  );
}
