/**
 * Minimal IndexedDB key/value store — no dependencies.
 *
 * Why not localStorage: it is capped at roughly 5MB per origin and holds only
 * strings, so every save costs a full JSON.stringify of the dataset and a big
 * export blows the quota outright. IndexedDB stores structured objects
 * directly (no serialization step) and its quota is a share of free disk —
 * gigabytes in practice — which is what a multi-year timesheet export needs.
 *
 * Everything still lives in the user's own browser. Nothing is uploaded.
 */

const DB_NAME = "cv-analysis";
const STORE = "datasets";
const DB_VERSION = 1;

let dbPromise = null;

/** True when this browser exposes IndexedDB at all (it is absent in some
 *  hardened/private modes). */
export function idbAvailable() {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!idbAvailable()) return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    // Firefox private browsing fires neither callback; don't hang forever.
    // The timer is cleared on settle so it can't hold the event loop open.
    const timer = setTimeout(() => reject(new Error("IndexedDB open timed out")), 5000);
    const settle = (fn) => (v) => { clearTimeout(timer); fn(v); };
    const done = settle(resolve);
    const fail = settle(reject);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => done(req.result);
    req.onerror = () => fail(req.error ?? new Error("IndexedDB open failed"));
  });
  // A failed open must not be cached, or every later call inherits the failure.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function tx(mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.onabort = () => reject(t.error ?? new Error("transaction aborted"));
        t.onerror = () => reject(t.error);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export const idbGet = (key) => tx("readonly", (s) => s.get(key));
export const idbSet = (key, value) => tx("readwrite", (s) => s.put(value, key));
export const idbDel = (key) => tx("readwrite", (s) => s.delete(key));

/**
 * Bytes currently used and available to this origin, when the browser will say.
 * Used only to explain a failure to the user, never to gate a write.
 */
export async function storageEstimate() {
  try {
    if (!navigator?.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}
