/**
 * Per-module dataset persistence.
 *
 * Each module keeps its last import under its own key, so reloading the page
 * (or coming back tomorrow) doesn't mean re-uploading. Data never leaves the
 * browser.
 *
 * Storage is IndexedDB, with localStorage as a fallback only. localStorage was
 * the original choice and was wrong: its ~5MB cap and string-only values mean a
 * real export fails to save. IndexedDB has a disk-proportional quota and stores
 * objects directly. Anything already saved under the old localStorage key is
 * migrated across on first load and then removed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { idbAvailable, idbGet, idbSet, idbDel, storageEstimate } from "./idb.js";

const PREFIX = "cv.analysis";
const VERSION = 1;

export const storeKey = (moduleId) => `${PREFIX}.${moduleId}.v${VERSION}`;

const isDataset = (v) => Array.isArray(v?.rows);

/* -- localStorage fallback --------------------------------------------- */

function lsRead(key, isValid) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null; // corrupt, or storage blocked — treat as "nothing saved"
  }
}

function lsWrite(key, payload) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export const lsRemove = (key) => { try { localStorage.removeItem(key); } catch { /* ignore */ } };

/* -- Read / write ------------------------------------------------------- */

/**
 * Read a saved record, validated by `isValid`. Shared with core/library.js,
 * which persists a different shape (a list of sources) under the same rules.
 */
export async function readRecord(key, isValid) {
  if (idbAvailable()) {
    try {
      const found = await idbGet(key);
      if (isValid(found)) return found;
    } catch {
      // fall through to the fallback below
    }
    // Nothing in IndexedDB yet — adopt anything the old localStorage-only
    // version left behind, then stop paying its size cost.
    const legacy = lsRead(key, isValid);
    if (legacy) {
      try { await idbSet(key, legacy); lsRemove(key); } catch { /* keep the copy */ }
      return legacy;
    }
    return null;
  }
  return lsRead(key, isValid);
}

/** Resolves to { ok } or { ok: false, message } — never throws. */
export async function writeRecord(key, payload) {
  if (idbAvailable()) {
    try {
      await idbSet(key, payload);
      return { ok: true };
    } catch (err) {
      const est = await storageEstimate();
      const room = est?.quota
        ? ` The browser reports ${mb(est.usage)} used of ${mb(est.quota)} available.`
        : "";
      return {
        ok: false,
        message:
          "Data loaded, but it could not be saved for next visit — this browser " +
          `refused the write (${err?.name || "unknown error"}).${room} ` +
          "The dashboard works normally; the file just needs re-uploading after a refresh.",
      };
    }
  }

  if (lsWrite(key, payload)) return { ok: true };
  return {
    ok: false,
    message:
      "Data loaded, but this browser has IndexedDB disabled and the dataset is " +
      "too large for the ~5MB localStorage fallback. The dashboard works normally; " +
      "the file just needs re-uploading after a refresh. Private/incognito windows " +
      "are the usual cause.",
  };
}

const mb = (bytes) =>
  bytes == null ? "?" : `${(bytes / 1024 / 1024).toFixed(0)} MB`;

/* -- Hook --------------------------------------------------------------- */

/**
 * useDataset(moduleId) -> { rows, meta, ready, persistWarning, load, clear }
 *
 * `ready` stays false until the first read resolves, so the empty state doesn't
 * flash before saved data appears.
 */
export function useDataset(moduleId) {
  const [state, setState] = useState({ rows: [], meta: null });
  const [ready, setReady] = useState(false);
  const [persistWarning, setPersistWarning] = useState("");
  const key = storeKey(moduleId);

  // Guards against a resolved read overwriting a newer import, and against
  // setting state on an unmounted component.
  const alive = useRef(true);
  const loadSeq = useRef(0);

  useEffect(() => {
    alive.current = true;
    const seq = ++loadSeq.current;
    readRecord(key, isDataset)
      .then((saved) => {
        if (!alive.current || seq !== loadSeq.current) return;
        if (saved) setState({ rows: saved.rows, meta: saved.meta ?? null });
      })
      .catch(() => { /* nothing saved is a normal state */ })
      .finally(() => { if (alive.current) setReady(true); });
    return () => { alive.current = false; };
  }, [key]);

  const load = useCallback(
    (rows, meta) => {
      // Show the data immediately; persistence catches up in the background.
      loadSeq.current++;
      setState({ rows, meta });
      setPersistWarning("");
      writeRecord(key, { rows, meta }).then((res) => {
        if (alive.current && !res.ok) setPersistWarning(res.message);
      });
    },
    [key]
  );

  const clear = useCallback(() => {
    loadSeq.current++;
    setState({ rows: [], meta: null });
    setPersistWarning("");
    lsRemove(key);
    if (idbAvailable()) idbDel(key).catch(() => { /* already gone */ });
  }, [key]);

  return { ...state, ready, persistWarning, load, clear };
}
