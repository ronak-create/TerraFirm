// Tiny promise-based IndexedDB key/value store with per-entry TTL.
// No dependencies — keeps the bundle lean. Falls back to an in-memory map if
// IndexedDB is unavailable (e.g. private mode), so the app never hard-crashes.

const DB_NAME = 'terrafirm';
const STORE = 'kv';
const VERSION = 1;

interface Entry<T> {
  value: T;
  expires: number; // epoch ms; Infinity-safe (stored as a number)
}

const memory = new Map<string, Entry<unknown>>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return openDB().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) {
          resolve(undefined);
          return;
        }
        try {
          const t = db.transaction(STORE, mode);
          const req = fn(t.objectStore(STORE));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      })
  );
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const now = Date.now();
  // Memory tier first (fast path within a session).
  const mem = memory.get(key) as Entry<T> | undefined;
  if (mem) {
    if (mem.expires > now) return mem.value;
    memory.delete(key);
  }
  const entry = (await tx<Entry<T>>('readonly', (s) => s.get(key))) ?? undefined;
  if (!entry) return null;
  if (entry.expires <= now) {
    void cacheDelete(key);
    return null;
  }
  memory.set(key, entry);
  return entry.value;
}

export async function cacheSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const entry: Entry<T> = { value, expires: Date.now() + ttlMs };
  memory.set(key, entry);
  await tx('readwrite', (s) => s.put(entry, key));
}

export async function cacheDelete(key: string): Promise<void> {
  memory.delete(key);
  await tx('readwrite', (s) => s.delete(key));
}

/** Force-expire a set of keys (used by the manual refresh button). */
export async function cacheExpire(keys: string[]): Promise<void> {
  await Promise.all(keys.map((k) => cacheDelete(k)));
}
