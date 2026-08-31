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

/** Forget a key in both stores. Used when a preference is reset or moved. */
function forget(key) {
  lsRemove(key);
  if (idbAvailable()) idbDel(key).catch(() => { /* already gone */ });
}

const PREFIX = "cv.analysis";

export const prefKey = (moduleId, name, version = 1) =>
  `${PREFIX}.${moduleId}.${name}.v${version}`;

/**
 * usePersistedState(key, fallback, isValid, legacyKeys) -> [value, setValue, ready, reset]
 *
 * `ready` stays false until the first read resolves. Callers that would render
 * differently under the fallback should wait for it, exactly as the dataset
 * hooks do — otherwise a stored choice flashes as its default.
 *
 * `legacyKeys` are older keys the same preference used to live under, tried in
 * order when nothing is stored at `key`. A hit is written forward and the old
 * key deleted, so the migration runs once — the same read-forward-then-drop
 * story store.js uses for the localStorage records it replaced. A preference
 * that moves must not silently reset: what a user curated by hand is exactly
 * the kind of state that is annoying to rebuild.
 *
 * A write that fails is not surfaced here: losing a preference is a nuisance,
 * not a data loss, and an error banner over a toggle is worse than the problem.
 */
export function usePersistedState(key, fallback, isValid = () => true, legacyKeys = []) {
  const [value, setValue] = useState(fallback);
  const [ready, setReady] = useState(false);

  const alive = useRef(true);
  const seq = useRef(0);

  useEffect(() => {
    alive.current = true;
    const mine = ++seq.current;
    const valid = (v) => v != null && isValid(v.value);

    readRecord(key, valid)
      .then(async (saved) => {
        if (saved) return saved;
        for (const old of legacyKeys) {
          const found = await readRecord(old, valid).catch(() => null);
          if (found) {
            await writeRecord(key, found).catch(() => { /* keep the old copy */ });
            forget(old);
            return found;
          }
        }
        return null;
      })
      .then((saved) => {
        if (!alive.current || mine !== seq.current) return;
        if (saved) setValue(saved.value);
      })
      .catch(() => { /* nothing saved is a normal state */ })
      .finally(() => { if (alive.current) setReady(true); });
    return () => { alive.current = false; };
    // isValid is a predicate and legacyKeys a constant list, not data;
    // re-reading on a new closure identity would refetch on every render.
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
    forget(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, set, ready, reset];
}
