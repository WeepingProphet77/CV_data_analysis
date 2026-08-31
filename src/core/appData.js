/**
 * The app-wide data context.
 *
 * Every section needs more than one source now: the Job page reads all four,
 * Home and Sources report on all of them, and the production board draws
 * markers from the ticket report while Drawings draws its coverage notice from
 * the schedule. Holding each dataset inside the one module that used to own it
 * meant those questions could not be asked at all — job cost already reached
 * across the boundary with a second `useDataset("production")`, which was the
 * first sign the boundary was in the wrong place.
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
