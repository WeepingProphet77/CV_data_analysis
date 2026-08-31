/**
 * Page furniture shared by every section: the title block, the routed tab row
 * and the "this section needs a file" empty state.
 *
 * Sections used to build these themselves, which is how three of them ended up
 * with three different names for the same screen (Overview / Charts /
 * Portfolio) and two different words for the same entity (Project / Job). One
 * component each means the vocabulary is decided once.
 */
import React from "react";
import { hrefFor } from "../core/routing.js";

/** Title, one line of context, and whatever controls the page owns. */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="topbar">
      <div>
        <div className="title">{title}</div>
        {subtitle && <div className="subtitle">{subtitle}</div>}
      </div>
      {actions && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * Tabs as links.
 *
 * They were buttons over component state, which meant no tab could be
 * bookmarked or shared and the Back button skipped the whole section. As links
 * they cost nothing extra and every one of them is an address.
 *
 * `counts` decorates a label with a number where the section has one to give;
 * a tab with no count is drawn plain rather than with a zero.
 */
export function RouteTabs({ section, tabs, active, counts = {}, hidden = [] }) {
  const shown = tabs.filter((t) => !hidden.includes(t.id));
  return (
    <div className="tabs" role="tablist">
      {shown.map((t) => {
        const n = counts[t.id];
        return (
          <a
            key={t.id}
            role="tab"
            href={hrefFor(section, t.id)}
            aria-selected={active === t.id}
            title={t.hint}
          >
            {t.label}
            {n != null && ` (${n})`}
          </a>
        );
      })}
    </div>
  );
}

/**
 * Shown when a section has nothing to work with.
 *
 * It names the file rather than saying "no data": which export to run is the
 * one thing a person standing here does not know, and sending them to Sources
 * means every import in the app is reached the same way.
 */
export function NeedsSource({ title, file, blurb, children }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p className="muted" style={{ fontSize: 13, maxWidth: 560 }}>{blurb}</p>
      <p className="hint" style={{ marginBottom: 14 }}>
        <strong style={{ color: "var(--text-secondary)" }}>Needs:</strong> {file}
      </p>
      {children}
      <p className="hint" style={{ marginTop: 14 }}>
        Files are parsed in your browser and cached in this browser only. Nothing is
        uploaded anywhere. <a className="link" href={hrefFor("sources")}>See every loaded file</a>.
      </p>
    </div>
  );
}
