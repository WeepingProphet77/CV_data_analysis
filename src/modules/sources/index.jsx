/**
 * Sources — every file the app holds, in one place, with one vocabulary.
 *
 * Each section still shows what *it* is reading, but adding, replacing and
 * removing anything can be done from here without first working out which
 * module owns which export. That mattering is the point: the job cost reports
 * are read by three sections now, and the ticket report by two.
 */
import React from "react";
import { useAppData } from "../../core/appData.js";
import { describeSources, VERBS } from "../../app/sources.js";
import { PageHeader } from "../../components/Page.jsx";
import { SourceStrip, SourceRow, RemoveButton } from "../../components/SourceStrip.jsx";
import { Panel, Badge } from "../../components/ui.jsx";
import { ImportButton } from "../../components/FileImport.jsx";
import { hrefFor } from "../../core/routing.js";
import { count } from "../../core/format.js";
import productionSchema from "../production/schema.js";
import timeSchema from "../employee-time/schema.js";
import { SourceDrop } from "../job-cost/views/SourceLibrary.jsx";
import { TicketImportButton } from "../production/views/TicketImport.jsx";

export default function SourcesModule() {
  const app = useAppData();
  const described = describeSources(app);
  const byId = Object.fromEntries(described.map((d) => [d.id, d]));

  const loadedAny = described.some((d) => d.loaded);

  const removeEverything = () => {
    if (!window.confirm("Remove every file from this browser? Starred projects are kept.")) return;
    app.schedule.clear();      // also drops the baseline
    app.tickets.clear();
    app.costLib.clear();
    app.time.clear();
  };

  return (
    <div>
      <PageHeader
        title="Sources"
        subtitle="Every file this browser holds. Nothing is uploaded anywhere."
        actions={
          loadedAny ? (
            <button className="btn danger" onClick={removeEverything}>{VERBS.removeAll}</button>
          ) : null
        }
      />

      <p className="hint" style={{ marginBottom: 16, maxWidth: 680 }}>
        Files are read and parsed in your browser and cached in this browser only — there is no
        server and no upload. Removing a file here does not touch your{" "}
        <a className="link" href={hrefFor("projects")}>starred projects</a>; that list is kept
        separately on purpose.
      </p>

      <SourceCard
        d={byId.schedule}
        expected="One sheet, 20 columns, one row per scheduled piece. Plant, Bed Date, Bed Name, Piece Mark, Qty."
        add={<ImportButton schema={productionSchema} onLoaded={app.schedule.load} label={VERBS.add} />}
        replace={<ImportButton schema={productionSchema} onLoaded={app.schedule.load} label={VERBS.replace} />}
        onRemove={app.schedule.clear}
        note={
          app.baseline.rows.length > 0 && (
            <p className="hint" style={{ marginTop: 8 }}>
              Replacing the schedule keeps the outgoing one as a comparison, which is what{" "}
              <a className="link" href={hrefFor("production", "changes")}>Schedule Changes</a> reads.
              Removing the schedule forgets it too — a comparison against a file nobody remembers
              loading is worse than none.
            </p>
          )
        }
      />

      <SourceCard
        d={byId.tickets}
        expected="One sheet, grouped plant then job, with Plant Name / Job Num / Job Name / Piece Mark headings. Run it over the same dates as the schedule."
        add={<TicketImportButton onSource={app.tickets.load} label={VERBS.add} />}
        replace={<TicketImportButton onSource={app.tickets.load} label={VERBS.replace} ghost />}
        onRemove={app.tickets.clear}
      />

      {/* The cost library is the one source that is several files at once, so
          it expands into a row per plant, each independently replaceable. */}
      <SourceCard
        d={byId.cost}
        expected="One worksheet per job, the job number and name in cell A3, a Task / Description header row. The plant is taken from the filename."
        add={<SourceDrop onSource={app.costLib.upsert} compact />}
        replace={<SourceDrop onSource={app.costLib.upsert} compact />}
        onRemove={app.costLib.clear}
        removeLabel={VERBS.removeAll}
        rows={app.costLib.sources.map((s) => (
          <SourceRow
            key={s.id}
            name={s.plant}
            badge={`as of ${s.asOf || "unknown"}`}
            badgeTone={app.cost.data.mixedAsOf && s.asOf !== app.cost.data.asOfRange.max ? "amber" : "blue"}
            badgeTitle={
              app.cost.data.mixedAsOf && s.asOf !== app.cost.data.asOfRange.max
                ? `Older than the newest report loaded (${app.cost.data.asOfRange.max})`
                : "Report cut-off date"
            }
            detail={`${count(s.jobs.length)} jobs`}
            fileName={s.fileName}
            actions={<RemoveButton onRemove={() => app.costLib.remove(s.id)} what={s.plant} />}
          />
        ))}
      />

      <SourceCard
        d={byId.time}
        expected="Effective Date, First Name, Last Name, Job Name and Hours. Location, GL Code, Labor Task and Deptment are optional."
        add={<ImportButton schema={timeSchema} onLoaded={app.time.load} label={VERBS.add} />}
        replace={<ImportButton schema={timeSchema} onLoaded={app.time.load} label={VERBS.replace} />}
        onRemove={app.time.clear}
        note={
          <p className="hint" style={{ marginTop: 8 }}>
            This export's columns were inferred from an older tool and have never been checked
            against a real file. If it is rejected, the message names the column it wanted and
            lists what it found.
          </p>
        }
      />
    </div>
  );
}

/** One source: what it is, whether it is loaded, and the verbs for it. */
function SourceCard({ d, expected, add, replace, onRemove, removeLabel, rows, note }) {
  return (
    <Panel title={d.label}>
      <p className="hint" style={{ marginBottom: 10 }}>{d.hint}</p>

      {d.loaded ? (
        <>
          <SourceStrip>
            <SourceRow
              name={d.file}
              badge={d.multi ? undefined : "loaded"}
              badgeTone="blue"
              detail={d.detail}
              fileName={d.multi ? undefined : d.fileName}
              actions={
                <>
                  {replace}
                  <RemoveButton onRemove={onRemove} what={d.label.toLowerCase()} label={removeLabel} />
                </>
              }
            />
            {rows}
          </SourceStrip>

          {d.warn && <div className="notice amber">{d.warn}</div>}
          {d.persistWarning && <div className="notice amber">{d.persistWarning}</div>}

          {d.warnings.length > 0 && (
            <details style={{ marginTop: 10, fontSize: 11 }}>
              <summary className="muted" style={{ cursor: "pointer" }}>
                {d.warnings.length} import note(s)
              </summary>
              <ul style={{ margin: "6px 0 0 18px", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                {d.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </details>
          )}
          {note}
        </>
      ) : (
        <div className="srclist">
          <div className="srcrow">
            <span className="srcplant">{d.file}</span>
            <Badge tone="gray">not loaded</Badge>
            <span className="muted">{expected}</span>
            <span style={{ display: "flex", gap: 6 }}>{add}</span>
          </div>
        </div>
      )}
    </Panel>
  );
}
