/**
 * Browser-local library (IndexedDB). Keeps recorded/imported clips and saved videos on this browser so they survive a reload.
 * Nothing leaves the device, nothing is synced, and nothing is ever deleted here without a user action.
 * Every call reports failure instead of throwing, so storage that is full or blocked never breaks editing.
 */
const DB_NAME = "cd-library";
const CLIPS = "clips";
const VIDEOS = "videos";

export type StoredClip = { sourceId: string; name: string; type: string; blob: Blob; savedAt: number };
export type SavedVideo = { id: string; name: string; type: string; size: number; format: string; savedAt: number; clipCount: number; platforms: string[]; blob: Blob };
export type LibraryResult<T> = { ok: true; value: T } | { ok: false; error: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("This browser has no local file storage available.")); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CLIPS)) db.createObjectStore(CLIPS, { keyPath: "sourceId" });
      if (!db.objectStoreNames.contains(VIDEOS)) db.createObjectStore(VIDEOS, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local file storage could not be opened."));
    request.onblocked = () => reject(new Error("Local file storage is blocked by another tab."));
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<LibraryResult<T>> {
  try {
    const db = await open();
    try {
      return await new Promise<LibraryResult<T>>((resolve) => {
        const tx = db.transaction(store, mode);
        const request = work(tx.objectStore(store));
        let value: T;
        request.onsuccess = () => { value = request.result; };
        tx.oncomplete = () => resolve({ ok: true, value });
        tx.onerror = () => resolve({ ok: false, error: tx.error?.message ?? "Local file storage failed." });
        tx.onabort = () => resolve({ ok: false, error: tx.error?.name === "QuotaExceededError" ? "This browser is out of storage space." : tx.error?.message ?? "Local file storage was stopped." });
      });
    } finally { db.close(); }
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Local file storage is unavailable." };
  }
}

export function askBrowserToKeepStorage() {
  try { void navigator.storage?.persist?.(); } catch { /* optional hint only */ }
}

export const saveClip = (clip: StoredClip) => run(CLIPS, "readwrite", (s) => s.put(clip));
export const listClips = () => run<StoredClip[]>(CLIPS, "readonly", (s) => s.getAll());
export const saveVideo = (video: SavedVideo) => run(VIDEOS, "readwrite", (s) => s.put(video));
export const listVideos = () => run<SavedVideo[]>(VIDEOS, "readonly", (s) => s.getAll());
export const removeVideo = (id: string) => run(VIDEOS, "readwrite", (s) => s.delete(id));
