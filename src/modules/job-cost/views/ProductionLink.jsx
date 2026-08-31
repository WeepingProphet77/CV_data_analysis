/**
 * Cost against the production schedule.
 *
 * Two systems, one set of jobs. The join key is the job *number*: Concrete
 * Vision writes "43134 - 1401 CHURCH STREET" and the cost report writes
 * "43134   1401 CHURCH STREET MOTLEY T1", so the numbers match where the names
 * do not. Plants do not correspond one-to-one (CV splits Hillsboro into
 * architectural and structural), which is what plants.js exists to reconcile.
 *
 * The two datasets also answer different questions and must not be read as one:
 * the cost report's PROD quantities are cumulative *to date*, while the
 * production dataset is a *forward* month of scheduled pours. So this compares
 * progress-to-date against what is booked next, and never adds them together.
 */
import React, { useMemo } from "react";
import { Panel, Badge, StatCard, MiniBar, SortableTh, useSort, compareBy } from "../../../components/ui.jsx";
import { money, moneyCompact, ratio, count, fmt } from "../../../core/format.js";
import { costPlantFor, isUnmappedProductionPlant } from "../plants.js";

/** Pieces and square feet a job has produced to date, from its PROD rows. */
function producedTotals(quantities) {
  let pcsEst = 0, pcsProj = 0, pcsAct = 0, sfEst = 0, sfProj = 0, sfAct = 0, any = false;
  for (const q of quantities) {
    if (q.stage !== "PROD") continue;
    any = true;
    const sf = /\(SQ\s*FT\)/i.test(q.product);
    if (sf) { sfEst += q.estQty; sfProj += q.projQty; sfAct += q.actQty; }
    else { pcsEst += q.estQty; pcsProj += q.projQty; pcsAct += q.actQty; }
  }
  return { any, pcsEst, pcsProj, pcsAct, sfEst, sfProj, sfAct };
}

export default function ProductionLink({ jobs, qtyByJob, production, onOpenJob }) {
  const [sort, onSort] = useSort("actCost");

  const sched = useMemo(() => {
    const m = new Map();
    for (const r of production) {
      const no = r.jobNo;
      if (!no) continue;
      let e = m.get(no);
      if (!e) { e = { jobNo: no, jobTitle: r.jobTitle, pieces: 0, sf: 0, cy: 0, dates: new Set(), plants: new Set(), beds: new Set() }; m.set(no, e); }
      e.pieces += r.qty; e.sf += r.sf; e.cy += r.cy;
      if (r.date) e.dates.add(r.date);
      if (r.plant) e.plants.add(r.plant);
      if (r.bedKey) e.beds.add(r.bedKey);
    }
    return m;
  }, [production]);

  const rows = useMemo(() => {
    const out = [];
    for (const j of jobs) {
      const s = sched.get(j.jobNo);
      if (!s) continue;
      const q = producedTotals(qtyByJob.get(j.key) || []);
      const dates = [...s.dates].sort();
      out.push({
        key: j.key, jobNo: j.jobNo, jobTitle: j.jobTitle, plant: j.plant,
        prodPlants: [...s.plants],
        // A CV plant that maps to a different cost plant than the one this job
        // was costed under is a mapping gap, not a data error -- flag it.
        plantMismatch: [...s.plants].some((p) => costPlantFor(p) !== j.plant),
        actCost: j.totals.actCost,
        projCost: j.totals.projCost,
        costProgress: j.costProgress,
        marginPct: j.estOhProfitPct,
        hasQty: q.any,
        pcsAct: q.pcsAct, pcsProj: q.pcsProj,
        qtyProgress: q.pcsProj > 0 ? q.pcsAct / q.pcsProj : 0,
        sfAct: q.sfAct, sfProj: q.sfProj,
        schedPieces: s.pieces, schedSf: s.sf, schedCy: s.cy,
        schedDays: s.dates.size, schedBeds: s.beds.size,
        first: dates[0] || "", last: dates[dates.length - 1] || "",
        // Remaining pieces to produce, against what the month has booked.
        remaining: Math.max(q.pcsProj - q.pcsAct, 0),
      });
    }
    return out.sort(compareBy(sort.col, sort.dir));
  }, [jobs, sched, qtyByJob, sort]);

  const unmatched = useMemo(() => {
    const costNos = new Set(jobs.map((j) => j.jobNo));
    const scheduledOnly = [...sched.values()].filter((s) => !costNos.has(s.jobNo));
    const costedOnly = jobs.filter((j) => !sched.has(j.jobNo));
    const orphanPlants = [...new Set(scheduledOnly.flatMap((s) => [...s.plants]))].filter(isUnmappedProductionPlant);
    return { scheduledOnly, costedOnly, orphanPlants };
  }, [jobs, sched]);

  if (!production.length) {
    return (
      <Panel title="Cost vs. schedule">
        <div className="muted" style={{ padding: 18, lineHeight: 1.8 }}>
          No production data is loaded in this browser. Import a Concrete Vision Scheduled Production
          Report on the <strong>Production</strong> tab and this view will join it to the cost reports
          on job number.
        </div>
      </Panel>
    );
  }

  const t = rows.reduce(
    (a, r) => ({
      act: a.act + r.actCost, proj: a.proj + r.projCost,
      pieces: a.pieces + r.schedPieces, sf: a.sf + r.schedSf,
    }),
    { act: 0, proj: 0, pieces: 0, sf: 0 }
  );

  return (
    <div>
      <div className="cards">
        <StatCard label="Jobs in Both" value={count(rows.length)}
                  sub={`of ${count(jobs.length)} costed, ${count(sched.size)} scheduled`} />
        <StatCard label="Actual Cost, Matched Jobs" value={moneyCompact(t.act)}
                  sub={`${ratio(t.proj > 0 ? t.act / t.proj : 0)} of projection`} />
        <StatCard label="Pieces Scheduled" value={count(Math.round(t.pieces))} sub="in the production window" small />
        <StatCard label="SF Scheduled" value={count(Math.round(t.sf))} sub="in the production window" small />
      </div>

      <div className="notice">
        Cost figures are cumulative <strong>to date</strong>; the production columns are a{" "}
        <strong>forward</strong> window of scheduled pours. Read them side by side — how far a job has got,
        and what is booked next — never as one total.
      </div>

      <Panel title={`Matched jobs (${rows.length})`}>
        {rows.length === 0 ? (
          <div className="muted" style={{ padding: 18 }}>
            No job number appears in both datasets under the current filters.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <SortableTh column="jobNo" label="Job No" sort={sort} onSort={onSort} />
                  <SortableTh column="jobTitle" label="Job" sort={sort} onSort={onSort} />
                  <SortableTh column="plant" label="Plant" sort={sort} onSort={onSort} />
                  <SortableTh column="actCost" label="Actual Cost" sort={sort} onSort={onSort} align="right" />
                  <SortableTh column="costProgress" label="Cost Progress" sort={sort} onSort={onSort} align="right" />
                  <SortableTh column="qtyProgress" label="Pieces Produced" sort={sort} onSort={onSort} align="right" />
                  <SortableTh column="remaining" label="Pieces Left" sort={sort} onSort={onSort} align="right" />
                  <SortableTh column="schedPieces" label="Pieces Scheduled" sort={sort} onSort={onSort} align="right" />
                  <SortableTh column="schedSf" label="SF Scheduled" sort={sort} onSort={onSort} align="right" />
                  <SortableTh column="schedDays" label="Bed-days" sort={sort} onSort={onSort} align="right" />
                  <SortableTh column="first" label="Next Pours" sort={sort} onSort={onSort} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="clickable" onClick={() => onOpenJob(r.key)}>
                    <td className="muted nowrap">{r.jobNo}</td>
                    <td className="link" style={{ maxWidth: 240 }} title={r.jobTitle}>{r.jobTitle || "—"}</td>
                    <td className="muted nowrap">
                      {r.plant}
                      {r.plantMismatch && (
                        <Badge tone="amber" title={`Scheduled at ${r.prodPlants.join(", ")}, costed under ${r.plant}`}>
                          plant differs
                        </Badge>
                      )}
                    </td>
                    <td className="num">{money(r.actCost)}</td>
                    <td className="num nowrap">
                      {ratio(r.costProgress)}
                      <MiniBar value={Math.min(r.costProgress, 1)} max={1} color="var(--series-2)" />
                    </td>
                    <td className="num nowrap">
                      {r.hasQty
                        ? <>{ratio(r.qtyProgress)}<MiniBar value={Math.min(r.qtyProgress, 1)} max={1} color="var(--series-1)" /></>
                        : <span className="muted" title="This plant's report carries no quantity rows">—</span>}
                    </td>
                    <td className="num">{r.hasQty ? fmt(r.remaining, 0) : <span className="muted">—</span>}</td>
                    <td className="num">{count(Math.round(r.schedPieces))}</td>
                    <td className="num">{count(Math.round(r.schedSf))}</td>
                    <td className="num">{r.schedDays}</td>
                    <td className="nowrap muted">{r.first}{r.last && r.last !== r.first ? ` → ${r.last}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid-2">
        <Panel title={`Scheduled but not costed (${unmatched.scheduledOnly.length})`}>
          <p className="hint" style={{ marginTop: -4, marginBottom: 8 }}>
            Jobs with pours on the schedule and no job cost report loaded — usually a plant whose report
            has not been imported.
          </p>
          <div className="table-wrap" style={{ maxHeight: 320 }}>
            <table>
              <thead><tr><th>Job No</th><th>Job</th><th>Plant</th><th className="num">Pieces</th></tr></thead>
              <tbody>
                {unmatched.scheduledOnly.map((s) => (
                  <tr key={s.jobNo}>
                    <td className="muted nowrap">{s.jobNo}</td>
                    <td style={{ maxWidth: 200 }} title={s.jobTitle}>{s.jobTitle}</td>
                    <td className="muted nowrap">
                      {[...s.plants].join(", ")}
                      {[...s.plants].some(isUnmappedProductionPlant) && (
                        <Badge tone="amber" title="No cost report is defined for this plant">no cost plant</Badge>
                      )}
                    </td>
                    <td className="num">{count(Math.round(s.pieces))}</td>
                  </tr>
                ))}
                {!unmatched.scheduledOnly.length && <tr><td colSpan={4} className="muted" style={{ padding: 14 }}>Every scheduled job has a cost report.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title={`Costed but not scheduled (${unmatched.costedOnly.length})`}>
          <p className="hint" style={{ marginTop: -4, marginBottom: 8 }}>
            Active jobs with no pours in the loaded production window. Expected — the schedule covers one
            month, the cost report covers every active job.
          </p>
          <div className="table-wrap" style={{ maxHeight: 320 }}>
            <table>
              <thead><tr><th>Job No</th><th>Job</th><th>Plant</th><th className="num">Actual Cost</th></tr></thead>
              <tbody>
                {unmatched.costedOnly.slice(0, 200).map((j) => (
                  <tr key={j.key} className="clickable" onClick={() => onOpenJob(j.key)}>
                    <td className="muted nowrap">{j.jobNo}</td>
                    <td className="link" style={{ maxWidth: 200 }} title={j.jobTitle}>{j.jobTitle || "—"}</td>
                    <td className="muted nowrap">{j.plant}</td>
                    <td className="num">{money(j.totals.actCost)}</td>
                  </tr>
                ))}
                {!unmatched.costedOnly.length && <tr><td colSpan={4} className="muted" style={{ padding: 14 }}>Every costed job is on the schedule.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {unmatched.orphanPlants.length > 0 && (
        <div className="notice amber">
          The schedule includes {unmatched.orphanPlants.join(", ")}, which {unmatched.orphanPlants.length === 1 ? "has" : "have"} no
          cost-report plant defined. Jobs there can never match. Add the plant to{" "}
          <code>src/modules/job-cost/plants.js</code> once its report exists.
        </div>
      )}
    </div>
  );
}
