/**
 * The app-wide data context.
 *
 * Several sections need more than one source: the Job page and Projects read
 * both cost and time, and Home and Sources report on everything. Holding each
 * dataset inside the one module that used to own it meant those questions could
 * not be asked at all — job cost once reached across the boundary with a second
 * `useDataset` of another module's record, which was the first sign the
 * boundary was in the wrong place.
 *
 * Only the context and its hook live here, so `core/` keeps its rule of never
 * importing from `modules/` (CLAUDE.md §2). The provider that assembles the
 * data is `src/app/AppData.jsx`, one layer up, where reaching into modules is
 * allowed.
 */
import { createContext, useContext } from "react";

export const AppDataContext = createContext(null);

/**
 * Throws when there is no provider. That is deliberate: a section rendered
 * outside the shell would otherwise show empty dashboards that look like "no
 * data loaded" rather than like the wiring fault they are.
 */
export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error("useAppData must be used inside <AppDataProvider>");
  return value;
}
