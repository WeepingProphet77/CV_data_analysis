/**
 * The filter row every module shares: a date window plus dimension pickers
 * and a search box. Filters live in one row above the content.
 */
import React from "react";

export function FilterBar({
  range, dateFrom, dateTo, onFrom, onTo,
  dimensions = [], search, onSearch, searchPlaceholder = "Search…", onClear, dirty,
  leading,
}) {
  return (
    <div className="filters">
      {/* Slot for a control the module owns -- a scope switch, a mode toggle --
          so it sits with the filters instead of in a row of its own. */}
      {leading}
      {/* Not every dataset has a date axis -- the job cost reports are a
          snapshot, not a series -- so the window is only drawn when a range
          is supplied. */}
      {range && (
        <>
          <span className="filter-label">From</span>
          <input className="field" type="date" value={dateFrom || range.min || ""}
                 min={range.min} max={range.max} onChange={(e) => onFrom(e.target.value)} />
          <span className="filter-label">To</span>
          <input className="field" type="date" value={dateTo || range.max || ""}
                 min={range.min} max={range.max} onChange={(e) => onTo(e.target.value)} />
        </>
      )}

      {dimensions.map((d) => (
        <label key={d.id} style={{ display: "contents" }}>
          <span className="sr-only" hidden>{d.label}</span>
          <select className="field" value={d.value} onChange={(e) => d.onChange(e.target.value)}
                  title={d.label} aria-label={d.label}>
            {/* A dimension whose option values aren't the words to show (a
                presence filter, say) supplies a `labels` map. */}
            {d.options.map((o) => (
              <option key={o} value={o}>
                {d.labels?.[o] ?? (o === "All" ? `All ${d.label}` : o)}
              </option>
            ))}
          </select>
        </label>
      ))}

      {dirty && <button className="btn danger" onClick={onClear}>Clear</button>}

      {onSearch && (
        <input className="field grow" placeholder={searchPlaceholder} value={search}
               onChange={(e) => onSearch(e.target.value)} />
      )}
    </div>
  );
}

export default FilterBar;
