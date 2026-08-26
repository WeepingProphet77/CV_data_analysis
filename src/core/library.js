/**
 * Multi-source dataset persistence — a *library* of imports, not one import.
 *
 * useDataset (store.js) keeps a single export per module and replaces it on
 * every upload. That is right for Concrete Vision's reports, which arrive as
 * one file covering everything. It is wrong for the weekly job cost reports:
 * those come one file per plant, each refreshed on its own schedule, so
 * replacing on import would throw away three plants to update a fourth.
 *
 * A library keeps one entry per source, keyed by `id` (the plant). Importing a
 * source that is already present overwrites just that entry and leaves the rest
 * untouched, which is what "drop a new file in and overwrite as needed" means.
 *
 * Storage is the same IndexedDB record used everywhere else — the whole library
 * is one value, so an import is atomic: it either lands whole or not at all.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { idbAvailable, idbDel } from "./idb.js";
import { readRecord, writeRecord, lsRemove } from "./store.js";

const PREFIX = "cv.analysis";
const VERSION = 1;

export const libraryKey = (moduleId) => `${PREFIX}.${moduleId}.lib.v${VERSION}`;

const isLibrary = (v) => Array.isArray(v?.sources);

/**
 * useLibrary(moduleId) -> { sources, ready, persistWarning, upsert, remove, clear }
 *
 * `sources` is ordered by id so the strip doesn't reshuffle when a plant is
 * re-imported. `ready` stays false until the first read resolves, so saved
 * sources don't flash the empty state.
 */
export function useLibrary(moduleId) {
  const [sources, setSources] = useState([]);
  const [ready, setReady] = useState(false);
  const [persistWarning, setPersistWarning] = useState("");
  const key = libraryKey(moduleId);

  // Guards a resolved read against overwriting a newer import, and against
  // setting state after unmount.
  const alive = useRef(true);
  const loadSeq = useRef(0);
  // Mirrors `sources` so a mutation can derive the next list without doing
  // work inside a state updater — StrictMode invokes those twice.
  const current = useRef([]);

  useEffect(() => {
    alive.current = true;
    const seq = ++loadSeq.current;
    readRecord(key, isLibrary)
      .then((saved) => {
        if (!alive.current || seq !== loadSeq.current) return;
        if (saved) { current.current = saved.sources; setSources(saved.sources); }
      })
      .catch(() => { /* nothing saved is a normal state */ })
      .finally(() => { if (alive.current) setReady(true); });
    return () => { alive.current = false; };
  }, [key]);

  // One writer for every mutation, so the persisted value can never disagree
  // with what is on screen.
  const commit = useCallback(
    (next) => {
      loadSeq.current++;
      current.current = next;
      setSources(next);
      setPersistWarning("");
      writeRecord(key, { sources: next }).then((res) => {
        if (alive.current && !res.ok) setPersistWarning(res.message);
      });
    },
    [key]
  );

  /** Add a source, or replace the one already held under the same id. */
  const upsert = useCallback(
    (source) => {
      const next = [...current.current.filter((s) => s.id !== source.id), source]
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      commit(next);
    },
    [commit]
  );

  const remove = useCallback(
    (id) => commit(current.current.filter((s) => s.id !== id)),
    [commit]
  );

  const clear = useCallback(() => {
    loadSeq.current++;
    current.current = [];
    setSources([]);
    setPersistWarning("");
    lsRemove(key);
    if (idbAvailable()) idbDel(key).catch(() => { /* already gone */ });
  }, [key]);

  return { sources, ready, persistWarning, upsert, remove, clear };
}
