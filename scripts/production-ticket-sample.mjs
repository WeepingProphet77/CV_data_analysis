/**
 * A synthetic Missing Piece Mark Ticket report, as an array-of-arrays.
 *
 * The real report is a binary workbook and carries real job names, so it can
 * never be committed (CLAUDE.md §1) and can't live in samples/ as a
 * .sample.csv. It is generated in memory instead and shared by the test
 * scripts, which keeps company data out of the repo and no binary fixture in it.
 *
 * The shape mirrors the real export exactly: two leading spacer columns, the
 * header on the first row, plant banners in column A, job banners in column B,
 * detail rows from column C, "Total Pieces: N" rows closing each group, and a
 * grand total wrapped in literal <strong> markup.
 */

const HEADER = [
  null, null, "Plant Name", "Job Num", "Job Name", "Piece Mark", "Drawn By",
  "Length", "Width", "Depth", "Weight", "SQFT", "CY", "LNFT", "Bed Date",
];

const detail = (plant, jobNo, jobName, mark, drawnBy, serial, sf) => [
  null, null, plant, jobNo, jobName, mark, drawnBy,
  "11'-3 1/4\"", "19'-1\"", "1'-0\"", sf * 90, sf, +(sf / 44).toFixed(2), 11.27, serial,
];

/**
 * ticketSheet(plants) -> aoa
 *
 * `plants` is [{ plant, jobs: [{ jobNo, jobName, group, pieces: [[mark, drawnBy, serial, sf]] }] }].
 * Banner counts are computed from the pieces, so the fixture always reconciles
 * unless a test deliberately breaks it.
 */
export function ticketSheet(plants) {
  const rows = [HEADER];
  let grand = 0;

  for (const p of plants) {
    const plantTotal = p.jobs.reduce((n, j) => n + j.pieces.length, 0);
    rows.push([`${p.plant} (${plantTotal} pieces)`]);
    for (const j of p.jobs) {
      const group = j.group ? ` (${j.group})` : "";
      rows.push([null, `${j.jobNo} - ${j.jobName}${group} - ${j.pieces.length} pieces`]);
      for (const [mark, drawnBy, serial, sf] of j.pieces) {
        rows.push(detail(p.plant, j.jobNo, j.jobName, mark, drawnBy, serial, sf));
      }
      rows.push([null, null, null, null, null, `Total Pieces: ${j.pieces.length}`]);
    }
    rows.push([null, null, null, null, null, `Total Pieces: ${plantTotal}`]);
    grand += plantTotal;
  }

  rows.push([null, null, null, null, null, `<strong>Grand Total: ${grand}</strong>`]);
  return rows;
}

/** Serial 46235 is 2026-08-01, the first day the production sample covers. */
export const AUG_1 = 46235;

/**
 * The default fixture. Job 43134 overlaps the production sample's own jobs so
 * the join can be exercised; job 49999 is deliberately absent from the schedule
 * so "in the report but not on the board" has a case; TP-STALE sits in the past
 * so the urgency buckets have an overdue row.
 */
export function sampleTicketSheet() {
  return ticketSheet([
    {
      plant: "Sample Plant A",
      jobs: [
        {
          jobNo: "43134", jobName: "SAMPLE TOWER", group: "Grp - A",
          pieces: [
            ["TP-001", "adrafter", AUG_1 + 2, 119],
            ["TP-002", "", AUG_1 + 3, 44],
            ["TP-003", "", AUG_1 + 9, 159],
            ["TP-STALE", "bdrafter", AUG_1 - 400, 60],
          ],
        },
        {
          jobNo: "45154", jobName: "SAMPLE CAMPUS", group: "Grp - B",
          pieces: [["TP-010", "", AUG_1 + 5, 95]],
        },
      ],
    },
    {
      plant: "Sample Plant B",
      jobs: [
        {
          jobNo: "49999", jobName: "NOT ON THE SCHEDULE", group: "UA",
          pieces: [
            ["TP-900", "cdrafter", AUG_1 + 20, 45],
            ["TP-901", "", AUG_1 + 21, 45],
          ],
        },
      ],
    },
  ]);
}

export default sampleTicketSheet;
