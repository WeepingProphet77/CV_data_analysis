/**
 * Drafting & Engineering — the role dashboard.
 *
 * Everything here is the D&E section (60.x) of the loaded reports, cut the way
 * an engineering lead reads it rather than the way the accounting report prints
 * it: hours against budget, design progress against the money going out the
 * door, and which projects are drifting.
 *
 * It honours the My Projects scope like every other tab, and is most useful
 * with it on — hence the nudge when it is off.
 */
import React, { useMemo } from "react";
import { StatCard, Panel, Badge, MiniBar, SortableTh, useSort, compareBy } from "../../../components/ui.jsx";
import BarChart from "../../../components/charts/BarChart.jsx";
import { money, moneyCompact, ratio, count, fmt, perSf, sqft } from "../../../core/format.js";
import { seriesColor, OTHER_COLOR } from "../../../core/palette.js";
import { topNWithOther } from "../../../core/aggregate.js";
import { engineeringRollup, RATE_BAND } from "../engineering.js";

const MAX_BARS = 8;
const hrs = (n) => fmt(n, 0);

/** Ranked bars, folding everything past the eight validated slots into "Other". */
function rankedBars(rows) {
  const { top, other } = topNWithOther(rows.filter((r) => r.value > 0), MAX_BARS);
  const bars = top.map((r, i) => ({ key: r.key, label: r.label ?? r.key, value: r.value, color: seriesColor(i) }));
  if (other) bars.push({ key: "Other", value: other.value, color: OTHER_COLOR, label: `Other (${other.memberCount})` });
  return bars;
}

const jobLabel = (j) => `${j.jobNo} ${j.jobTitle}`.slice(0, 34);

export default function Engineering({ jobs, costs, quantities, mine, onOpenJob, onScopeToMine }) {
  const [sort, onSort] = useSort("actCost");
  const r = useMemo(() => engineeringRollup(jobs, costs, quantities), [jobs, costs, quantities]);
  const t = r.totals;

  const byJobSorted = useMemo(() => [...r.byJob].sort(compareBy(sort.col, sort.dir)), [r.byJob, sort]);

  const disciplineBars = useMemo(
    () => r.byDiscipline.map((d, i) => ({ key: d.id, label: d.label, value: d.actCost, color: seriesColor(i) })),
    [r.byDiscipline]
  );
  const projectBars = useMemo(
    () => rankedBars(r.byJob.map((j) => ({ key: j.key, label: jobLabel(j), value: j.actCost }))),
    [r.byJob]
  );
  const hourBars = useMemo(
    () => rankedBars(r.byJob.map((j) => ({ key: j.key, label: jobLabel(j), value: j.hoursAct }))),
    [r.byJob]
  );

  // Design trailing the job's overall spend: the "needs my attention" list.
  const lagging = useMemo(
    () => r.byJob.filter((j) => j.hasPieces && j.designLag > 0.05).sort((a, b) => b.designLag - a.designLag),
    [r.byJob]
  );
  const overBudget = useMemo(
    () => r.byJob.filter((j) => j.hoursEst > 0 && j.hoursAct > j.hoursEst)
                 .sort((a, b) => (b.hoursAct - b.hoursEst) - (a.hoursAct - a.hoursEst)),
    [r.byJob]
  );

  if (!r.byJob.length) {
    return (
      <Panel title="Drafting & Engineering">
        <div className="muted" style={{ padding: 18, lineHeight: 1.8 }}>
          None of the jobs in view carry a D&amp;E section. Widen the filters, or load a plant whose
          report includes engineering cost codes.
        </div>
      </Panel>
    );
  }

  const hoursOver = t.hoursEst > 0 && t.hoursAct > t.hoursEst;
  const sumBy = (rows, f) => rows.reduce((s, x) => s + f(x), 0);

  return (
    <div>
      {!mine.active && (
        <div className="notice">
          Showing <strong>all {count(t.jobs)} jobs</strong> with a D&amp;E section.{" "}
          <button className="btn ghost" onClick={onScopeToMine}>Scope to My Projects</button>
        </div>
      )}

      <div className="cards">
        <StatCard label="Budget" value={moneyCompact(t.estCost)}
                  sub="Est Cost — the original estimate" />
        <StatCard label="Forecast" value={moneyCompact(t.projCost)}
                  sub={t.forecastShift === 0
                    ? "unchanged from budget"
                    : `${t.forecastShift > 0 ? "+" : ""}${moneyCompact(t.forecastShift)} vs budget`} />
        <StatCard label="Actual Cost" value={moneyCompact(t.actCost)}
                  sub={`${ratio(t.pctProj)} of forecast · ${ratio(t.pctBudget)} of budget`} />
        <StatCard label="Variance to Forecast" value={moneyCompact(t.variance)}
                  sub="the report's own Variance column" />
        <StatCard label="Variance to Budget" value={moneyCompact(t.varToBudget)}
                  sub="derived — not a report column" />
        <StatCard label="Pieces Designed" value={count(Math.round(t.piecesAct))}
                  sub={`${ratio(t.designPct)} of ${count(Math.round(t.piecesProj))} forecast`} small />
        <StatCard label="Outsourced" value={moneyCompact(t.outsourcedAct)}
                  sub={`${ratio(t.outsourcedShare)} of D&E cost`} small />
        <StatCard label="Booked This Month" value={moneyCompact(t.curMo)} sub="D&E only" small />
      </div>

      {t.forecastShift > 0 && (
        <div className="notice amber">
          D&amp;E is forecast at <strong>{money(t.projCost)}</strong> against an original estimate of{" "}
          {money(t.estCost)} — <strong>{moneyCompact(t.forecastShift)} above budget</strong> across{" "}
          {count(t.jobs)} jobs, before the remaining {money(t.variance)} of forecast is spent.
        </div>
      )}

      {t.sfJobs > 0 && (
        <Panel title="D&E cost per square foot">
          <div className="cards">
            <StatCard label="Budget / SF" value={perSf(t.perSfBudget)} sub="D&E Est Cost per foot" />
            <StatCard label="Forecast / SF" value={perSf(t.perSfForecast)} sub="D&E projected per foot" />
            <StatCard label="Actual / SF" value={perSf(t.perSfActual)} sub="D&E spent per foot so far" />
            <StatCard label="Job Square Feet" value={sqft(t.sfArea.job)} sub={`over ${count(t.sfJobs)} jobs`} small />
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Engineering cost per square foot, over the {count(t.sfJobs)} of {count(t.jobs)} D&amp;E jobs that
            report footage. All three divide by the <strong>job square footage</strong> — not the area cast so
            far — so budget, forecast and actual read against each other directly, and actual rises toward
            forecast as the design work completes.
          </p>
        </Panel>
      )}

      <div className="grid-2">
        <Panel title="D&E cost by discipline">
          <BarChart data={disciplineBars} valueFormat={moneyCompact} labelWidth={130} />
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr>
                  <th>Discipline</th>
                  <th className="num">Budget</th><th className="num">Forecast</th><th className="num">Actual</th>
                  <th className="num" title="The report's own Variance column: Forecast less Actual">Variance to Forecast</th>
                  <th className="num" title="Derived: Budget less Actual. Not a column in the report.">Variance to Budget</th>
                </tr>
              </thead>
              <tbody>
                {r.byDiscipline.map((d) => (
                  <tr key={d.id}>
                    <td className="nowrap">{d.label}</td>
                    <td className="num">{money(d.estCost)}</td>
                    <td className="num">{money(d.projCost)}</td>
                    <td className="num">{money(d.actCost)}</td>
                    <td className="num" style={{ color: d.variance < 0 ? "var(--critical)" : undefined }}>{money(d.variance)}</td>
                    <td className="num" style={{ color: d.varToBudget < 0 ? "var(--critical)" : undefined }}>{money(d.varToBudget)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td><strong>Total</strong></td>
                  <td className="num">{money(t.estCost)}</td>
                  <td className="num">{money(t.projCost)}</td>
                  <td className="num">{money(t.actCost)}</td>
                  <td className="num" style={{ color: t.variance < 0 ? "var(--critical)" : undefined }}>{money(t.variance)}</td>
                  <td className="num" style={{ color: t.varToBudget < 0 ? "var(--critical)" : undefined }}>{money(t.varToBudget)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>

        <Panel title="D&E cost by project">
          <BarChart data={projectBars} valueFormat={moneyCompact} labelWidth={210}
                    onSelect={(k) => k !== "Other" && onOpenJob?.(k)} />
        </Panel>
      </div>

      <Panel title={`Design behind spend (${lagging.length})`}>
          <p className="hint" style={{ marginTop: -4, marginBottom: 8 }}>
            Pieces designed against how far the whole job has spent. A job spending faster than it is being
            designed is the one to look at first.
          </p>
          <div className="table-wrap" style={{ maxHeight: 300 }}>
            <table>
              <thead>
                <tr><th>Job</th><th className="num">Designed</th><th className="num">Job Spent</th><th className="num">Behind By</th></tr>
              </thead>
              <tbody>
                {lagging.map((j) => (
                  <tr key={j.key} className="clickable" onClick={() => onOpenJob(j.key)}>
                    <td><span className="muted nowrap">{j.jobNo}</span>{" "}<span className="link">{j.jobTitle || "—"}</span></td>
                    <td className="num nowrap">
                      {ratio(j.designPct)}
                      <MiniBar value={Math.min(j.designPct, 1)} max={1} color="var(--series-1)" />
                    </td>
                    <td className="num">{ratio(j.jobPct)}</td>
                    <td className="num"><Badge tone={j.designLag > 0.2 ? "red" : "amber"}>{(j.designLag * 100).toFixed(0)} pts</Badge></td>
                  </tr>
                ))}
                {!lagging.length && (
                  <tr><td colSpan={4} className="muted" style={{ padding: 14 }}>
                    No job is designing behind its spend by more than 5 points.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
      </Panel>

      <Panel title="Every D&E project">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortableTh column="jobNo" label="Job No" sort={sort} onSort={onSort} />
                <SortableTh column="jobTitle" label="Job" sort={sort} onSort={onSort} />
                <SortableTh column="plant" label="Plant" sort={sort} onSort={onSort} />
                <SortableTh column="estCost" label="Budget" sort={sort} onSort={onSort} align="right" />
                <SortableTh column="projCost" label="Forecast" sort={sort} onSort={onSort} align="right" />
                <SortableTh column="actCost" label="Actual" sort={sort} onSort={onSort} align="right" />
                <SortableTh column="variance" label="Variance to Forecast" sort={sort} onSort={onSort} align="right" />
                <SortableTh column="varToBudget" label="Variance to Budget" sort={sort} onSort={onSort} align="right" />
                <SortableTh column="pctProj" label="% of Fcst" sort={sort} onSort={onSort} align="right" />
                <SortableTh column="perSfBudget" label="Budget / SF" sort={sort} onSort={onSort} align="right" />
                <SortableTh column="perSfActual" label="Actual / SF" sort={sort} onSort={onSort} align="right" />
                <SortableTh column="piecesAct" label="Pieces" sort={sort} onSort={onSort} align="right" />
                <SortableTh column="designPct" label="Designed" sort={sort} onSort={onSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {byJobSorted.map((j) => (
                <tr key={j.key} className="clickable" onClick={() => onOpenJob(j.key)}>
                  <td className="muted nowrap">{j.jobNo}</td>
                  <td className="link" style={{ maxWidth: 220 }} title={j.jobTitle}>{j.jobTitle || "—"}</td>
                  <td className="muted nowrap">{j.plant}</td>
                  <td className="num">{money(j.estCost)}</td>
                  <td className="num">{money(j.projCost)}</td>
                  <td className="num">{money(j.actCost)}</td>
                  <td className="num" style={{ color: j.variance < 0 ? "var(--critical)" : undefined }}>{money(j.variance)}</td>
                  <td className="num" style={{ color: j.varToBudget < 0 ? "var(--critical)" : undefined }}>{money(j.varToBudget)}</td>
                  <td className="num nowrap">
                    {j.projCost > 0 ? ratio(j.pctProj) : <span className="muted">—</span>}
                    {j.projCost > 0 && (
                      <MiniBar value={Math.min(j.pctProj, 1)} max={1}
                               color={j.overProjection ? "var(--critical)" : "var(--series-3)"} />
                    )}
                  </td>
                  <td className="num">{j.perSfBudget == null
                    ? <span className="muted" title="This job reports no square footage">—</span>
                    : perSf(j.perSfBudget)}</td>
                  <td className="num">{j.perSfActual == null ? <span className="muted">—</span> : perSf(j.perSfActual)}</td>
                  <td className="num">{j.hasPieces ? count(Math.round(j.piecesAct)) : <span className="muted">—</span>}</td>
                  <td className="num nowrap">
                    {j.hasPieces
                      ? <>{ratio(j.designPct)}<MiniBar value={Math.min(j.designPct, 1)} max={1} color="var(--series-1)" /></>
                      : <span className="muted" title="This plant's report carries no quantity rows">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}><strong>Total — {count(r.byJob.length)} jobs</strong></td>
                <td className="num">{money(t.estCost)}</td>
                <td className="num">{money(t.projCost)}</td>
                <td className="num">{money(t.actCost)}</td>
                <td className="num" style={{ color: t.variance < 0 ? "var(--critical)" : undefined }}>{money(t.variance)}</td>
                <td className="num" style={{ color: t.varToBudget < 0 ? "var(--critical)" : undefined }}>{money(t.varToBudget)}</td>
                <td className="num">{ratio(t.pctProj)}</td>
                <td className="num">{perSf(t.perSfBudget)}</td>
                <td className="num">{perSf(t.perSfActual)}</td>
                <td className="num">{count(Math.round(t.piecesAct))}</td>
                <td className="num">{ratio(t.designPct)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      <Panel title="D&E cost codes">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Task</th><th>Description</th><th>Discipline</th><th className="num">Jobs</th>
                <th className="num">Budget</th><th className="num">Forecast</th><th className="num">Actual</th>
                <th className="num">Variance to Forecast</th><th className="num">Variance to Budget</th>
              </tr>
            </thead>
            <tbody>
              {r.byCode.map((c) => (
                <tr key={c.key}>
                  <td className="muted nowrap">{c.code}</td>
                  <td>{c.desc || <span className="muted">(no description)</span>}</td>
                  <td className="muted nowrap">{c.discipline}</td>
                  <td className="num">{c.jobs}</td>
                  <td className="num">{money(c.estCost)}</td>
                  <td className="num">{money(c.projCost)}</td>
                  <td className="num">{money(c.actCost)}</td>
                  <td className="num" style={{ color: c.variance < 0 ? "var(--critical)" : undefined }}>{money(c.variance)}</td>
                  <td className="num" style={{ color: c.varToBudget < 0 ? "var(--critical)" : undefined }}>{money(c.varToBudget)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}><strong>Total</strong></td>
                <td className="num">{money(t.estCost)}</td>
                <td className="num">{money(t.projCost)}</td>
                <td className="num">{money(t.actCost)}</td>
                <td className="num" style={{ color: t.variance < 0 ? "var(--critical)" : undefined }}>{money(t.variance)}</td>
                <td className="num" style={{ color: t.varToBudget < 0 ? "var(--critical)" : undefined }}>{money(t.varToBudget)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>


      {/*
        Hours sit below the money on purpose. The report labels these columns
        "Est/Act Qty", not hours -- reading them as hours is an inference from
        the implied rate, and it only holds cleanly on about half the lines that
        carry quantities on both sides. Useful in aggregate, not to be quoted
        per job without checking.
      */}
      <h3 className="section-label" style={{ marginTop: 26 }}>Hours and rates — see the caveat</h3>

      <div className="notice">
        The report's <strong>Est Qty</strong> and <strong>Act Qty</strong> columns are read here as hours.
        That is an inference, not a label the report carries: on in-house labor codes the implied
        cost-per-unit lands on standard rates (${RATE_BAND.min}–${RATE_BAND.max}/hr), which is
        what makes it credible. It holds less well line by line — of {count(t.hoursAgreement.lines)} lines
        carrying quantities on both sides, {count(t.hoursAgreement.agree)} ({ratio(t.hoursAgreement.pct)})
        have an estimated rate within 15% of their actual. Treat the totals as indicative and a single
        job's hours as soft. Outsourced codes are excluded entirely — there the quantity is a contract
        count, not hours.
      </div>

      <div className="cards">
        <StatCard label="Hours Booked" value={hrs(t.hoursAct)} sub={`vs ${hrs(t.hoursEst)} estimated`} small />
        <StatCard label="Hours vs Estimate"
                  value={`${hoursOver ? "+" : ""}${hrs(t.hoursAct - t.hoursEst)}`}
                  sub={t.hoursEst > 0 ? `${ratio(t.hoursAct / t.hoursEst)} of estimate` : "no estimate"} small />
        <StatCard label="Blended Rate" value={`$${t.rateAct.toFixed(0)}/hr`}
                  sub={`est $${t.rateEst.toFixed(0)}/hr`} small />
        <StatCard label="Lump Sums Excluded" value={moneyCompact(t.lumpSumCost)}
                  sub={`${t.lumpSumLines} line(s) — cost kept, hours withheld`} small />
      </div>

      {hoursOver && (
        <div className="notice amber">
          Drafting and engineering have booked <strong>{hrs(t.hoursAct - t.hoursEst)} hours beyond
          estimate</strong> ({ratio(t.hoursAct / t.hoursEst)} of budget) while the blended rate held near
          estimate (${t.rateAct.toFixed(0)}/hr against ${t.rateEst.toFixed(0)}/hr) — the overrun is hours,
          not rate.
        </div>
      )}

      <div className="grid-2">
      <Panel title="Hours booked by project">
        <BarChart data={hourBars} valueFormat={(v) => `${hrs(v)} h`} labelWidth={210}
                  onSelect={(k) => k !== "Other" && onOpenJob?.(k)} />
      </Panel>

        <Panel title="Hours and rate by code">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Task</th><th>Discipline</th>
                  <th className="num">Est Hrs</th><th className="num">Act Hrs</th>
                  <th className="num">Est Rate</th><th className="num">Act Rate</th>
                </tr>
              </thead>
              <tbody>
                {r.byCode.filter((c) => c.hoursEst > 0 || c.hoursAct > 0).map((c) => (
                  <tr key={c.key}>
                    <td className="nowrap"><span className="muted">{c.code}</span> {c.desc}</td>
                    <td className="muted nowrap">{c.discipline}</td>
                    <td className="num">{c.hoursEst > 0 ? hrs(c.hoursEst) : <span className="muted">—</span>}</td>
                    <td className="num">{c.hoursAct > 0 ? hrs(c.hoursAct) : <span className="muted">—</span>}</td>
                    <td className="num">{c.rateEst > 0 ? `$${c.rateEst.toFixed(0)}` : <span className="muted">—</span>}</td>
                    <td className="num">{c.rateAct > 0 ? `$${c.rateAct.toFixed(0)}` : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}><strong>Total</strong></td>
                  <td className="num">{hrs(t.hoursEst)}</td>
                  <td className="num">{hrs(t.hoursAct)}</td>
                  <td className="num">${t.rateEst.toFixed(0)}</td>
                  <td className="num">${t.rateAct.toFixed(0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
      </div>

      {overBudget.length > 0 && (
        <Panel title={`Over estimated hours (${overBudget.length})`}>
          <div className="table-wrap" style={{ maxHeight: 320 }}>
            <table>
              <thead>
                <tr>
                  <th>Job</th><th>Plant</th>
                  <th className="num">Est Hours</th><th className="num">Actual Hours</th>
                  <th className="num">Over By</th><th className="num">Of Estimate</th><th className="num">D&E Cost</th>
                </tr>
              </thead>
              <tbody>
                {overBudget.map((j) => (
                  <tr key={j.key} className="clickable" onClick={() => onOpenJob(j.key)}>
                    <td><span className="muted nowrap">{j.jobNo}</span>{" "}<span className="link">{j.jobTitle || "—"}</span></td>
                    <td className="muted nowrap">{j.plant}</td>
                    <td className="num">{hrs(j.hoursEst)}</td>
                    <td className="num">{hrs(j.hoursAct)}</td>
                    <td className="num" style={{ color: "var(--critical)" }}>{hrs(j.hoursAct - j.hoursEst)}</td>
                    <td className="num">{ratio(j.hoursAct / j.hoursEst)}</td>
                    <td className="num">{money(j.actCost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}><strong>Total</strong></td>
                  <td className="num">{hrs(sumBy(overBudget, (j) => j.hoursEst))}</td>
                  <td className="num">{hrs(sumBy(overBudget, (j) => j.hoursAct))}</td>
                  <td className="num">{hrs(sumBy(overBudget, (j) => j.hoursAct - j.hoursEst))}</td>
                  <td className="num" />
                  <td className="num">{money(sumBy(overBudget, (j) => j.actCost))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
      )}
      {r.lumpSum.length > 0 && (
        <Panel title={`Lump sums booked to a labor code (${r.lumpSum.length})`}>
          <p className="hint" style={{ marginTop: -4, marginBottom: 8 }}>
            These in-house lines carry cost that cannot be read as hours — {money(t.lumpSumCost)} in total.
            The cost is included in every total above; only the hours are excluded, so the blended rate is
            not distorted.
          </p>
          <div className="table-wrap" style={{ maxHeight: 260 }}>
            <table>
              <thead>
                <tr><th>Job</th><th>Plant</th><th>Task</th><th className="num">Qty</th><th className="num">Actual</th><th className="num">Implied</th></tr>
              </thead>
              <tbody>
                {r.lumpSum.map((l, i) => (
                  <tr key={`${l.jobKey}-${l.code}-${i}`}>
                    <td className="muted nowrap">{l.jobNo}</td>
                    <td className="muted nowrap">{l.plant}</td>
                    <td className="nowrap">{l.code} {l.desc}</td>
                    <td className="num">{fmt(l.actQty, 2)}</td>
                    <td className="num">{money(l.actCost)}</td>
                    <td className="num muted">{l.actQty > 0 ? `$${(l.actCost / l.actQty).toFixed(0)}/unit` : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}><strong>Total</strong></td>
                  <td className="num">{money(t.lumpSumCost)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
      )}

      {t.rework > 0 && (
        <div className="notice amber">
          {money(t.rework)} booked to D&amp;E rework codes across the jobs in view.
        </div>
      )}
    </div>
  );
}
