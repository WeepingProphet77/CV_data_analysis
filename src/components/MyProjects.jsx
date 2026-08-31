/**
 * The My Projects star, and the All / My Projects scope switch.
 *
 * Module-agnostic on purpose: the selection is app-wide (core/myProjects.js),
 * so job cost, production and the missing-ticket view all mount these same
 * controls over the same list.
 */
import React from "react";
import { SCOPE_ALL, SCOPE_MINE } from "../core/myProjects.js";

/**
 * Star toggle for one job.
 *
 * Rows in these tables are clickable and open the job, so the click must not
 * bubble — starring a project should never also navigate away from the list
 * you are curating.
 */
export function StarButton({ jobNo, on, onToggle, size }) {
  return (
    <button
      type="button"
      className={`starbtn${on ? " on" : ""}${size === "lg" ? " lg" : ""}`}
      aria-pressed={on}
      title={on ? `Remove ${jobNo} from My Projects` : `Add ${jobNo} to My Projects`}
      onClick={(e) => { e.stopPropagation(); onToggle(jobNo); }}
    >
      <span aria-hidden="true">{on ? "★" : "☆"}</span>
      <span className="sr-only" hidden>{on ? "In My Projects" : "Not in My Projects"}</span>
    </button>
  );
}

/** Segmented All / My Projects switch, shown with the filters. */
export function ScopeToggle({ mine }) {
  const { scope, setScope, count } = mine;
  return (
    <div className="scopetoggle" role="group" aria-label="Project scope">
      <button
        type="button"
        aria-pressed={scope === SCOPE_ALL}
        onClick={() => setScope(SCOPE_ALL)}
      >
        All Projects
      </button>
      <button
        type="button"
        aria-pressed={scope === SCOPE_MINE}
        onClick={() => setScope(SCOPE_MINE)}
        title={count ? `${count} project(s) starred` : "Star a project to build this list"}
      >
        ★ My Projects{count ? ` (${count})` : ""}
      </button>
    </div>
  );
}

/**
 * Shown when My Projects is selected but nothing is starred. Without this the
 * dashboard would simply be empty, which reads as broken rather than as a list
 * waiting to be filled.
 */
export function NoProjectsYet({ onShowAll }) {
  return (
    <div className="empty">
      <h2>No projects starred yet</h2>
      <p className="muted" style={{ fontSize: 13, maxWidth: 460 }}>
        Star a job with the ☆ in a Jobs table, or on any job's detail page, and it
        joins My Projects. Every tab in every module then shows only those jobs —
        job cost, the production schedule and the missing-ticket report read the
        same list. It is saved in this browser and stays put until you add or
        remove something.
      </p>
      <button className="btn" onClick={onShowAll}>Show all projects</button>
    </div>
  );
}
