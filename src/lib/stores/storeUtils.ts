import { load, type Store } from "@tauri-apps/plugin-store";

const storeCache = new Map<string, Store>();

/**
 * Get a Tauri plugin-store instance, cached per filename.
 * Replaces the repeated let store / getStore() pattern across store files.
 */
export async function getStore(filename: string): Promise<Store> {
  const cached = storeCache.get(filename);
  if (cached) return cached;
  const store = await load(filename, { autoSave: true, defaults: {} });
  storeCache.set(filename, store);
  return store;
}
