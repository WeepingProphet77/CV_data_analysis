/**
 * Concrete Vision — employee time export.
 *
 * `aliases` absorb header drift between export versions. Note "Deptment":
 * that misspelling is Concrete Vision's own, so it is listed alongside the
 * correctly spelled variants rather than corrected away.
 */
export const employeeTimeSchema = {
  id: "employee-time",
  fields: [
    { key: "date", label: "Effective Date", type: "date", required: true,
      aliases: ["date", "work date", "workdate", "transaction date", "posting date"] },
    { key: "firstName", label: "First Name", type: "string", required: true,
      aliases: ["first", "employee first name", "givenname"] },
    { key: "lastName", label: "Last Name", type: "string", required: true,
      aliases: ["last", "employee last name", "surname"] },
    { key: "loc", label: "Location", type: "string", required: false,
      aliases: ["site", "branch", "plant", "shop"] },
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
  ],

  /** Full name is what every view groups people by. */
  derive: (row) => ({
    name: `${row.firstName} ${row.lastName}`.trim() || "(unnamed)",
  }),

  /** A row with no date, no person or no hours carries no information. */
  isEmptyRow: (row) => !row.date || !row.name || row.hrs === 0,
};

export default employeeTimeSchema;
