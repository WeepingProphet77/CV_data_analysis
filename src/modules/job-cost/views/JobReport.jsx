/**
 * The Job Report tab: pick any costed job and read its full report here,
 * without leaving the Cost section.
 *
 * Addressed `#/cost/report/<jobNo>/<plant>`. The plant is optional and only
 * matters for the few job numbers costed at more than one plant — those are
 * separate reports (separate contracts), so the page offers a switch between
 * them rather than adding them together.
 *
 * With no job in the address it is a picker: the job list, narrowed by the
 * Cost section's own filters and by My Projects, one click to open.
 */
import React, { useMemo } from "react";
import { Panel, Badge } from "../../../components/ui.jsx";
import { StarButton } from "../../../components/MyProjects.jsx";
import { hrefFor, go } from "../../../core/routing.js";
import { money, ratio, perSf, count } from "../../../core/format.js";
import JobDetail from "./JobDetail.jsx";

const byJobNo = (a, b) =>
  a.jobNo.localeCompare(b.jobNo, undefined, { numeric: true }) || a.plant.localeCompare(b.plant);

export default function JobReport({ data, jobs, jobNo, plant, mine }) {
  // The records for this job number, from the whole library: a link to a job
  // must open even when the filters above would have hidden it.
  const records = useMemo(
    () => (jobNo ? data.jobs.filter((j) => j.jobNo === jobNo).sort(byJobNo) : []),
    [data.jobs, jobNo]
  );
  const record = records.find((j) => j.plant === plant) || records[0];

  const choices = useMemo(() => [...jobs].sort(byJobNo), [jobs]);

  if (!jobNo) return <JobPicker jobs={choices} mine={mine} />;

  if (!record) {
    return (
      <Panel title={`Job ${jobNo}`}>
        <p className="muted" style={{ lineHeight: 1.8 }}>
          No loaded cost report carries job <strong>{jobNo}</strong>. Its plant's report may not be
          imported. <a className="link" href={hrefFor("cost", "report")}>Pick another job</a> or{" "}
          <a className="link" href={hrefFor("sources")}>check the loaded files</a>.
        </p>
      </Panel>
    );
  }

  return (
    <>
      <div className="gridcontrols">
        <label className="filter-label" htmlFor="jobreport-pick">Job</label>
        <select
          id="jobreport-pick"
          className="field"
          value={record.key}
          onChange={(e) => {
            const [p, n] = e.target.value.split("|");
            go("cost", "report", n, p);
          }}
        >
          {/* The open job is always listed, even if a filter has since hidden it. */}
          {(choices.some((j) => j.key === record.key) ? choices : [record, ...choices]).map((j) => (
            <option key={j.key} value={j.key}>
              {j.jobNo} — {j.jobTitle || "Untitled"} · {j.plant}
            </option>
          ))}
        </select>
        {records.length > 1 && records.map((r) => (
          <a key={r.key} className={`btn${r.key === record.key ? "" : " ghost"}`}
             href={hrefFor("cost", "report", r.jobNo, r.plant)}
             title="This job number is costed at more than one plant; each is its own report">
            {r.plant}
          </a>
        ))}
        <a className="btn ghost" href={hrefFor("job", record.jobNo)}>Job page, with hours →</a>
      </div>

      {records.length > 1 && (
        <p className="hint" style={{ marginBottom: 10 }}>
          Job {record.jobNo} is costed at {records.length} plants. Each is a separate report and a
          separate contract, so they are shown one at a time rather than added together.
        </p>
      )}

      <JobDetail
        key={record.key}
        job={record}
        costs={data.costsByJob.get(record.key) || []}
        quantities={data.qtyByJob.get(record.key) || []}
        mine={mine}
        onBack={() => go("cost", "report")}
        backLabel="All job reports"
      />
    </>
  );
}

/** The job list: one click opens a report. Narrowed by the filters above it. */
function JobPicker({ jobs, mine }) {
  if (!jobs.length) {
    return (
      <Panel title="Job reports">
        <p className="muted">No jobs match the current filters.</p>
      </Panel>
    );
  }
  return (
    <Panel title={`Job reports (${count(jobs.length)})`}>
      <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>
        Open any job to read its full cost report, broken down by section and category.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 34 }} title="Add to My Projects">★</th>
              <th>Job No</th><th>Job</th><th>Plant</th><th>As of</th>
              <th className="num">Net Contract</th>
              <th className="num">Actual Cost</th>
              <th className="num">% of Proj</th>
              <th className="num">Margin</th>
              <th className="num">Actual / SF</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.key} className="clickable" onClick={() => go("cost", "report", j.jobNo, j.plant)}>
                <td className="starcol" onClick={(e) => e.stopPropagation()}>
                  {mine && <StarButton jobNo={j.jobNo} on={mine.isMember(j.jobNo)} onToggle={mine.toggle} />}
                </td>
                <td className="muted nowrap">{j.jobNo}</td>
                <td className="link" style={{ maxWidth: 280 }} title={j.jobTitle}>{j.jobTitle || "—"}</td>
                <td className="nowrap"><Badge>{j.plant}</Badge></td>
                <td className="muted nowrap">{j.asOf || "—"}</td>
                <td className="num">{money(j.netContract)}</td>
                <td className="num">{money(j.totals.actCost)}</td>
                <td className="num">{j.totals.projCost > 0 ? ratio(j.totals.actCost / j.totals.projCost) : "—"}</td>
                <td className="num">
                  {j.netContract > 0 ? (
                    <Badge tone={j.estOhProfitPct < 0 ? "red" : j.estOhProfitPct < 0.1 ? "amber" : "green"}>
                      {ratio(j.estOhProfitPct)}
                    </Badge>
                  ) : <span className="muted">—</span>}
                </td>
                <td className="num">{perSf(j.perSf?.actual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
