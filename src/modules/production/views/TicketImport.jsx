/**
 * The missing-ticket import strip, and the empty state that invites the file.
 *
 * The report is read by two sections — Drawings lists it, and the planning board
 * marks the pieces it names — so its import controls live beside the parser that
 * understands it, and both sections mount the same ones. The listing of what is
 * loaded is the shared strip (components/SourceStrip.jsx).
 */
import React, { useCallback, useRef, useState } from "react";
import { Badge } from "../../../components/ui.jsx";
import { ErrorBox } from "../../../components/FileImport.jsx";
import { readTicketFile } from "../ticketFile.js";
import { count } from "../../../core/format.js";

const ACCEPT = ".xlsx,.xls";

function useTicketImport(onSource) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const ingest = useCallback(
    async (file) => {
      if (!file) return;
      setBusy(true);
      setError("");
      try {
        onSource(await readTicketFile(file));
      } catch (err) {
        setError(err?.message || String(err));
      } finally {
        setBusy(false);
      }
    },
    [onSource]
  );

  return { ingest, error, setError, busy };
}

/**
 * Add / Replace button for the ticket report, for strips that only need the
 * verb. The full drop target below is for the empty state.
 */
export function TicketImportButton({ onSource, label = "Add", ghost }) {
  const { ingest, error, setError, busy } = useTicketImport(onSource);
  const inputRef = useRef(null);
  return (
    <>
      <button className={ghost ? "btn ghost" : "btn"} disabled={busy}
              onClick={() => inputRef.current?.click()}>
        {busy ? "Reading…" : label}
      </button>
      <input ref={inputRef} type="file" accept={ACCEPT} hidden
             onChange={(e) => { ingest(e.target.files[0]); e.target.value = ""; }} />
      {error && <div style={{ flexBasis: "100%" }}><ErrorBox message={error} onDismiss={() => setError("")} /></div>}
    </>
  );
}

/** Drop target — full-size in the Tickets tab when nothing is loaded. */
export function TicketDrop({ onSource }) {
  const { ingest, error, setError, busy } = useTicketImport(onSource);
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const open = () => inputRef.current?.click();

  return (
    <div className="empty">
      <h2>Missing Piece Tickets</h2>
      <p className="muted" style={{ fontSize: 13, maxWidth: 560 }}>
        Drop the <strong>Missing Piece Mark Ticket</strong> report — the same Concrete Vision
        database as the schedule, listing every piece with no ticket drawing. Once it is
        loaded, any scheduled piece still waiting on a drawing is flagged on the planning
        board.
      </p>

      <div
        className={`dropzone${over ? " over" : ""}`}
        onClick={open}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); ingest(e.dataTransfer.files[0]); }}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") open(); }}
      >
        <div style={{ color: "var(--accent)", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", fontSize: 12 }}>
          {busy ? "Reading…" : "Drop the ticket report here, or click to browse"}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>Accepts .xlsx and .xls</div>
        <input ref={inputRef} type="file" accept={ACCEPT} hidden
               onChange={(e) => { ingest(e.target.files[0]); e.target.value = ""; }} />
      </div>

      {error && <ErrorBox message={error} onDismiss={() => setError("")} />}

      <p className="hint" style={{ marginTop: 14 }}>
        <strong style={{ color: "var(--text-secondary)" }}>Expected shape:</strong>{" "}
        one sheet, grouped plant then job, with Plant Name / Job Num / Job Name / Piece Mark
        column headings. Run it over the same dates as the schedule you loaded.
      </p>
      <p className="hint">
        Parsed in your browser and cached in this browser only. Nothing is uploaded anywhere.
      </p>
    </div>
  );
}

/**
 * Says how far the ticket report actually speaks to the loaded schedule.
 *
 * This is the notice the module exists to show. The two reports are pulled
 * independently over independent ranges, and when they don't overlap the board
 * flags nothing — which reads as "everything is drawn" and means the opposite.
 * Silence here would be the most misleading state in the app.
 */
export function CoverageNotice({ coverage: c }) {
  if (!c.loaded) return null;

  // Rows, not endpoints. A single piece with a years-old bed date is enough to
  // make the two date ranges "overlap" while every other row sits in the next
  // month, which is exactly what the real reports do.
  if (!c.ticketsInWindow) {
    return (
      <div className="notice red">
        <strong>These two reports barely cover the same dates.</strong> The schedule runs{" "}
        {c.prodRange.min || "—"} → {c.prodRange.max || "—"}, and none of the{" "}
        {count(c.tickets)} pieces in the ticket report have a bed date inside it
        {c.tickRange.min && <> (the report runs {c.tickRange.min} → {c.tickRange.max})</>}.
        The board still flags {count(c.flaggedPieces)} piece
        {c.flaggedPieces === 1 ? "" : "s"} — the join is on job number and piece mark, so a
        rescheduled piece is still caught — but <strong>do not read an unflagged board as
        "every piece is drawn"</strong>. Re-run the ticket report over the schedule's dates.
      </div>
    );
  }

  const partial =
    c.ticketsInWindow < c.tickets ||
    c.prodRange.min < c.overlap.min ||
    c.prodRange.max > c.overlap.max;

  return (
    <div className={c.jobsNotCovered.length || partial ? "notice amber" : "notice"}>
      {count(c.flaggedPieces)} scheduled piece{c.flaggedPieces === 1 ? "" : "s"} on the board
      {" "}have no ticket, out of {count(c.tickets)} in the report.
      {partial && (
        <>
          {" "}Only {count(c.ticketsInWindow)} of them have a bed date inside the schedule's
          window ({c.prodRange.min} → {c.prodRange.max}); outside it the board can't tell a
          drawn piece from an unreported one.
        </>
      )}
      {c.jobsNotCovered.length > 0 && (
        <>
          {" "}{c.jobsNotCovered.length} scheduled job
          {c.jobsNotCovered.length === 1 ? " is" : "s are"} absent from the ticket report
          ({c.jobsNotCovered.slice(0, 8).join(", ")}
          {c.jobsNotCovered.length > 8 ? "…" : ""}) — either fully drawn, or outside the range
          it was run over.
        </>
      )}
    </div>
  );
}
