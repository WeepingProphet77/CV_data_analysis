/** Company-wide roll-up: where the money is, and which jobs are in trouble. */
import React, { useMemo } from "react";
import { StatCard, Panel, Badge, MiniBar } from "../../../components/ui.jsx";
import BarChart from "../../../components/charts/BarChart.jsx";
import { money, moneyCompact, ratio, count } from "../../../core/format.js";
import { seriesColor } from "../../../core/palette.js";
import { SECTION_LABELS, SECTIONS } from "../categories.js";

/** Margin bands. Fixed edges, so the same job keeps its band between imports. */
const BANDS = [
  { label: "Losing", max: 0, color: "var(--critical)" },
  { label: "0–10%", max: 0.1, color: "#d95926" },
  { label: "10–20%", max: 0.2, color: "#c98500" },
  { label: "20–30%", max: 0.3, color: "#199e70" },
  { label: "30%+", max: Infinity, color: "#008300" },
];

const bandOf = (r) => BANDS.find((b) => r < b.max) || BANDS[BANDS.length - 1];

export default function Portfolio({ jobs, costs, onOpenJob }) {
  const t = useMemo(() => {
    const s = (f) => jobs.reduce((a, j) => a + f(j), 0);
    const contract = s((j) => j.netContract);
    const projected = s((j) => j.totals.projCost);
    return {
      contract,
      billed: s((j) => j.amountBilled),
      actual: s((j) => j.totals.actCost),
      projected,
      estimate: s((j) => j.totals.estCost),
      curMo: s((j) => j.totals.curMo),
      variance: s((j) => j.totals.variance),
      margin: contract - projected,
      marginPct: contract > 0 ? (contract - projected) / contract : 0,
    };
  }, [jobs]);

  const byPlant = useMemo(() => {
    const m = new Map();
    for (const j of jobs) {
      const p = m.get(j.plant) || { plant: j.plant, jobs: 0, contract: 0, projected: 0, actual: 0, billed: 0, variance: 0 };
      p.jobs++; p.contract += j.netContract; p.projected += j.totals.projCost;
      p.actual += j.totals.actCost; p.billed += j.amountBilled;
      // The report's own variance (projection less actual), summed rather than
      // recomputed, so the column matches what each job's detail page shows.
      p.variance += j.totals.variance;
      m.set(j.plant, p);
    }
    return [...m.values()]
      .map((p) => ({ ...p, margin: p.contract - p.projected, marginPct: p.contract > 0 ? (p.contract - p.projected) / p.contract : 0 }))
      .sort((a, b) => b.contract - a.contract);
  }, [jobs]);

  const bands = useMemo(() => {
    const m = new Map(BANDS.map((b) => [b.label, { ...b, jobs: [], contract: 0 }]));
    for (const j of jobs) {
      const b = m.get(bandOf(j.estOhProfitPct).label);
      b.jobs.push(j); b.contract += j.netContract;
    }
    return [...m.values()];
  }, [jobs]);

  // Ranked by contract so the biggest exposure sorts first, not the worst ratio
  // on a $50k job.
  const atRisk = useMemo(
    () => jobs.filter((j) => j.estOhProfitPct < 0.1).sort((a, b) => a.estOhProfit - b.estOhProfit).slice(0, 12),
    [jobs]
  );

  const bySection = useMemo(() => {
    const m = new Map();
    for (const c of costs) m.set(c.section, (m.get(c.section) || 0) + c.actCost);
    return SECTIONS.filter((s) => m.has(s)).map((s, i) => ({
      key: s, label: SECTION_LABELS[s] || s, value: m.get(s), color: seriesColor(i),
    }));
  }, [costs]);

  const topCategories = useMemo(() => {
    const m = new Map();
    for (const c of costs) m.set(c.category, (m.get(c.category) || 0) + c.actCost);
    return [...m.entries()].sort((a, b) => b[1] - a[1])
      .map(([k, v], i) => ({ key: k, label: k, value: v, color: seriesColor(i) }));
  }, [costs]);

  if (!jobs.length) return <Panel><div className="muted" style={{ padding: 18 }}>No jobs match the current filters.</div></Panel>;

  return (
    <div>
      <div className="cards">
        <StatCard label="Net Contract" value={moneyCompact(t.contract)} sub={`${count(jobs.length)} active jobs`} />
        <StatCard label="Projected Cost" value={moneyCompact(t.projected)} sub={`vs ${moneyCompact(t.estimate)} estimated`} />
        <StatCard label="Actual Cost to Date" value={moneyCompact(t.actual)}
                  sub={`${ratio(t.projected > 0 ? t.actual / t.projected : 0)} of projection`} />
        <StatCard label="Est. OH & Profit" value={moneyCompact(t.margin)} sub={`${ratio(t.marginPct)} of contract`} />
        <StatCard label="Amount Billed" value={moneyCompact(t.billed)}
                  sub={`${ratio(t.contract > 0 ? t.billed / t.contract : 0)} of contract`} small />
        <StatCard label="Current Month Cost" value={moneyCompact(t.curMo)} sub="booked this period" small />
      </div>

      <Panel title="Margin at completion">
        <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>
          Est. OH &amp; Profit % — net contract against <em>projected</em> cost, so this is the margin each job is
          expected to finish at, not the margin booked so far.
        </p>
        <div className="bands">
          {bands.map((b) => (
            <div className="band" key={b.label}>
              <div className="band-bar" style={{ background: b.color, opacity: b.jobs.length ? 1 : 0.25 }} />
              <div className="band-n">{b.jobs.length}</div>
              <div className="band-label">{b.label}</div>
              <div className="band-sub">{moneyCompact(b.contract)}</div>
            </div>
          ))}
        </div>
      </Panel>

      {atRisk.length > 0 && (
        <Panel title={`Jobs under 10% projected margin (${atRisk.length})`}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th><th>Plant</th>
                  <th className="num">Net Contract</th><th className="num">Projected Cost</th>
                  <th className="num">Est. OH &amp; Profit</th><th className="num">Margin</th>
                  <th className="num">Cost Progress</th>
                </tr>
              </thead>
              <tbody>
                {atRisk.map((j) => (
                  <tr key={j.key} className="clickable" onClick={() => onOpenJob?.(j.key)}>
                    <td><span className="muted nowrap">{j.jobNo}</span>{" "}
                        <span className="link">{j.jobTitle || "—"}</span></td>
                    <td className="muted nowrap">{j.plant}</td>
                    <td className="num">{money(j.netContract)}</td>
                    <td className="num">{money(j.totals.projCost)}</td>
                    <td className="num" style={{ color: j.estOhProfit < 0 ? "var(--critical)" : undefined }}>
                      {money(j.estOhProfit)}
                    </td>
                    <td className="num">
                      <Badge tone={j.estOhProfitPct < 0 ? "red" : "amber"}>{ratio(j.estOhProfitPct)}</Badge>
                    </td>
                    <td className="num nowrap">{ratio(j.costProgress)}
                      <MiniBar value={Math.min(j.costProgress, 1)} max={1}
                               color={j.overProjection ? "var(--critical)" : "var(--series-3)"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <div className="grid-2">
        <Panel title="Actual cost by section">
          <BarChart data={bySection} valueFormat={moneyCompact} labelWidth={150} />
        </Panel>
        <Panel title="Actual cost by category">
          <BarChart data={topCategories} valueFormat={moneyCompact} labelWidth={150} />
        </Panel>
      </div>

      <Panel title="Plants">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Plant</th><th className="num">Jobs</th>
                <th className="num">Net Contract</th><th className="num">Billed</th>
                <th className="num">Actual Cost</th><th className="num">Projected Cost</th>
                <th className="num">Variance</th>
                <th className="num">Est. OH &amp; Profit</th><th className="num">Margin</th>
              </tr>
            </thead>
            <tbody>
              {byPlant.map((p) => (
                <tr key={p.plant}>
                  <td className="nowrap">{p.plant}</td>
                  <td className="num">{p.jobs}</td>
                  <td className="num">{money(p.contract)}</td>
                  <td className="num">{money(p.billed)}</td>
                  <td className="num">{money(p.actual)}</td>
                  <td className="num">{money(p.projected)}</td>
                  <td className="num" style={{ color: p.variance < 0 ? "var(--critical)" : undefined }}>{money(p.variance)}</td>
                  <td className="num">{money(p.margin)}</td>
                  <td className="num"><Badge tone={p.marginPct < 0.1 ? "amber" : "green"}>{ratio(p.marginPct)}</Badge></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="nowrap"><strong>All plants</strong></td>
                <td className="num">{jobs.length}</td>
                <td className="num">{money(t.contract)}</td>
                <td className="num">{money(t.billed)}</td>
                <td className="num">{money(t.actual)}</td>
                <td className="num">{money(t.projected)}</td>
                <td className="num" style={{ color: t.variance < 0 ? "var(--critical)" : undefined }}>{money(t.variance)}</td>
                <td className="num">{money(t.margin)}</td>
                <td className="num">{ratio(t.marginPct)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    </div>
  );
}
