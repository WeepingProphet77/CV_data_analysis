/**
 * Node smoke test over the pure data layer — parsing, coercion, grouping and
 * cumulative math. No DOM involved, so it runs anywhere:
 *
 *   node scripts/smoke-test.mjs
 */
import { readFileSync } from "node:fs";
import { csvToRecords, parseCsv } from "../src/core/csv.js";
import { mapColumns, toIsoDate, toNumber } from "../src/core/parse.js";
import { rollup, cumulativeSeries, dateDomain, topNWithOther, sumBy, distinct } from "../src/core/aggregate.js";
import schema from "../src/modules/employee-time/schema.js";
import { niceTicks } from "../src/components/charts/scale.js";

let failures = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "} ${name}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};
const ok = (name, cond, detail = "") => eq(name + (detail && ` (${detail})`), !!cond, true);

console.log("\nCSV parsing");
eq("quoted comma", parseCsv('a,b\n"x,y",2')[1], ["x,y", "2"]);
eq("escaped quote", parseCsv('a\n"say ""hi"""')[1], ['say "hi"']);
eq("embedded newline", parseCsv('a,b\n"line1\nline2",2')[1], ["line1\nline2", "2"]);
eq("CRLF endings", parseCsv("a,b\r\n1,2\r\n")[1], ["1", "2"]);
eq("BOM stripped", csvToRecords("﻿Hours\n8").headers, ["Hours"]);

console.log("\nCoercion");
eq("ISO passthrough", toIsoDate("2026-03-14"), "2026-03-14");
eq("US slash date", toIsoDate("3/14/2026"), "2026-03-14");
eq("2-digit year", toIsoDate("3/14/26"), "2026-03-14");
eq("Excel serial", toIsoDate(45000), "2023-03-15");
eq("comma number", toNumber("1,234.5"), 1234.5);
eq("paren negative", toNumber("(2.5)"), -2.5);
eq("junk -> 0", toNumber("n/a"), 0);

console.log("\nColumn mapping");
const mapped = mapColumns(
  ["Effective Date","First Name","Last Name","Location","Job Name","GL Code","Labor Task","Deptment","Hours"],
  schema
);
eq("no required columns missing", mapped.missing.map((f) => f.key), []);
eq("CV misspelling 'Deptment' maps", mapped.mapping.dept, "Deptment");
const drifted = mapColumns(["Date","First","Last","Project","Hrs","Department"], schema);
eq("drifted headers still map", drifted.missing.map((f) => f.key), []);
eq("  -> job from 'Project'", drifted.mapping.job, "Project");
const broken = mapColumns(["Foo", "Bar"], schema);
ok("missing columns are reported", broken.missing.length >= 4, `${broken.missing.length} missing`);

console.log("\nSample file end-to-end");
const { headers, records } = csvToRecords(readFileSync("samples/employee-time.sample.csv", "utf8"));
const m2 = mapColumns(headers, schema);
eq("sample maps cleanly", m2.missing.length, 0);

const rows = records.map((rec) => {
  const row = {};
  for (const f of schema.fields) {
    const v = rec[m2.mapping[f.key]];
    row[f.key] = f.type === "date" ? toIsoDate(v) : f.type === "number" ? toNumber(v) : String(v ?? "").trim();
  }
  return { ...row, ...schema.derive(row) };
}).filter((r) => !schema.isEmptyRow(r));

ok("rows parsed", rows.length > 1500, `${rows.length} rows`);
ok("every row has a date", rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)));
ok("every row has hours", rows.every((r) => r.hrs > 0));

console.log("\nAggregation");
const total = sumBy(rows, (r) => r.hrs);
const byJob = rollup(rows, (r) => r.job, (r) => r.hrs);
eq("rollup conserves the total", +byJob.reduce((s, g) => s + g.value, 0).toFixed(4), +total.toFixed(4));
ok("rollup sorted descending", byJob.every((g, i) => i === 0 || byJob[i - 1].value >= g.value));

const { top, other } = topNWithOther(byJob, 3);
eq("topN keeps 3", top.length, 3);
eq("Other conserves the remainder", +(top.reduce((s, g) => s + g.value, 0) + other.value).toFixed(4), +total.toFixed(4));

console.log("\nCumulative math");
const person = distinct(rows, (r) => r.name)[0];
const mine = rows.filter((r) => r.name === person);
const domain = dateDomain(mine, (r) => r.date);
const cum = cumulativeSeries(mine, (r) => r.date, (r) => r.hrs, domain);
ok("monotonically non-decreasing", cum.every((p, i) => i === 0 || p.y >= cum[i - 1].y));
eq("ends at the person's total", +cum[cum.length - 1].y.toFixed(4), +sumBy(mine, (r) => r.hrs).toFixed(4));
eq("one point per domain date", cum.length, domain.length);

// A series carried across a shared domain must stay flat on its idle days.
const oneJob = mine.filter((r) => r.job === mine[0].job);
const carried = cumulativeSeries(oneJob, (r) => r.date, (r) => r.hrs, domain);
eq("carried series spans the full domain", carried.length, domain.length);
ok("carried series never dips", carried.every((p, i) => i === 0 || p.y >= carried[i - 1].y));

console.log("\nAxis ticks");
eq("nice ticks from 0..87", niceTicks(0, 87, 5).ticks, [0, 20, 40, 60, 80, 100]);
ok("degenerate range is safe", niceTicks(0, 0).ticks.length >= 2);

console.log(failures ? `\n${failures} FAILURE(S)\n` : `\nAll checks passed.\n`);
process.exit(failures ? 1 : 0);
