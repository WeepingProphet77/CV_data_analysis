/**
 * Concrete Vision — employee time export.
 *
 * Profiled against the real `EmpTimeExport.xls` on 2026-08-31 (§12). Until then
 * this schema was inferred from the legacy single-file tool and carried a
 * standing caveat. The profile confirmed it: one sheet, a flat table, 11
 * columns, and **every required column mapped on the first try**. Two columns
 * the schema didn't name — `Emp Number` and `Summary` — were being carried as
 * `row.extra`; they are mapped properly now.
 *
 * `aliases` absorb header drift between export versions. Note "Deptment":
 * that misspelling is Concrete Vision's own, so it is listed alongside the
 * correctly spelled variants rather than corrected away.
 */

/**
 * "45219 - FIU STUDENT HOUSING" -> { jobNo: "45219", jobTitle: "FIU STUDENT HOUSING" }
 *
 * **This is the same shape the production export uses, and it is what makes the
 * timesheet join real.** It parsed on 29,262 of 29,267 rows (100.0%) of the
 * profiled export; the 5 that fail carry a title with no number at all
 * ("- St. Jude Clinical Research Tower") and keep `jobNo: ""`.
 *
 * The separator is matched only when surrounded by whitespace — the identical
 * rule production needs, and for the identical reason: this export is full of
 * `00-001`-style admin job numbers, and an unspaced match would cut them in
 * half and collapse `00-006` and `00-009` onto one key. 19.2% of all hours sit
 * on those `00-*` jobs, so getting it wrong would be expensive here.
 */
export function splitJob(v) {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\S+)\s+-\s+(.+)$/);
  return m ? { jobNo: m[1], jobTitle: m[2].trim() } : { jobNo: "", jobTitle: s };
}

export const employeeTimeSchema = {
  id: "employee-time",
  fields: [
    { key: "date", label: "Effective Date", type: "date", required: true,
      aliases: ["date", "work date", "workdate", "transaction date", "posting date"] },
    { key: "firstName", label: "First Name", type: "string", required: true,
      aliases: ["first", "employee first name", "givenname"] },
    { key: "lastName", label: "Last Name", type: "string", required: true,
      aliases: ["last", "employee last name", "surname"] },
    // Present on only 53% of rows and covering 64 of 110 people, so it is
    // shown but never used as the person key — see `derive` below.
    { key: "empNo", label: "Emp Number", type: "string", required: false,
      aliases: ["employee number", "emp no", "employee id", "empid", "badge"] },
    // The person's *office*, not the job's plant — see §12. Do not alias it to
    // "plant" and do not run it through job-cost/plants.js.
    { key: "loc", label: "Location", type: "string", required: false,
      aliases: ["site", "branch", "office"] },
    { key: "job", label: "Job Name", type: "string", required: true,
      aliases: ["job", "project", "project name", "jobname", "job description"] },
    { key: "gl", label: "GL Code", type: "string", required: false,
      aliases: ["gl", "glcode", "general ledger", "account", "gl account"] },
    { key: "task", label: "Labor Task", type: "string", required: false,
      aliases: ["task", "labortask", "activity", "work type", "cost code"] },
    { key: "dept", label: "Deptment", type: "string", required: false,
      aliases: ["department", "dept", "deptartment", "departmnt"] },
    { key: "hrs", label: "Hours", type: "number", required: true,
      aliases: ["hours", "hrs", "total hours", "qty", "quantity"] },
    // Free text the person typed: "New Years Holiday", a note on the task.
    // Filled on 31% of rows.
    { key: "note", label: "Summary", type: "string", required: false,
      aliases: ["comment", "comments", "notes", "description", "memo"] },
  ],

  derive: (row) => ({
    /**
     * The person key.
     *
     * Deliberately the name, not `Emp Number`: the number is blank on 46.7% of
     * rows and covers only 64 of the 110 people in the export, so grouping on
     * it would silently split half of everyone's hours into an "unknown"
     * bucket. Profiled: no employee number carries two names, but one name
     * carries two numbers.
     */
    name: `${row.firstName} ${row.lastName}`.trim() || "(unnamed)",
    // The job number is the project's identity in every system here, which is
    // what lets these hours join to cost and to the schedule (§12, §15).
    ...splitJob(row.job),
  }),

  /** A row with no date, no person or no hours carries no information. */
  isEmptyRow: (row) => !row.date || !row.name || row.hrs === 0,
};

export default employeeTimeSchema;
