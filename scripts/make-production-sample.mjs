/**
 * Generate a synthetic Scheduled Production Report shaped like Concrete
 * Vision's, matching the real export's structure exactly: same 20 columns,
 * same "NNNNN - TITLE" job format, same HTML-wrapped bed comments, same
 * zero-quantity bed-activity rows.
 *
 * Fabricated plants, jobs and marks — safe to commit.
 *
 *   node scripts/make-production-sample.mjs > samples/production.sample.csv
 */
const plants = [
  ["Ashland City", ["Pad 1","Pad 2","Pad 5","Pad 10","Mega 6","Mega 12"]],
  ["Hillsboro",    ["Bed A","Bed B","Bed C","Bed D"]],
  ["Jacksonville", ["Pad-3 12 x 40","Pad-8 12 x 40","Long Line 1","Long Line 2","Mega 3"]],
  ["Kissimmee",    ["Form 1","Form 2","Form 7","Wall Bed 1"]],
  ["Pearland",     ["Pad 4","Pad 9","Mega 2"]],
];
const jobs = [
  ["51120", "RIVERBEND PARKING DECK"],
  ["51204", "NORTHGATE TRANSIT CENTER"],
  ["52002", "BELMONT INDUSTRIAL PHASE II"],
  ["52044", "HARBORVIEW MEDICAL DECK"],
  ["52091", "KESTREL LOGISTICS HUB"],
  ["P10088", "CLARK BLOCKS"],
  ["52130P2", "Fairmount Stadium Risers P2"],
];
const phases = ["1 - Building 1","2 - Building 2","1 - Engineering","1 - New Construction","1 - Sound Wall"];
const prd = ["A","WAS","WAI","WSI","DT","IT"];
const leadmen = ["Hector Moreno","Marlon Sanchez","Yianciel Figueroa","Kiubel Marrero"];
const bedNotes = [
  "Build New Mold",
  "Bed Maintenance: Build New Mold",
  "Build New Mold - Building 2 Mold 2",
  "Bed Maintenance",
];

// Deterministic PRNG so regenerating gives an identical file.
let seed = 20260824;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + rnd() * (hi - lo);

const header = ["Plant","Bed Date","Bed Name","Leadman","Phase","Mold","Piece Mark","Qty",
  "Total SF","Total CY","Total LF","Pos","Cert","Job Name","Bed Comment","Prd Code",
  "Cross Section","Cast No.","CTRL Num","Pour No."];
const rows = [header];

let castNo = 230000, pourNo = 500, ctrl = 100;
const start = new Date(2026, 7, 1); // August 2026

for (let day = 0; day < 31; day++) {
  const d = new Date(start);
  d.setDate(start.getDate() + day);
  if (d.getDay() === 0) continue;                       // no Sunday pours
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  for (const [plant, beds] of plants) {
    for (const bed of beds) {
      if (rnd() < 0.35) continue;                       // bed idle that day

      // ~1 in 6 bed-days is maintenance: a zero-qty row carrying a comment
      // and no piece mark, exactly as the real export writes it.
      if (rnd() < 0.16) {
        const [jn, jt] = pick(jobs);
        rows.push([plant, iso, bed, "", "", "", "", 0, 0, 0, 0, "", "",
          `${jn} - ${jt}`,
          `<b>Bed Comment:</b> ${pick(bedNotes)}`,
          "A", "", ++castNo, "", ++pourNo]);
        continue;
      }

      const [jobNo, jobTitle] = pick(jobs);
      const phase = pick(phases);
      const lead = rnd() < 0.2 ? pick(leadmen) : "";
      const pieces = 1 + Math.floor(rnd() * 8);
      const thisPour = ++pourNo;

      for (let p = 1; p <= pieces; p++) {
        const sf = Math.round(between(50, 620));
        rows.push([
          plant, iso, bed, lead, phase,
          rnd() < 0.05 ? `MOLD ${1 + Math.floor(rnd() * 12)}` : "",
          `${pick(["RC","RM","WAS","DT"])}${String(1 + Math.floor(rnd() * 400)).padStart(3, "0")}${rnd() < 0.06 ? " (RL)" : ""}`,
          1, sf,
          +between(1.1, 12).toFixed(2),
          +between(3, 45).toFixed(2),
          p, "",
          `${jobNo} - ${jobTitle}`,
          "N/A",
          pick(prd), pick(prd), ++castNo, String(++ctrl), thisPour,
        ]);
      }
    }
  }
}

const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
process.stdout.write(rows.map((r) => r.map(esc).join(",")).join("\n") + "\n");
