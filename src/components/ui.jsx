/** Small presentational primitives shared by every module. */
import React from "react";

export function Badge({ children, tone = "gray", title }) {
  return <span className={`badge ${tone}`} title={title}>{children}</span>;
}

export function MiniBar({ value, max, color = "var(--accent)" }) {
  const w = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <span className="minibar" aria-hidden="true">
      <i style={{ width: `${w}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
    </span>
  );
}

/** Stat tile: label + value, optional sub-line. */
export function StatCard({ label, value, sub, small }) {
  return (
    <div className="card">
      <div className={`value${small ? " sm" : ""}`}>{value}</div>
      <div className="label">{label}</div>
      {sub && <div className="label" style={{ letterSpacing: 1, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function BackLink({ children, onClick }) {
  return <button className="backlink" onClick={onClick}>{"← "}{children}</button>;
}

export function Panel({ title, actions, children }) {
  return (
    <section className="panel">
      {(title || actions) && (
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {title && <div className="section-label" style={{ marginBottom: 0 }}>{title}</div>}
          {actions}
        </header>
      )}
      {(title || actions) && <div style={{ height: 10 }} />}
      {children}
    </section>
  );
}

/** Column header that toggles sort direction. */
export function SortableTh({ column, label, sort, onSort, align }) {
  const active = sort.col === column;
  return (
    <th
      className="sortable"
      onClick={() => onSort(column)}
      style={{ textAlign: align || "left", color: active ? "var(--accent-dim)" : undefined }}
      aria-sort={active ? (sort.dir > 0 ? "ascending" : "descending") : "none"}
    >
      {label}
      {active ? (sort.dir > 0 ? " ▲" : " ▼") : ""}
    </th>
  );
}

/** Sort state hook: click a column to sort, click again to flip direction. */
export function useSort(initialCol, initialDir = -1) {
  const [sort, setSort] = React.useState({ col: initialCol, dir: initialDir });
  const onSort = React.useCallback((col) => {
    setSort((s) => (s.col === col ? { col, dir: -s.dir } : { col, dir: -1 }));
  }, []);
  return [sort, onSort, setSort];
}

/** Generic comparator: numbers numerically, everything else as text. */
export function compareBy(col, dir) {
  return (a, b) => {
    const x = a[col], y = b[col];
    if (typeof x === "number" && typeof y === "number") return dir * (x - y);
    return dir * String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true });
  };
}
