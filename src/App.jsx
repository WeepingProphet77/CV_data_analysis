/**
 * App shell: the persistent header, the hash route, and the error boundary.
 *
 * Hash routing (#/production/board) is deliberate — GitHub Pages serves static
 * files with no rewrite rules, so a path-based route would 404 on refresh or on
 * a shared deep link.
 *
 * The whole hash is parsed, not just its first segment. Every tab is therefore
 * a real address that can be bookmarked, shared and reached with the Back
 * button, and a section no longer has to invent its own tab state.
 */
import React, { useEffect, useState } from "react";
import {
  DEFAULT_SECTION, findSection, isSection, tabsFor, paramsFor,
} from "./modules/registry.js";
import { ALIASES } from "./modules/sections.js";
import { parseRoute, hrefFor, replaceRoute, segments } from "./core/routing.js";
import { AppDataProvider } from "./app/AppData.jsx";
import { useAppData } from "./core/appData.js";
import { sourceSummary } from "./app/sources.js";
import AppHeader from "./components/AppHeader.jsx";

const ROUTE_OPTS = { isSection, tabsFor, paramsFor, fallback: DEFAULT_SECTION };

function currentRoute() {
  // Guarded so the shell can also be rendered outside a browser (render tests).
  if (typeof window === "undefined") return parseRoute("", ROUTE_OPTS);
  return parseRoute(redirectLegacy(window.location.hash), ROUTE_OPTS);
}

/** A bookmark from before the rework lands where its section went, not on Home. */
function redirectLegacy(hash) {
  const [first, ...rest] = segments(hash);
  const to = ALIASES[first];
  if (!to) return hash;
  // Only the section name is carried over -- the tab names moved too, so the
  // section's own first tab is the honest destination.
  return hrefFor(to, ...(to === "home" ? [] : rest.filter((r) => tabsFor(to).some((t) => t.id === r))));
}

export default function App() {
  return (
    <AppDataProvider>
      <Shell />
    </AppDataProvider>
  );
}

function Shell() {
  const [route, setRoute] = useState(currentRoute);
  const app = useAppData();

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHash);
    // A bare URL is redirected rather than pushed, so Back leaves the site
    // instead of bouncing between "" and "#/home".
    if (!window.location.hash) replaceRoute(DEFAULT_SECTION);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const section = findSection(route.section) || findSection(DEFAULT_SECTION);
  const Active = section.Component;
  const summary = sourceSummary(app);

  return (
    <div className="app">
      <div className="shell">
        <AppHeader section={section.id} mine={app.mine} summary={summary} />

        {/*
          Keyed on the section, not on every route change: a tab switch must not
          remount the view and throw away its scroll position or its local
          state. Switching section is a genuine change of subject, and resetting
          the boundary there is what lets a crashed section be escaped.
        */}
        <ErrorBoundary key={section.id} sectionLabel={section.label}>
          {app.ready ? (
            <Active route={route} tab={route.tab} params={route.params} />
          ) : (
            // Every record must resolve first, or saved data flashes as an
            // empty state and a saved My Projects choice flashes as "All".
            <div className="bootwait" aria-hidden="true" />
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}

/**
 * A malformed export shouldn't take the whole page down with it — keep the
 * header alive so the user can switch section or clear the stored data.
 */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Section crashed:", error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel">
        <div className="section-label" style={{ color: "var(--critical)" }}>
          {this.props.sectionLabel} hit an error
        </div>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, color: "#f0a5a5", marginBottom: 12 }}>
          {String(this.state.error?.message || this.state.error)}
        </pre>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
          <a className="btn ghost" href={hrefFor("sources")}>Check the loaded files</a>
        </div>
      </div>
    );
  }
}
