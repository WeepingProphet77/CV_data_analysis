/**
 * The field catalog for a job cost record.
 *
 * This is not a core/parse.js schema — the workbook is a formatted report, not
 * a flat table, so nothing maps columns by header here (see ./parse.js). What
 * this drives is the *detail view*, which per CLAUDE.md §11 shows every field
 * whether or not it carries a value, so "blank for this job" stays visibly
 * distinct from "not in this report".
 *
 * `note` explains a figure the report does not define, which matters most for
 * the two OH & Profit rows: one is a projection to completion and the other is
 * a to-date artifact, and reading them as the same number is the easy mistake.
 */

export const JOB_FIELDS = [
  { key: "jobNo", label: "Job Number", type: "string" },
  { key: "jobTitle", label: "Job Name", type: "string" },
  { key: "plant", label: "Plant", type: "string",
    note: "From the export's filename — the worksheets themselves carry no plant." },
  { key: "asOf", label: "As of", type: "date",
    note: "The report's own cut-off date, from the header of every sheet." },

  { key: "originalContract", label: "Original Contract", type: "money" },
  { key: "changeOrders", label: "Change Orders", type: "money" },
  { key: "netContract", label: "Net Contract", type: "money",
    note: "Original Contract + Change Orders." },
  { key: "amountBilled", label: "Amount Billed", type: "money" },
  { key: "pctBilled", label: "% Billed", type: "percent",
    note: "Amount Billed / Net Contract." },

  { key: "actualCost", label: "Actual Cost", type: "money",
    note: "Cost booked to date." },
  { key: "projectedCost", label: "Projected Cost", type: "money",
    note: "Forecast cost at completion." },
  { key: "estOhProfit", label: "Est. OH & Profit", type: "money",
    note: "Net Contract − Projected Cost: the margin expected at completion." },
  { key: "estOhProfitPct", label: "Est. OH & Profit %", type: "percent" },
  { key: "netOhProfit", label: "Net OH & Profit", type: "money",
    note: "Net Contract − Actual Cost: margin against cost booked so far, not a forecast. It falls as the job spends." },
  { key: "netOhProfitPct", label: "Net OH & Profit %", type: "percent" },
];

/** Columns of the cost grid, in the order the report prints them. */
export const COST_FIELDS = [
  { key: "code", label: "Task", type: "string" },
  { key: "desc", label: "Description", type: "string" },
  { key: "estQty", label: "Est Qty", type: "number" },
  { key: "estCost", label: "Est Cost", type: "money" },
  { key: "projCost", label: "Projections Total", type: "money" },
  { key: "curMo", label: "Current Mo Act", type: "money" },
  { key: "actQty", label: "Act Qty", type: "number" },
  { key: "actCost", label: "Act Cost", type: "money" },
  { key: "variance", label: "Variance", type: "money",
    note: "Projections Total − Act Cost. Negative means the line is over its projection." },
  { key: "pctProj", label: "% of Proj", type: "percent",
    note: "Act Cost / Projections Total." },
];

/** What the import prompt tells the user to expect. */
export const EXPECTED = {
  fields: [
    { key: "sheet", label: "one worksheet per job", required: true },
    { key: "a3", label: "job number and name in cell A3", required: true },
    { key: "header", label: "a Task / Description header row", required: true },
    { key: "totals", label: "a Job Totals row", required: false },
  ],
};

export default JOB_FIELDS;
