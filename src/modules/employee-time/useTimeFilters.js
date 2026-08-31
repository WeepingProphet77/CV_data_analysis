/**
 * Filter state + derived slices for the Time section.
 *
 * `mine` is the app-wide My Projects selection (core/myProjects.js). Time can
 * take part in it now: the export was profiled on 2026-08-31 and its job field
 * carries the job number, so the scope keys on the same thing every other
 * section does (§12, §14). Before that it was excluded, because scoping on a
 * name match would have hidden rows rather than narrowed them.
 *
 * As everywhere else, the scope narrows the row pool *first*, so no view below
 * can forget to apply it and show company-wide hours under a "My Projects"
 * heading.
 */
import { useMemo, useState } from "react";
import { distinct } from "../../core/aggregate.js";

export function useTimeFilters(rows, mine) {
  const [loc, setLoc] = useState("All");
  const [dept, setDept] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const active = Boolean(mine?.active);
  const members = mine?.members;

  /** My Projects, applied first — every option list below is drawn from this. */
  const pool = useMemo(
    () => (active ? rows.filter((r) => members.has(r.jobNo)) : rows),
    [rows, active, members]
  );

  const range = useMemo(() => {
    const dates = pool.map((r) => r.date).filter(Boolean).sort();
    return { min: dates[0] || "", max: dates[dates.length - 1] || "" };
  }, [pool]);

  const filtered = useMemo(() => {
    const from = dateFrom || range.min;
    const to = dateTo || range.max;
    return pool.filter(
      (r) =>
        (loc === "All" || r.loc === loc) &&
        (dept === "All" || r.dept === dept) &&
        (!from || r.date >= from) &&
        (!to || r.date <= to)
    );
  }, [pool, loc, dept, dateFrom, dateTo, range]);

  // The pickers list only what the current scope can show, so choosing an
  // option never lands on an unexplained empty view.
  const locs = useMemo(() => ["All", ...distinct(pool, (r) => r.loc)], [pool]);
  const depts = useMemo(() => ["All", ...distinct(pool, (r) => r.dept)], [pool]);

  const dirty = Boolean(dateFrom || dateTo || loc !== "All" || dept !== "All");
  const clear = () => { setDateFrom(""); setDateTo(""); setLoc("All"); setDept("All"); };

  return {
    pool, filtered, range, dirty, clear,
    loc, setLoc, dept, setDept, dateFrom, setDateFrom, dateTo, setDateTo,
    locs, depts,
  };
}
