/**
 * In-memory stand-in for `@tauri-apps/plugin-store` used by the test suite.
 * One Map per store filename; `resetStores()` wipes them all between tests.
 * Values are structured-cloned on `set` to mirror the real plugin, which
 * serialises to JSON (so a test can't accidentally share object identity).
 */
const storeData = new Map<string, Map<string, unknown>>();

export interface MemoryStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
  entries(): Promise<[string, unknown][]>;
  clear(): Promise<void>;
  save(): Promise<void>;
}

export function makeStore(name: string): MemoryStore {
  if (!storeData.has(name)) storeData.set(name, new Map());
  const data = storeData.get(name)!;
  return {
    async get<T>(key: string) {
      return data.get(key) as T | undefined;
    },
    async set(key: string, value: unknown) {
      data.set(key, structuredClone(value));
    },
    async delete(key: string) {
      return data.delete(key);
    },
    async has(key: string) {
      return data.has(key);
    },
    async keys() {
      return [...data.keys()];
    },
    async entries() {
      return [...data.entries()];
    },
    async clear() {
      data.clear();
    },
    async save() {},
  };
}

/** Wipe every in-memory store. Call in `beforeEach`. */
export function resetStores(): void {
  for (const m of storeData.values()) m.clear();
}

/** Peek at raw persisted data for assertions. */
export function rawStore(name: string): Map<string, unknown> | undefined {
  return storeData.get(name);
}
