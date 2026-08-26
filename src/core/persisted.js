/**
 * A single small preference, persisted in the same store as the datasets.
 *
 * This is for *choices*, not data: which projects someone has starred, which
 * way a toggle is set. It shares readRecord/writeRecord with store.js and
 * library.js so there is one storage path and one fallback story, but it is
 * deliberately a separate record — a preference must outlive the dataset it
 * refers to. Clearing imported files should not forget what you selected.
 *
 * The value is wrapped as `{ value }` on the way to storage so the validator
 * always sees an object, whatever shape the caller keeps.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { idbAvailable, idbDel } from "./idb.js";
import { readRecord, writeRecord, lsRemove } from "./store.js";

const PREFIX = "cv.analysis";

export const prefKey = (moduleId, name, version = 1) =>
  `${PREFIX}.${moduleId}.${name}.v${version}`;

/**
 * usePersistedState(key, fallback, isValid) -> [value, setValue, ready, reset]
 *
 * `ready` stays false until the first read resolves. Callers that would render
 * differently under the fallback should wait for it, exactly as the dataset
 * hooks do — otherwise a stored choice flashes as its default.
 *
 * A write that fails is not surfaced here: losing a preference is a nuisance,
 * not a data loss, and an error banner over a toggle is worse than the problem.
 */
export function usePersistedState(key, fallback, isValid = () => true) {
  const [value, setValue] = useState(fallback);
  const [ready, setReady] = useState(false);

  const alive = useRef(true);
  const seq = useRef(0);

  useEffect(() => {
    alive.current = true;
    const mine = ++seq.current;
    readRecord(key, (v) => v != null && isValid(v.value))
      .then((saved) => {
        if (!alive.current || mine !== seq.current) return;
        if (saved) setValue(saved.value);
      })
      .catch(() => { /* nothing saved is a normal state */ })
      .finally(() => { if (alive.current) setReady(true); });
    return () => { alive.current = false; };
    // isValid is a predicate, not data; re-reading on a new closure identity
    // would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (next) => {
      seq.current++;
      setValue(next);
      writeRecord(key, { value: next }).catch(() => { /* preference only */ });
    },
    [key]
  );

  const reset = useCallback(() => {
    seq.current++;
    setValue(fallback);
    lsRemove(key);
    if (idbAvailable()) idbDel(key).catch(() => { /* already gone */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, set, ready, reset];
}
