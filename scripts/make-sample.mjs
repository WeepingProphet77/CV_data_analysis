/**
 * Generate a synthetic employee-time export shaped like Concrete Vision's.
 * Entirely fabricated names and jobs — this is for demoing and testing the
 * dashboard without putting real company data anywhere near the repo.
 *
 *   node scripts/make-sample.mjs > samples/employee-time.sample.csv
 */
const people = [
  ["Dana", "Whitfield", "Plant 1", "Engineering"],
  ["Marcus", "Ohara", "Plant 1", "Engineering"],
  ["Priya", "Raman", "Plant 2", "Engineering"],
  ["Tomas", "Lindqvist", "Plant 2", "Drafting"],
  ["Alice", "Boonyasak", "Plant 1", "Drafting"],
  ["Ruben", "Castellanos", "Plant 3", "Engineering"],
  ["Nia", "Okonkwo", "Plant 3", "QC"],
  ["Sam", "Petrov", "Plant 2", "QC"],
  ["Iris", "Hollander", "Plant 1", "Engineering"],
  ["Kofi", "Mensah", "Plant 3", "Drafting"],
];
const jobs = [
  ["24-1180 Riverside Parking Structure", "5100"],
  ["24-1207 Northgate Transit Center", "5100"],
  ["25-1002 Belmont Industrial Phase II", "5110"],
  ["25-1044 Harborview Medical Deck", "5110"],
  ["25-1091 Kestrel Logistics Hub", "5120"],
  ["25-1130 Fairmount Stadium Risers", "5120"],
  ["OVERHEAD - General Engineering", "6000"],
  ["OVERHEAD - Training", "6010"],
];
const tasks = [
  "DESIGN - Member Design", "DESIGN - Connection Design", "DRAFT - Erection Drawings",
  "DRAFT - Piece Tickets", "QC - Shop Review", "PM - Coordination", "ADMIN - Meetings",
];

// Deterministic PRNG so regenerating the sample gives an identical file.
let seed = 20260824;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const rows = [["Effective Date","First Name","Last Name","Location","Job Name","GL Code","Labor Task","Deptment","Hours"]];
const start = new Date(2026, 0, 5);

for (let day = 0; day < 168; day++) {
  const d = new Date(start); d.setDate(start.getDate() + day);
  if (d.getDay() === 0 || d.getDay() === 6) continue;          // weekdays only
  const iso = d.toISOString().slice(0, 10);

  for (const [first, last, loc, dept] of people) {
    if (rnd() < 0.08) continue;                                 // out that day
    let left = 8;
    const charges = 1 + Math.floor(rnd() * 3);
    for (let c = 0; c < charges && left > 0.4; c++) {
      const hrs = c === charges - 1 ? left : Math.max(0.5, Math.round(rnd() * left * 2) / 2);
      const [job, gl] = pick(jobs);
      rows.push([iso, first, last, loc, job, gl, pick(tasks), dept, hrs.toFixed(1)]);
      left = +(left - hrs).toFixed(1);
    }
  }
}

const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
process.stdout.write(rows.map((r) => r.map(esc).join(",")).join("\n") + "\n");
