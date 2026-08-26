/**
 * Synthetic Job Cost Report workbooks, as arrays-of-arrays.
 *
 * A Job Cost Report is a multi-sheet binary workbook, so it cannot live in
 * samples/ as a .sample.csv the way the other modules' fixtures do — and a real
 * one may never be committed (CLAUDE.md §1). The sample is therefore generated
 * in memory and shared by the test scripts, which means no company data and no
 * binary fixture in the repo.
 *
 * The shape mirrors the real export exactly: header block, section banners,
 * quantity rows, cost lines, intra-section subtotals, a Job Totals row, and the
 * contingency line printed *below* the totals.
 */

const money = (n) => Math.round(n * 100) / 100;

/** Build one job worksheet. `groups` is [{ section, codes: [[code, desc, estQty, est, proj, curMo, actQty, act]] }]. */
export function jobSheet({ jobNo, title, asOf, contract, changeOrders = 0, billed, groups, quantities = [], contingency = 0 }) {
  const net = contract + changeOrders;
  const rows = [];
  const blank = () => rows.push([]);
  const put = (r) => rows.push(r);

  const all = groups.flatMap((g) => g.codes);
  const tot = all.reduce(
    (t, c) => ({ est: t.est + c[3], proj: t.proj + c[4], cur: t.cur + c[5], act: t.act + c[7] }),
    { est: 0, proj: 0, cur: 0, act: 0 }
  );
  const actualCost = money(tot.act);
  const projectedCost = money(tot.proj);

  // Rows 1-7: the header block. Positions are fixed in the real export.
  put(["", "", "", "", "", "", "", `As of ${asOf}`, "", "", "", ""]);
  put(["Job Cost Report - Active Jobs", "", "", "", "", "", "", "", "", "", "", ""]);
  put([`${jobNo}   ${title}`, "", "", "", "", "", "", "", "Actual Cost", "", actualCost, ""]);
  put(["", "Original Contract", contract, "", "", "Net Contract", net, "", "Projected Cost", "", projectedCost, ""]);
  put(["", "Change Orders", changeOrders, "", "", "Amount Billed", billed, "",
       "Est. OH & Profit", "", money(net - projectedCost), net ? money((net - projectedCost) / net) : 0]);
  put(["", "Net Contract", net, "", "", "% Billed", net ? money(billed / net) : 0, "",
       "Net OH & Profit", "", money(net - actualCost), net ? money((net - actualCost) / net) : 0]);
  blank();
  put(["Task", "Description", "Est Qty", "Est Cost", "Projections Total", "Current Mo Act", "Act Qty", "", "Act Cost", "", "Variance", "% of Proj"]);

  for (const g of groups) {
    const s = g.codes.reduce(
      (t, c) => ({ est: t.est + c[3], proj: t.proj + c[4], cur: t.cur + c[5], act: t.act + c[7] }),
      { est: 0, proj: 0, cur: 0, act: 0 }
    );
    // The OTHER banner carries the contingency in Est Cost even though the
    // Job Totals row below excludes it — the real export's one quirk.
    const bannerEst = g.section === "OTHER" ? money(s.est + contingency) : money(s.est);
    put([g.banner, "", "", bannerEst, money(s.proj), money(s.cur), "", "", money(s.act), "",
         money(s.proj - s.act), s.proj ? money(s.act / s.proj) : 0]);

    for (const q of quantities.filter((x) => x.section === g.section)) {
      put([q.stage, q.product, q.est, 0, q.proj, 0, q.act, "", 0, "", q.proj - q.act, q.proj ? money(q.act / q.proj) : 0]);
      put(["", "TASK GROUP TOTAL", q.est, 0, q.proj, 0, q.act, "", 0, "", q.proj - q.act, q.proj ? money(q.act / q.proj) : 0]);
      blank();
    }

    for (const c of g.codes) {
      put([c[0], c[1], c[2], money(c[3]), money(c[4]), money(c[5]), c[6], "", money(c[7]), "",
           money(c[4] - c[7]), c[4] ? money(c[7] / c[4]) : 0]);
    }
    put(["", "TASK GROUP TOTAL", "", money(s.est), money(s.proj), money(s.cur), "", "", money(s.act), "",
         money(s.proj - s.act), s.proj ? money(s.act / s.proj) : 0]);
    blank();
  }

  put(["Job Totals", "", "", money(tot.est), money(tot.proj), money(tot.cur), "", "", money(tot.act), "",
       money(tot.proj - tot.act), tot.proj ? money(tot.act / tot.proj) : 0]);
  blank();
  put(["90.100", "BUDGET - CONTINGENCY", 1, money(contingency), money(contingency), 0, 0, "", 0, "", money(contingency), 0]);

  return { name: jobNo, aoa: rows };
}

const G = (section, banner, codes) => ({ section, banner, codes });

/** A two-plant library: enough to exercise sections, quantities and edge cases. */
export function sampleWorkbooks() {
  return [
    {
      fileName: "Northfield Job Cost Report - Active Jobs.xlsx",
      plant: "Northfield",
      sheets: [
        jobSheet({
          jobNo: "50101", title: "RIVERSIDE PARKING DECK", asOf: "8/26/2026",
          contract: 4_000_000, changeOrders: 120_000, billed: 2_400_000, contingency: 50_000,
          quantities: [
            { section: "D&E", stage: "D&E", product: "ARCHITECTURAL", est: 300, proj: 310, act: 240 },
            { section: "PRODUCTION", stage: "PROD", product: "ARCHITECTURAL (PCS)", est: 300, proj: 310, act: 240 },
            { section: "PRODUCTION", stage: "PROD", product: "ARCHITECTURAL (SQ FT)", est: 40_000, proj: 39_000, act: 30_000 },
            { section: "FIELD", stage: "DELV", product: "ARCHITECTURAL", est: 300, proj: 310, act: 180 },
          ],
          groups: [
            G("D&E", "D&E TASK GROUP TOTAL", [
              ["60.120", "DRAFTING - PIECE DRAWINGS", 900, 70_000, 70_000, 0, 950, 62_000],
              ["60.220", "ENGINEERING DESIGN", 1200, 85_000, 80_000, 1_200, 1150, 71_500],
            ]),
            G("PRODUCTION", "PRODUCTION TASK GROUPS TOTAL", [
              ["20.100", "WELDING SHOP MATERIALS", 1, 140_000, 138_000, 5_000, 1, 120_400],
              ["20.600", "READY MIX - CONCRETE", 0, 0, 62_000, 3_100, 900, 66_500],
              ["30.060", "CARPENTER SHOP LBR", 2400, 96_000, 99_000, 8_100, 2300, 91_200],
              ["30.100", "SOLID WALL (WAS-WSS)", 5100, 210_000, 214_000, 19_000, 5000, 205_800],
            ]),
            G("FIELD", "FIELD TASK GROUPS TOTAL", [
              ["25.110", "DELIVERY", 90, 62_000, 60_000, 0, 40, 26_400],
              ["25.420", "OUTSOURCED ERECTION", 1, 410_000, 415_000, 60_000, 1, 250_000],
              ["40.200", "INSTALLATION WETCAST", 2, 0, 12_000, 4_200, 300, 15_900],
            ]),
            G("OTHER", "OTHER", [
              ["55.100", "HEAVY HAUL", 0, 0, 3_000, 1_100, 120, 4_250],
            ]),
          ],
        }),
        // A job forecast to finish at a loss, and with no quantity rows at all
        // (Monroeville's real reports carry none).
        jobSheet({
          jobNo: "50102", title: "NORTH CAMPUS ANNEX", asOf: "8/26/2026",
          contract: 1_000_000, billed: 900_000, contingency: 0,
          groups: [
            G("PRODUCTION", "PRODUCTION TASK GROUPS TOTAL", [
              ["20.100", "WELDING SHOP MATERIALS", 1, 300_000, 620_000, 40_000, 1, 610_000],
              ["30.060", "CARPENTER SHOP LBR", 800, 200_000, 460_000, 30_000, 900, 455_000],
            ]),
          ],
        }),
        // Degenerate: no contract, nothing booked. Exercises the divide-by-zero
        // paths in every margin and progress calculation.
        jobSheet({
          jobNo: "P20001", title: "SHOP FORM REBUILD", asOf: "8/26/2026",
          contract: 0, billed: 0, contingency: 0,
          groups: [
            G("PRODUCTION", "PRODUCTION TASK GROUPS TOTAL", [
              ["20.500", "FORM MATERIALS", 0, 0, 0, 0, 0, 0],
            ]),
          ],
        }),
      ],
    },
    {
      fileName: "Eastgate Job Cost Report - Active Jobs.xlsx",
      plant: "Eastgate",
      sheets: [
        jobSheet({
          jobNo: "50110", title: "CIVIC CENTER PHASE 2", asOf: "7/31/2026",
          contract: 2_500_000, billed: 1_100_000, contingency: 25_000,
          quantities: [
            { section: "PRODUCTION", stage: "PROD", product: "DOUBLE TEES (PCS)", est: 150, proj: 150, act: 60 },
            { section: "PRODUCTION", stage: "PROD", product: "DOUBLE TEES (SQ FT)", est: 22_000, proj: 22_000, act: 8_800 },
          ],
          groups: [
            G("PRODUCTION", "PRODUCTION TASK GROUPS TOTAL", [
              // Same code number as Northfield's 20.600 but different work —
              // the ambiguity the Cost Codes view has to keep apart.
              ["20.600", "BACKER CEMENT", 0, 0, 41_000, 2_000, 400, 18_900],
              ["30.200", "STANDARD DOUBLE TEE (DTS)", 3000, 150_000, 152_000, 12_000, 1200, 61_000],
            ]),
            G("FIELD", "FIELD TASK GROUPS TOTAL", [
              ["25.420", "OUTSOURCED ERECTION", 1, 300_000, 300_000, 0, 0, 0],
            ]),
          ],
        }),
      ],
    },
  ];
}

export default sampleWorkbooks;
