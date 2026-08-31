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

/** Verb set, used verbatim by every strip. Three actions, three words. */
export const VERBS = { add: "Add", replace: "Replace", remove: "Remove", removeAll: "Remove all" };

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Descriptors in the order a person meets them: the schedule first, because
 * almost everything else is read against it.
 *
 * `warn` is a sentence, not a flag — whatever raises the header chip has to be
 * able to say why in the same breath.
 */
export function describeSources(app) {
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
    warn: "",
    warnings: app.time.meta?.warnings || [],
    persistWarning: app.time.persistWarning,
  });

  return out;
}

/** Everything the header chip needs: a count, and whether to shout. */
export function sourceSummary(app) {
  const sources = describeSources(app);
  const loaded = sources.filter((s) => s.loaded);
  const warnings = [
    ...loaded.filter((s) => s.warn).map((s) => s.warn),
    ...sources.filter((s) => s.persistWarning).map((s) => s.persistWarning),
  ];
  return {
    sources,
    loaded,
    count: loaded.length,
    total: sources.length,
    // Plants are files too, so the chip counts files rather than sources.
    fileCount: loaded.reduce((n, s) => n + (s.id === "cost" ? app.costLib.sources.length : 1), 0),
    warnings,
    warn: warnings.length > 0,
  };
}
