/**
 * The persistent shell header: what the app is, what is loaded, and the
 * app-wide project scope.
 *
 * Two of these were previously invisible from most of the app. The My Projects
 * scope is app-wide state (core/myProjects.js) but its switch was mounted
 * inside two modules' filter rows, so it looked like a per-module filter and
 * vanished on the third. And the warnings that matter most — a ticket report
 * that doesn't cover the schedule, plants exported on different dates — were
 * announced only to someone already standing on the tab that raised them. Both
 * belong to the whole app, so both live in the chrome.
 */
import React from "react";
import { SECTIONS } from "../modules/sections.js";
import { hrefFor } from "../core/routing.js";
import { ScopeToggle } from "./MyProjects.jsx";

export default function AppHeader({ section, mine, summary }) {
  return (
    <header className="appbar">
      <div className="appbar-top">
        <a className="brand" href={hrefFor("home")}>
          <span className="brand-name">CV Data Analysis</span>
          <span className="brand-sub">Concrete Vision · job cost · in your browser</span>
        </a>

        <div className="appbar-controls">
          <ScopeToggle mine={mine} />
          <a
            className={`datachip${summary.warn ? " warn" : ""}`}
            href={hrefFor("sources")}
            aria-current={section === "sources" ? "page" : undefined}
            title={
              summary.warn
                ? summary.warnings.join("\n\n")
                : "Every file loaded in this browser"
            }
          >
            {summary.fileCount
              ? `${summary.fileCount} file${summary.fileCount === 1 ? "" : "s"}`
              : "No files"}
            {summary.warn && <span aria-hidden="true"> ⚠</span>}
            <span className="sr-only" hidden>
              {summary.warn ? " — needs attention" : ""}
            </span>
          </a>
        </div>
      </div>

      <nav className="modnav" aria-label="Sections">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={hrefFor(s.id)}
            aria-current={s.id === section ? "page" : undefined}
            title={s.blurb}
          >
            {s.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
