/**
 * Per-module dataset persistence.
 *
 * Each module keeps its last import in localStorage under its own key, so
 * reloading the page (or coming back tomorrow) doesn't mean re-uploading.
 * Data never leaves the browser.
 */
import { useCallback, useEffect, useState } from "react";

const PREFIX = "cv.analysis";
const VERSION = 1;

export const storeKey = (moduleId) => `${PREFIX}.${moduleId}.v${VERSION}`;

function read(moduleId) {
  try {
    const raw = localStorage.getItem(storeKey(moduleId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.rows)) return null;
    return parsed;
  } catch {
    return null; // corrupt or unreadable — treat as "no saved data"
  }
}

function write(moduleId, payload) {
  try {
    localStorage.setItem(storeKey(moduleId), JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    // Quota is the realistic failure here: a very large export can exceed the
    // ~5MB budget. The dataset stays usable in memory for this session.
    return {
      ok: false,
      message:
        "Data loaded, but it was too large to save for next visit — " +
        "it will need re-uploading after a refresh.",
    };
  }
}

/**
 * useDataset(moduleId) -> { rows, meta, ready, persistWarning, load, clear }
 *
 * `ready` is false until the first read from localStorage completes, so the
 * empty state doesn't flash before saved data appears.
 */
export function useDataset(moduleId) {
  const [state, setState] = useState({ rows: [], meta: null });
  const [ready, setReady] = useState(false);
  const [persistWarning, setPersistWarning] = useState("");

  useEffect(() => {
    const saved = read(moduleId);
    if (saved) setState({ rows: saved.rows, meta: saved.meta ?? null });
    setReady(true);
  }, [moduleId]);

  const load = useCallback(
    (rows, meta) => {
      setState({ rows, meta });
      const res = write(moduleId, { rows, meta });
      setPersistWarning(res.ok ? "" : res.message);
    },
    [moduleId]
  );

  const clear = useCallback(() => {
    try { localStorage.removeItem(storeKey(moduleId)); } catch { /* ignore */ }
    setState({ rows: [], meta: null });
    setPersistWarning("");
  }, [moduleId]);

  return { ...state, ready, persistWarning, load, clear };
}
