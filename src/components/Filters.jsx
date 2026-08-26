/**
 * The filter row every module shares: a date window plus dimension pickers
 * and a search box. Filters live in one row above the content.
 */
import React from "react";

export function FilterBar({
  range, dateFrom, dateTo, onFrom, onTo,
  dimensions = [], search, onSearch, searchPlaceholder = "Search…", onClear, dirty,
}) {
  return (
    <div className="filters">
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
            {d.options.map((o) => (
              <option key={o} value={o}>{o === "All" ? `All ${d.label}` : o}</option>
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
