/**
 * App shell: module navigation over a hash route.
 *
 * Hash routing (#/employee-time) is deliberate — GitHub Pages serves static
 * files with no rewrite rules, so a path-based route would 404 on refresh or
 * on a shared deep link.
 */
import React, { useEffect, useState } from "react";
import { MODULES, DEFAULT_MODULE, findModule } from "./modules/registry.js";

function currentModuleId() {
  // Guarded so the shell can also be rendered outside a browser (render tests).
  if (typeof window === "undefined") return DEFAULT_MODULE;
  const id = window.location.hash.replace(/^#\/?/, "").split("/")[0];
  return findModule(id) ? id : DEFAULT_MODULE;
}

export default function App() {
  const [moduleId, setModuleId] = useState(currentModuleId);

  useEffect(() => {
    const onHash = () => setModuleId(currentModuleId());
    window.addEventListener("hashchange", onHash);
    if (!window.location.hash) window.location.replace(`#/${DEFAULT_MODULE}`);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const active = findModule(moduleId);
  const Active = active.Component;

  return (
    <div className="app">
      <div className="shell">
        <nav className="modnav" aria-label="Modules">
          {MODULES.map((m) => (
            <a
              key={m.id}
              href={`#/${m.id}`}
              aria-current={m.id === moduleId ? "page" : undefined}
              className={m.status === "planned" ? "soon" : undefined}
              title={m.blurb}
            >
              {m.label}
              {m.status === "planned" && " ·"}
            </a>
          ))}
          <span style={{ flex: 1 }} />
          <span className="subtitle" style={{ alignSelf: "center" }}>
            Concrete Vision · Data Analysis
          </span>
        </nav>

        <ErrorBoundary key={moduleId} moduleLabel={active.label}>
          <Active />
        </ErrorBoundary>
      </div>
    </div>
  );
}

/**
 * A malformed export shouldn't take the whole page down with it — keep the nav
 * alive so the user can switch modules or clear the stored data.
 */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Module crashed:", error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel">
        <div className="section-label" style={{ color: "var(--critical)" }}>
          {this.props.moduleLabel} hit an error
        </div>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, color: "#f0a5a5", marginBottom: 12 }}>
          {String(this.state.error?.message || this.state.error)}
        </pre>
        <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
