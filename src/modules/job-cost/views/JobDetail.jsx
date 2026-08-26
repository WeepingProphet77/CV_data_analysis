/**
 * One job, in full.
 *
 * Per CLAUDE.md §11 a detail view is exhaustive: every field the report carries
 * is listed whether or not it has a value, so "blank for this job" stays
 * distinct from "not in this report". The cost grid reproduces the report's own
 * layout — sections in the order it prints them, subtotals recomputed from the
 * lines rather than read, so the numbers on screen are the numbers being summed.
 */
import React, { useMemo, useState } from "react";
import { BackLink, Panel, Badge, StatCard, MiniBar } from "../../../components/ui.jsx";
import { money, ratio, fmt, count } from "../../../core/format.js";
import { JOB_FIELDS, COST_FIELDS } from "../schema.js";
import { SECTIONS, SECTION_LABELS } from "../categories.js";

const value = (job, f) => {
  const v = job[f.key];
  if (v == null || v === "") return null;
  if (f.type === "money") return money(v);
  if (f.type === "percent") return ratio(v);
  if (f.type === "number") return fmt(v, 0);
  return String(v);
};

/** Sum a measure over a set of cost lines. */
const sum = (lines, k) => lines.reduce((t, c) => t + c[k], 0);

function CostRow({ c }) {
  const over = c.projCost > 0 && c.actCost > c.projCost;
  return (
    <tr>
      <td className="muted nowrap">{c.code}</td>
      <td>{c.desc || <span className="muted">—</span>}</td>
      <td className="num muted">{c.estQty ? fmt(c.estQty, 0) : "—"}</td>
      <td className="num">{money(c.estCost)}</td>
      <td className="num">{money(c.projCost)}</td>
      <td className="num">{c.curMo ? money(c.curMo) : <span className="muted">—</span>}</td>
      <td className="num muted">{c.actQty ? fmt(c.actQty, 0) : "—"}</td>
      <td className="num">{money(c.actCost)}</td>
      <td className="num" style={{ color: c.variance < 0 ? "var(--critical)" : undefined }}>{money(c.variance)}</td>
      <td className="num nowrap">
        {c.projCost > 0 ? ratio(c.pctProj) : <span className="muted">—</span>}
        {c.projCost > 0 && (
          <MiniBar value={Math.min(c.pctProj, 1)} max={1} color={over ? "var(--critical)" : "var(--series-3)"} />
        )}
      </td>
    </tr>
  );
}

export default function JobDetail({ job, costs, quantities, production, onBack, onOpenProduction }) {
  const [showEmpty, setShowEmpty] = useState(true);

  const bySection = useMemo(() => {
    const present = SECTIONS.filter((s) => costs.some((c) => c.section === s));
    const extra = [...new Set(costs.map((c) => c.section))].filter((s) => !SECTIONS.includes(s));
    return [...present, ...extra].map((s) => ({
      section: s,
      label: SECTION_LABELS[s] || s || "Unsectioned",
      lines: costs.filter((c) => c.section === s).sort((a, b) => a.code.localeCompare(b.code)),
    }));
  }, [costs]);

  const t = job.totals;
  const overruns = useMemo(
    () => costs.filter((c) => c.projCost > 0 && c.actCost > c.projCost)
               .sort((a, b) => (b.actCost - b.projCost) - (a.actCost - a.projCost)),
    [costs]
  );

  return (
    <div>
      <BackLink onClick={onBack}>All jobs</BackLink>

      <div className="topbar" style={{ marginTop: 6 }}>
        <div>
          <div className="title">{job.jobNo} — {job.jobTitle || "Untitled"}</div>
          <div className="subtitle">
            {job.plant}{job.asOf ? ` — as of ${job.asOf}` : ""} — {count(costs.length)} cost lines
            {job.sheet && job.sheet !== job.jobNo ? ` — sheet "${job.sheet}"` : ""}
          </div>
        </div>
        {production && (
          <button className="btn" onClick={() => onOpenProduction?.(job.jobNo)}>
            Scheduled in Production →
          </button>
        )}
      </div>

      <div className="cards">
        <StatCard label="Net Contract" value={money(job.netContract)}
                  sub={job.changeOrders ? `incl. ${money(job.changeOrders)} change orders` : "no change orders"} small />
        <StatCard label="Projected Cost" value={money(t.projCost)} sub={`vs ${money(t.estCost)} estimated`} small />
        <StatCard label="Actual Cost" value={money(t.actCost)} sub={`${ratio(job.costProgress)} of projection`} small />
        <StatCard label="Est. OH & Profit" value={money(job.estOhProfit)} sub={ratio(job.estOhProfitPct)} small />
        <StatCard label="Billed" value={money(job.amountBilled)} sub={`${ratio(job.pctBilled)} of contract`} small />
      </div>

      {job.estOhProfitPct < 0 && (
        <div className="notice red">
          Projected cost exceeds the net contract by {money(-job.estOhProfit)} — this job is forecast to finish at a loss.
        </div>
      )}
      {!job.hasJobTotals && (
        <div className="notice amber">
          This sheet carried no “Job Totals” row; the totals shown are summed from its cost lines.
        </div>
      )}

      {quantities.length > 0 && (
        <Panel title="Quantities">
          <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>
            The report tracks pieces and square feet through three stages. These rows carry no cost —
            their “Projections Total” and “Variance” columns hold quantities, not dollars.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Stage</th><th>Product</th>
                  <th className="num">Estimated</th><th className="num">Projected</th>
                  <th className="num">Actual</th><th className="num">Remaining</th><th className="num">Complete</th>
                </tr>
              </thead>
              <tbody>
                {quantities.map((q, i) => (
                  <tr key={i}>
                    <td className="nowrap"><Badge>{q.stageLabel}</Badge></td>
                    <td>{q.product}</td>
                    <td className="num">{fmt(q.estQty, 0)}</td>
                    <td className="num">{fmt(q.projQty, 0)}</td>
                    <td className="num">{fmt(q.actQty, 0)}</td>
                    <td className="num muted">{fmt(q.varianceQty, 0)}</td>
                    <td className="num nowrap">
                      {q.projQty > 0 ? ratio(q.pctProj) : <span className="muted">—</span>}
                      {q.projQty > 0 && <MiniBar value={Math.min(q.pctProj, 1)} max={1} color="var(--series-1)" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {overruns.length > 0 && (
        <Panel title={`Lines over projection (${overruns.length})`}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Task</th><th>Description</th><th className="num">Projected</th><th className="num">Actual</th><th className="num">Over by</th><th className="num">% of Proj</th></tr>
              </thead>
              <tbody>
                {overruns.map((c, i) => (
                  <tr key={i}>
                    <td className="muted nowrap">{c.code}</td>
                    <td>{c.desc || <span className="muted">—</span>}</td>
                    <td className="num">{money(c.projCost)}</td>
                    <td className="num">{money(c.actCost)}</td>
                    <td className="num" style={{ color: "var(--critical)" }}>{money(c.actCost - c.projCost)}</td>
                    <td className="num">{ratio(c.pctProj)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel title="Cost detail">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {COST_FIELDS.map((f) => (
                  <th key={f.key} className={["estQty","estCost","projCost","curMo","actQty","actCost","variance","pctProj"].includes(f.key) ? "num" : ""}
                      title={f.note || undefined}>
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            {bySection.map((s) => (
              <tbody key={s.section || "none"}>
                <tr className="grouprow"><td colSpan={COST_FIELDS.length}>{s.label}</td></tr>
                {s.lines.map((c, i) => <CostRow key={`${c.code}-${i}`} c={c} />)}
                <tr className="subtotalrow">
                  <td />
                  <td>{s.label} subtotal</td>
                  <td className="num" />
                  <td className="num">{money(sum(s.lines, "estCost"))}</td>
                  <td className="num">{money(sum(s.lines, "projCost"))}</td>
                  <td className="num">{money(sum(s.lines, "curMo"))}</td>
                  <td className="num" />
                  <td className="num">{money(sum(s.lines, "actCost"))}</td>
                  <td className="num">{money(sum(s.lines, "variance"))}</td>
                  <td className="num" />
                </tr>
              </tbody>
            ))}
            <tfoot>
              <tr>
                <td /><td><strong>Job totals</strong></td><td />
                <td className="num">{money(t.estCost)}</td>
                <td className="num">{money(t.projCost)}</td>
                <td className="num">{money(t.curMo)}</td>
                <td />
                <td className="num">{money(t.actCost)}</td>
                <td className="num">{money(t.variance)}</td>
                <td className="num">{t.projCost > 0 ? ratio(t.actCost / t.projCost) : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {job.contingency && (
          <p className="hint" style={{ marginTop: 10 }}>
            <strong style={{ color: "var(--text-secondary)" }}>{job.contingency.code} {job.contingency.desc}:</strong>{" "}
            {money(job.contingency.estCost)} estimated, {money(job.contingency.actCost)} actual. The report prints this
            below the Job Totals row and excludes it from them, so it is excluded here too.
          </p>
        )}
      </Panel>

      <Panel
        title="Every field on this job"
        actions={
          <label className="hint" style={{ cursor: "pointer", display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
            show fields that are empty
          </label>
        }
      >
        <dl className="fieldlist">
          {JOB_FIELDS.map((f) => {
            const v = value(job, f);
            if (v == null && !showEmpty) return null;
            return (
              <React.Fragment key={f.key}>
                <dt title={f.note || undefined}>{f.label}{f.note ? " ⓘ" : ""}</dt>
                <dd>
                  {v ?? <span className="muted">— empty —</span>}
                  {f.note && <div className="hint" style={{ marginTop: 2 }}>{f.note}</div>}
                </dd>
              </React.Fragment>
            );
          })}
        </dl>
      </Panel>
    </div>
  );
}
