/**
 * Hash-route parsing.
 *
 * Hash routing is forced on us: GitHub Pages serves static files with no
 * rewrite rules, so a path-based route would 404 on refresh or on a shared
 * deep link (CLAUDE.md §2).
 *
 * The app used to read only the first segment, which meant no tab and no
 * drill-down could be linked, bookmarked or reached with the Back button. This
 * parses the whole hash instead: `#/production/board`, `#/job/43134/cost`.
 *
 * Pure ESM with no React and no knowledge of what a section is, so the routing
 * rules can be tested in node.
 */

/** "#/production/board" -> ["production", "board"] */
export function segments(hash) {
  return String(hash || "")
    .replace(/^#/, "")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s; // a hand-typed hash with a stray % is not worth throwing over
      }
    });
}

/**
 * Parse a hash into { section, params, tab, rest }.
 *
 * `isSection`, `tabsFor` and `paramsFor` are injected rather than imported so
 * this file stays free of the registry — and so the tests can drive it with a
 * fixture.
 *
 * `paramsFor(section)` is how many segments belong to the section itself before
 * the tab begins. It is 0 for every section except the job page, which is
 * addressed `#/job/<jobNo>/<tab>`: the job is what the page is *about*, so it
 * comes before the tab, exactly as it reads aloud.
 *
 * An unknown section falls back to `fallback`; an unknown tab falls back to the
 * section's first. That is what keeps a stale bookmark landing somewhere real
 * instead of on a blank page.
 */
export function parseRoute(hash, { isSection, tabsFor, fallback, paramsFor = () => 0 }) {
  const [first, ...after] = segments(hash);
  if (!first || !isSection(first)) {
    return { section: fallback, params: [], tab: firstTab(tabsFor, fallback), rest: [] };
  }

  const nParams = paramsFor(first) || 0;
  const params = after.slice(0, nParams);
  const rest = after.slice(nParams);

  const tabs = tabsFor(first) || [];
  if (!tabs.length) return { section: first, params, tab: "", rest };

  const [maybeTab, ...tail] = rest;
  if (maybeTab && tabs.some((t) => t.id === maybeTab)) {
    return { section: first, params, tab: maybeTab, rest: tail };
  }
  // Not a tab — the remaining segments belong to the section (a person's name).
  return { section: first, params, tab: tabs[0].id, rest };
}

const firstTab = (tabsFor, section) => (tabsFor(section) || [])[0]?.id || "";

/** Build a hash for a route. Every segment is encoded — job names carry spaces. */
export function hrefFor(section, ...rest) {
  const parts = [section, ...rest].filter((s) => s !== undefined && s !== null && s !== "");
  return `#/${parts.map((s) => encodeURIComponent(String(s))).join("/")}`;
}

/** Navigate. Isolated so nothing else in the app touches window.location. */
export function go(section, ...rest) {
  if (typeof window !== "undefined") window.location.hash = hrefFor(section, ...rest);
}

/**
 * Replace the current route without adding a history entry — used when the app
 * redirects a bad or empty hash, which should not become a Back-button stop.
 */
export function replaceRoute(section, ...rest) {
  if (typeof window === "undefined") return;
  const href = hrefFor(section, ...rest);
  if (window.history?.replaceState) {
    window.history.replaceState(null, "", href);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.replace(href);
  }
}
