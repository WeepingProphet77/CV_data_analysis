/**
 * One description of every file the app can hold.
 *
 * Home, the Sources page and the header chip all need to answer "what is
 * loaded, and is anything wrong with it" — and the answer used to be split
 * across three modules, each stating it only to someone already standing on
 * that tab. The most dangerous state in the app is a ticket report that does
 * not cover the loaded schedule (CLAUDE.md §11): silence there reads as "every
 * piece is drawn". It has to be visible from anywhere, so it is computed here.
 *
 * Plain ESM, node-importable, and pure — it takes the assembled app data and
 * returns descriptors. No React, so the warning rules can be tested directly.
 */

import { daysSince } from "../core/format.js";

/** Verb set, used verbatim by every strip. Three actions, three words. */
export const VERBS = { add: "Add", replace: "Replace", remove: "Remove", removeAll: "Remove all" };

/**
 * How old a file has to be before it is worth a second look.
 *
 * A rule of thumb, not a policy anyone stated: the job cost reports are pulled
 * weekly, so a fortnight means at least one refresh was missed. It is applied
 * to every source for consistency and **the rule is printed in the UI**, so a
 * badge never has to be guessed at. Change it here if the real cadence differs.
 */
export const STALE_AFTER_DAYS = 14;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * The age block every source carries.
 *
 * `modified` is the file's own last-modified date — the best answer to "how old
 * is this?" for every export except the job cost report, which prints its own
 * cut-off inside it. The two are kept apart on purpose: a file re-saved today
 * does not make the report inside it any newer.
 */
function ageOf(fileDate, today) {
  const days = daysSince(fileDate, today);
  return {
    modified: fileDate || "",
    modifiedDays: days,
    // Unknown age is never "fresh" and never "stale" — it is unknown, and the
    // UI says so. Sources imported before the date was captured land here.
    stale: days != null && days > STALE_AFTER_DAYS,
  };
}

/**
 * Descriptors in the order a person meets them: the schedule first, because
 * almost everything else is read against it.
 *
 * `warn` is a sentence, not a flag — whatever raises the header chip has to be
 * able to say why in the same breath.
 */
export function describeSources(app, today = new Date()) {
  const out = [];

  out.push({
    id: "schedule",
    label: "Schedule",
    section: "production",
    file: "Scheduled Production Report",
    loaded: app.schedule.rows.length > 0,
    fileName: app.schedule.meta?.fileName || "",
    detail: app.schedule.rows.length
      ? `${plural(app.schedule.rows.length, "row", "rows")}${
          app.scheduleRange.min ? ` · ${app.scheduleRange.min} → ${app.scheduleRange.max}` : ""
        }`
      : "",
    hint: "Concrete Vision · forward-looking, a month of scheduled pours.",
    ...ageOf(app.schedule.meta?.fileDate, today),
    warn: "",
    warnings: app.schedule.meta?.warnings || [],
    persistWarning: app.schedule.persistWarning,
  });

  const t = app.tickets;
  out.push({
    id: "tickets",
    label: "Missing tickets",
    section: "drawings",
    file: "Missing Piece Mark Ticket report",
    loaded: t.rows.length > 0,
    fileName: t.source.fileName,
    detail: t.rows.length
      ? `${plural(t.rows.length, "piece", "pieces")} · ${plural(t.source.jobs.length, "job", "jobs")}${
          t.source.range.min ? ` · bed dates ${t.source.range.min} → ${t.source.range.max}` : ""
        }`
      : "",
    hint: "Concrete Vision · every piece with no ticket drawing.",
    ...ageOf(t.source.fileDate, today),
    // The coverage trap, stated wherever the source is listed.
    warn:
      t.rows.length && app.schedule.rows.length && !app.coverage.ticketsInWindow
        ? "None of these pieces have a bed date inside the loaded schedule's window — an unflagged board does not mean every piece is drawn."
        : "",
    warnings: t.source.warnings || [],
    persistWarning: app.ticketData.persistWarning,
  });

  const cost = app.cost;
  out.push({
    id: "cost",
    label: "Job cost",
    section: "cost",
    file: "Weekly Job Cost Report — one workbook per plant",
    loaded: app.costLib.sources.length > 0,
    fileName: app.costLib.sources.map((s) => s.plant).join(", "),
    detail: app.costLib.sources.length
      ? `${plural(cost.data.jobs.length, "job", "jobs")} · ${plural(app.costLib.sources.length, "plant", "plants")}${
          cost.data.asOfRange.max
            ? cost.data.mixedAsOf
              ? ` · as of ${cost.data.asOfRange.min} to ${cost.data.asOfRange.max}`
              : ` · as of ${cost.data.asOfRange.max}`
            : ""
        }`
      : "",
    hint: "A different system from Concrete Vision. Cumulative to date, not forward.",
    // Plants refresh independently, so the card reports the *oldest* file it
    // holds — a library is only as current as its stalest member.
    ...ageOf(oldestCostFile(app.costLib.sources), today),
    // The report's own cut-off, which is a different question from the file's
    // age and the more authoritative of the two where it exists.
    asOf: cost.data.asOfRange,
    // Mixing cut-offs is wrong in a way nobody would notice from the totals.
    warn: cost.data.mixedAsOf
      ? `Plants were exported on different dates (${cost.data.asOfRange.min} — ${cost.data.asOfRange.max}); company-wide totals mix those cut-offs.`
      : "",
    warnings: app.costLib.sources.flatMap((s) => (s.warnings || []).map((w) => `${s.plant}: ${w}`)),
    persistWarning: app.costLib.persistWarning,
    multi: true,
  });

  out.push({
    id: "time",
    label: "Employee time",
    section: "time",
    file: "Employee time export",
    loaded: app.time.rows.length > 0,
    fileName: app.time.meta?.fileName || "",
    detail: app.time.rows.length ? plural(app.time.rows.length, "entry", "entries") : "",
    hint: "Concrete Vision · timesheet hours by person, job and task.",
    ...ageOf(app.time.meta?.fileDate, today),
    warn: "",
    warnings: app.time.meta?.warnings || [],
    persistWarning: app.time.persistWarning,
  });

  return out;
}

/** The oldest file in the cost library — the one that dates the whole set. */
function oldestCostFile(sources) {
  const dates = (sources || []).map((s) => s.fileDate).filter(Boolean).sort();
  return dates[0] || "";
}

/** Everything the header chip needs: a count, and whether to shout. */
export function sourceSummary(app, today = new Date()) {
  const sources = describeSources(app, today);
  const loaded = sources.filter((s) => s.loaded);
  const warnings = [
    ...loaded.filter((s) => s.warn).map((s) => s.warn),
    ...sources.filter((s) => s.persistWarning).map((s) => s.persistWarning),
  ];
  // Age is a reason to look at the chip too — a file nobody has refreshed in a
  // fortnight is exactly the thing this was asked to make visible.
  const stale = loaded.filter((s) => s.stale);

  return {
    sources,
    loaded,
    stale,
    count: loaded.length,
    total: sources.length,
    // Plants are files too, so the chip counts files rather than sources.
    fileCount: loaded.reduce((n, s) => n + (s.id === "cost" ? app.costLib.sources.length : 1), 0),
    warnings: [
      ...warnings,
      ...stale.map((s) => `${s.label} was last modified ${s.modifiedDays} days ago.`),
    ],
    warn: warnings.length > 0 || stale.length > 0,
  };
}
