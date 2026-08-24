/** Filter state + derived slices for the employee-time module. */
import { useMemo, useState } from "react";
import { distinct } from "../../core/aggregate.js";

export function useTimeFilters(rows) {
  const [loc, setLoc] = useState("All");
  const [dept, setDept] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const range = useMemo(() => {
    const dates = rows.map((r) => r.date).filter(Boolean).sort();
    return { min: dates[0] || "", max: dates[dates.length - 1] || "" };
  }, [rows]);

  const filtered = useMemo(() => {
    const from = dateFrom || range.min;
    const to = dateTo || range.max;
    return rows.filter(
      (r) =>
        (loc === "All" || r.loc === loc) &&
        (dept === "All" || r.dept === dept) &&
        (!from || r.date >= from) &&
        (!to || r.date <= to)
    );
  }, [rows, loc, dept, dateFrom, dateTo, range]);

  const locs = useMemo(() => ["All", ...distinct(rows, (r) => r.loc)], [rows]);
  const depts = useMemo(() => ["All", ...distinct(rows, (r) => r.dept)], [rows]);

  const dirty = Boolean(dateFrom || dateTo || loc !== "All" || dept !== "All");
  const clear = () => { setDateFrom(""); setDateTo(""); setLoc("All"); setDept("All"); };

  return {
    filtered, range, dirty, clear,
    loc, setLoc, dept, setDept, dateFrom, setDateFrom, dateTo, setDateTo,
    locs, depts,
  };
}
