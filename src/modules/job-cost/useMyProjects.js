/**
 * "My Projects" — a starred subset of jobs, and whether the dashboard is
 * currently scoped to it.
 *
 * Membership is keyed on the **job number**, not the plant-scoped job key. A
 * job number is the project's identity in both systems — it is what the
 * production join matches on — so a star survives a plant's report being
 * re-imported, removed, or the job being costed under a different plant.
 *
 * The list is deliberately *not* pruned against the loaded data. A job whose
 * plant is not currently imported is still a project you picked; dropping it
 * silently would mean re-starring everything whenever a file is removed. The UI
 * reports how many selections aren't currently loaded instead.
 */
import { useCallback, useMemo } from "react";
import { usePersistedState, prefKey } from "../../core/persisted.js";

const KEY = prefKey("job-cost", "my-projects");

export const SCOPE_ALL = "all";
export const SCOPE_MINE = "mine";

/**
 * Guards the stored record. A hand-edited or stale value must be rejected here
 * rather than reaching a view — a non-string member would sail through `Set.has`
 * and silently match nothing.
 */
export const isValidSelection = (v) =>
  v != null &&
  Array.isArray(v.members) &&
  v.members.every((m) => typeof m === "string" && m !== "") &&
  (v.scope === SCOPE_ALL || v.scope === SCOPE_MINE);

/**
 * Add or remove one job number, kept sorted so the stored order is stable and
 * two lists with the same members compare equal.
 */
export function toggleMember(members, jobNo) {
  if (!jobNo) return members;
  const next = new Set(members);
  if (next.has(jobNo)) next.delete(jobNo);
  else next.add(jobNo);
  return [...next].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

const EMPTY = { members: [], scope: SCOPE_ALL };

export function useMyProjects() {
  const [state, setState, ready] = usePersistedState(KEY, EMPTY, isValidSelection);

  const members = useMemo(() => new Set(state.members), [state.members]);

  const isMember = useCallback((jobNo) => members.has(jobNo), [members]);

  const toggle = useCallback(
    (jobNo) => setState({ ...state, members: toggleMember(state.members, jobNo) }),
    [state, setState]
  );

  const setScope = useCallback((scope) => setState({ ...state, scope }), [state, setState]);

  const clearMembers = useCallback(
    // Emptying the list would leave "My Projects" showing nothing with no way
    // back, so the scope returns to All at the same time.
    () => setState({ members: [], scope: SCOPE_ALL }),
    [setState]
  );

  return {
    ready,
    members,
    memberList: state.members,
    count: state.members.length,
    scope: state.scope,
    // A scope of "mine" with nothing starred is a dead end, so it only takes
    // effect once something is in the list.
    active: state.scope === SCOPE_MINE && state.members.length > 0,
    isMember, toggle, setScope, clearMembers,
  };
}
