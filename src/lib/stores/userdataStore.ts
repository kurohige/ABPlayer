import { writable, get } from "svelte/store";
import { normalizeEqPresets } from "../utils/eqPresets";
import {
  saveCoverToDisk,
  isBase64Cover,
  normalizeAssetUrl,
  overrideCoverKey,
} from "../utils/coverStorage";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type {
  UserBookData,
  UserDataStore,
  UserPreferences,
  Collection,
  BookMeta,
  BookStatus,
  SortBy,
  ExportData,
  SavedPosition,
  TierList,
  AudioSettings,
  BookGroup,
} from "../types";
import { createId } from "../utils/id";
import { getStore } from "./storeUtils";

const STORE_FILE = "userdata.json";

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  speed: 1,
  volume: 1,
  muted: false,
  eqBass: 0,
  eqMid: 0,
  eqTreble: 0,
};

function clampNumber(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
}

/** Back-fill / range-check persisted audio settings (older stores have none). */
export function normalizeAudioSettings(raw: unknown): AudioSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof AudioSettings, unknown>>;
  const d = DEFAULT_AUDIO_SETTINGS;
  return {
    speed: clampNumber(r.speed, d.speed, 0.5, 3),
    volume: clampNumber(r.volume, d.volume, 0, 1),
    muted: r.muted === true,
    eqBass: clampNumber(r.eqBass, d.eqBass, -12, 12),
    eqMid: clampNumber(r.eqMid, d.eqMid, -12, 12),
    eqTreble: clampNumber(r.eqTreble, d.eqTreble, -12, 12),
  };
}

const DEFAULT_PREFERENCES: UserPreferences = {
  viewMode: "grid",
  sortBy: "title",
  filterStatus: "all",
  filterCollection: null,
  filterTier: null,
  theme: "dark",
  colorTheme: "teal",
  miniPlayer: false,
  fontScale: "default",
  fontFamily: "editorial",
  defaultTierListId: null,
  audio: { ...DEFAULT_AUDIO_SETTINGS },
  eqPresets: [],
  reduceMotion: false,
  autoGroupFiles: true,
};

/** A blank record, so views can render a book that has no saved data yet. */
export function defaultUserBookData(): UserBookData {
  return {
    titleOverride: null,
    authorOverride: null,
    coverArtOverride: null,
    collections: [],
    status: "not_started",
    genre: null,
    series: null,
    seriesOrder: null,
    gainDb: null,
    dateAdded: new Date().toISOString(),
    dateFinished: null,
    narrator: null,
    description: null,
    notes: null,
    quotes: [],
    tags: [],
    yearRead: null,
    publishYear: null,
    source: null,
    axes: {},
    axisLabels: null,
  };
}

/** Backfill missing fields from persisted data to current shape. */
export function normalizeUserBookData(raw: Partial<UserBookData> | undefined | null): UserBookData {
  const base = defaultUserBookData();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    collections: Array.isArray(raw.collections) ? raw.collections : base.collections,
    quotes: Array.isArray(raw.quotes) ? raw.quotes : base.quotes,
    tags: Array.isArray(raw.tags) ? raw.tags : base.tags,
    axes:
      raw.axes && typeof raw.axes === "object" && !Array.isArray(raw.axes)
        ? (raw.axes as Record<string, number>)
        : base.axes,
    axisLabels: Array.isArray(raw.axisLabels) ? raw.axisLabels : base.axisLabels,
  };
}

export const userdataStore = writable<UserDataStore>({
  books: {},
  collections: [],
  preferences: { ...DEFAULT_PREFERENCES },
});

// ---- Load / Persist ----

export async function loadUserData(): Promise<void> {
  try {
    const s = await getStore(STORE_FILE);
    const rawBooks = (await s.get<Record<string, Partial<UserBookData>>>("books")) || {};
    const books: Record<string, UserBookData> = {};
    for (const key of Object.keys(rawBooks)) {
      books[key] = normalizeUserBookData(rawBooks[key]);
    }

    // Cover overrides: re-point asset URLs at the current runtime scheme and
    // migrate any inline base64 override to $APPDATA/covers/ (one-time; older
    // versions stored the picked image inline in this file).
    let overridesMigrated = false;
    for (const key of Object.keys(books)) {
      const ref = books[key].coverArtOverride;
      if (!ref) continue;
      if (isBase64Cover(ref)) {
        try {
          const url = await saveCoverToDisk(overrideCoverKey(key), ref);
          books[key] = { ...books[key], coverArtOverride: url };
          overridesMigrated = true;
        } catch {
          // keep inline; retried on next load
        }
      } else {
        const normalized = normalizeAssetUrl(ref);
        if (normalized !== ref) {
          books[key] = { ...books[key], coverArtOverride: normalized };
        }
      }
    }

    const collections = (await s.get<Collection[]>("collections")) || [];
    const loadedPrefs = await s.get<Partial<UserPreferences>>("preferences");
    // Merge with defaults so new fields always have values (nested audio
    // settings get their own back-fill so a partial object never leaks through)
    const preferences: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      ...loadedPrefs,
      audio: normalizeAudioSettings(loadedPrefs?.audio),
      eqPresets: normalizeEqPresets(loadedPrefs?.eqPresets),
      reduceMotion: loadedPrefs?.reduceMotion === true,
      autoGroupFiles: loadedPrefs?.autoGroupFiles !== false,
    };

    userdataStore.set({ books, collections, preferences });
    if (overridesMigrated) await persist();
  } catch (e) {
    console.warn("Failed to load user data:", e);
  }
}

async function persist(): Promise<void> {
  try {
    const data = get(userdataStore);
    const s = await getStore(STORE_FILE);
    await s.set("books", data.books);
    await s.set("collections", data.collections);
    await s.set("preferences", data.preferences);
  } catch (e) {
    console.warn("Failed to persist user data:", e);
  }
}

// ---- Book Data CRUD ----

export function getUserBookData(filePath: string): UserBookData {
  const data = get(userdataStore);
  return data.books[filePath] || defaultUserBookData();
}

export async function setUserBookData(
  filePath: string,
  updates: Partial<UserBookData>,
): Promise<void> {
  userdataStore.update((s) => {
    const existing = s.books[filePath] || defaultUserBookData();
    return {
      ...s,
      books: {
        ...s.books,
        [filePath]: { ...existing, ...updates },
      },
    };
  });
  await persist();
}

/**
 * Apply one change to many books with a single write. `change` sees each
 * book's current data and returns the fields to replace (null = leave as is).
 */
export async function updateManyBooks(
  filePaths: Iterable<string>,
  change: (current: UserBookData) => Partial<UserBookData> | null,
): Promise<void> {
  let changed = false;
  userdataStore.update((s) => {
    const books = { ...s.books };
    for (const fp of filePaths) {
      const existing = books[fp] || defaultUserBookData();
      const updates = change(existing);
      if (!updates) continue;
      books[fp] = { ...existing, ...updates };
      changed = true;
    }
    return changed ? { ...s, books } : s;
  });
  if (changed) await persist();
}

export async function setBooksStatus(filePaths: Iterable<string>, status: BookStatus): Promise<void> {
  const dateFinished = status === "finished" ? new Date().toISOString() : null;
  await updateManyBooks(filePaths, () => ({ status, dateFinished }));
}

export async function addBooksToCollection(
  filePaths: Iterable<string>,
  collectionId: string,
): Promise<void> {
  await updateManyBooks(filePaths, (b) =>
    b.collections.includes(collectionId)
      ? null
      : { collections: [...b.collections, collectionId] },
  );
}

/** Tags compare case-insensitively; the first spelling seen on a book is kept. */
export async function addTagToBooks(filePaths: Iterable<string>, tag: string): Promise<void> {
  const clean = tag.trim();
  if (!clean) return;
  const key = clean.toLowerCase();
  await updateManyBooks(filePaths, (b) =>
    b.tags.some((t) => t.toLowerCase() === key) ? null : { tags: [...b.tags, clean] },
  );
}

export async function removeTagFromBooks(filePaths: Iterable<string>, tag: string): Promise<void> {
  const key = tag.trim().toLowerCase();
  await updateManyBooks(filePaths, (b) =>
    b.tags.some((t) => t.toLowerCase() === key)
      ? { tags: b.tags.filter((t) => t.toLowerCase() !== key) }
      : null,
  );
}

export async function resetUserBookData(filePath: string): Promise<void> {
  userdataStore.update((s) => {
    const { [filePath]: _, ...rest } = s.books;
    return { ...s, books: rest };
  });
  await persist();
}

export async function setBookStatus(
  filePath: string,
  status: BookStatus,
): Promise<void> {
  const updates: Partial<UserBookData> = { status };
  if (status === "finished") {
    updates.dateFinished = new Date().toISOString();
  } else {
    updates.dateFinished = null;
  }
  await setUserBookData(filePath, updates);
}

/** Auto-promote not_started → in_progress when playback starts. */
export async function markInProgressIfNew(filePath: string): Promise<void> {
  const current = getUserBookData(filePath);
  if (current.status === "not_started") {
    await setBookStatus(filePath, "in_progress");
  }
}

// ---- Display Helpers ----

export function getDisplayTitle(book: BookMeta, userData?: UserBookData): string {
  return userData?.titleOverride || book.title;
}

export function getDisplayAuthor(book: BookMeta, userData?: UserBookData): string {
  return userData?.authorOverride || book.author;
}

export function getDisplayCover(book: BookMeta, userData?: UserBookData): string | null {
  return userData?.coverArtOverride || book.coverArt;
}

// ---- Collections CRUD ----

export async function createCollection(
  name: string,
  color: string = "#0d7377",
): Promise<string> {
  const id = createId();
  const collection: Collection = {
    id,
    name,
    color,
    createdAt: new Date().toISOString(),
  };
  userdataStore.update((s) => ({
    ...s,
    collections: [...s.collections, collection],
  }));
  await persist();
  return id;
}

export async function deleteCollection(id: string): Promise<void> {
  userdataStore.update((s) => {
    // Remove from collection list
    const collections = s.collections.filter((c) => c.id !== id);
    // Remove from all books
    const books = { ...s.books };
    for (const key of Object.keys(books)) {
      if (books[key].collections.includes(id)) {
        books[key] = {
          ...books[key],
          collections: books[key].collections.filter((c) => c !== id),
        };
      }
    }
    // Clear filter if it was pointing to deleted collection
    const preferences =
      s.preferences.filterCollection === id
        ? { ...s.preferences, filterCollection: null }
        : s.preferences;
    return { books, collections, preferences };
  });
  await persist();
}

export async function renameCollection(
  id: string,
  name: string,
): Promise<void> {
  userdataStore.update((s) => ({
    ...s,
    collections: s.collections.map((c) =>
      c.id === id ? { ...c, name } : c,
    ),
  }));
  await persist();
}

export async function addBookToCollection(
  filePath: string,
  collectionId: string,
): Promise<void> {
  const current = getUserBookData(filePath);
  if (!current.collections.includes(collectionId)) {
    await setUserBookData(filePath, {
      collections: [...current.collections, collectionId],
    });
  }
}

// ---- Preferences ----

export async function setPreference<K extends keyof UserPreferences>(
  key: K,
  value: UserPreferences[K],
): Promise<void> {
  userdataStore.update((s) => ({
    ...s,
    preferences: { ...s.preferences, [key]: value },
  }));
  await persist();
}

// ---- Sort & Filter ----

export function sortAndFilterBooks(
  books: BookMeta[],
  userData: Record<string, UserBookData>,
  positions: Record<string, { position: number; duration: number }>,
  prefs: UserPreferences,
): BookMeta[] {
  let result = [...books];

  // Filter by status
  if (prefs.filterStatus !== "all") {
    result = result.filter((b) => {
      const ud = userData[b.filePath];
      const status = ud?.status || "not_started";
      return status === prefs.filterStatus;
    });
  }

  // Filter by collection
  if (prefs.filterCollection) {
    result = result.filter((b) => {
      const ud = userData[b.filePath];
      return ud?.collections.includes(prefs.filterCollection!) || false;
    });
  }

  // Sort
  result.sort((a, b) => {
    const udA = userData[a.filePath];
    const udB = userData[b.filePath];

    switch (prefs.sortBy) {
      case "title": {
        const tA = udA?.titleOverride || a.title;
        const tB = udB?.titleOverride || b.title;
        return tA.localeCompare(tB);
      }
      case "author": {
        const aA = udA?.authorOverride || a.author;
        const aB = udB?.authorOverride || b.author;
        return aA.localeCompare(aB);
      }
      case "recent": {
        const pA = positions[a.filePath];
        const pB = positions[b.filePath];
        // Books with positions first, then by no position
        if (pA && !pB) return -1;
        if (!pA && pB) return 1;
        return 0;
      }
      case "status": {
        const order: Record<string, number> = {
          in_progress: 0,
          not_started: 1,
          finished: 2,
        };
        const sA = order[udA?.status || "not_started"] ?? 1;
        const sB = order[udB?.status || "not_started"] ?? 1;
        return sA - sB;
      }
      case "series": {
        const serA = udA?.series || "";
        const serB = udB?.series || "";
        // Books with series first, then by series name, then by order
        if (serA && !serB) return -1;
        if (!serA && serB) return 1;
        if (serA && serB) {
          const cmp = serA.localeCompare(serB);
          if (cmp !== 0) return cmp;
          return (udA?.seriesOrder ?? 999) - (udB?.seriesOrder ?? 999);
        }
        // Both without series — sort by title
        const tA = udA?.titleOverride || a.title;
        const tB = udB?.titleOverride || b.title;
        return tA.localeCompare(tB);
      }
      default:
        return 0;
    }
  });

  return result;
}

// ---- Export ----

export async function exportLibrary(
  books: BookMeta[],
  getPosition: (filePath: string) => Promise<SavedPosition | null>,
  tierLists: TierList[] = [],
  groups: BookGroup[] = [],
): Promise<void> {
  const data = get(userdataStore);

  const exportBooks: ExportData["books"] = {};
  for (const book of books) {
    const userData = data.books[book.filePath] || defaultUserBookData();
    const position = await getPosition(book.filePath);
    exportBooks[book.filePath] = { ...book, userData, position };
  }

  const exportData: ExportData = {
    version: 2,
    exportedAt: new Date().toISOString(),
    books: exportBooks,
    collections: data.collections,
    preferences: data.preferences,
    tierLists,
    groups,
  };

  const path = await save({
    defaultPath: "abplayer-library.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (!path) return;

  await writeTextFile(path, JSON.stringify(exportData, null, 2));
}

// ---- Import Library ----

export interface ImportResult {
  imported: number;
  skipped: number;
  tierListsImported: number;
  filelessRestored: number;
}

export async function importLibrary(
  savePositionFn: (
    filePath: string,
    position: number,
    duration: number,
    trackIndex: number,
  ) => Promise<void>,
): Promise<ImportResult> {
  const path = await open({
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
    title: "Import ABPlayer library",
  });

  if (!path) return { imported: 0, skipped: 0, tierListsImported: 0, filelessRestored: 0 };

  const text = new TextDecoder().decode(await readFile(path as string));
  let importData: ExportData;
  try {
    importData = JSON.parse(text);
  } catch {
    throw new Error("File is not valid JSON");
  }

  if (
    typeof importData !== "object" ||
    importData === null ||
    typeof importData.version !== "number" ||
    typeof importData.books !== "object" ||
    importData.books === null
  ) {
    throw new Error("Invalid library file: missing required fields");
  }

  if (importData.version > 2) {
    throw new Error(`Unsupported library version: ${importData.version}. Please update ABPlayer.`);
  }

  let imported = 0;
  let skipped = 0;
  const filelessToRestore: BookMeta[] = [];

  // Merge collections (skip duplicates by name)
  const currentData = get(userdataStore);
  const existingNames = new Set(currentData.collections.map((c) => c.name));
  const idMap = new Map<string, string>(); // old ID → new/existing ID

  for (const col of Array.isArray(importData.collections) ? importData.collections : []) {
    if (typeof col?.id !== "string" || typeof col?.name !== "string") continue;
    if (existingNames.has(col.name)) {
      const existing = currentData.collections.find((c) => c.name === col.name)!;
      idMap.set(col.id, existing.id);
    } else {
      const newId = await createCollection(col.name, typeof col.color === "string" ? col.color : "#0d7377");
      idMap.set(col.id, newId);
    }
  }

  // Merge book user data
  for (const [filePath, entry] of Object.entries(importData.books)) {
    if (typeof filePath !== "string" || !filePath || typeof entry !== "object" || entry === null) {
      skipped++;
      continue;
    }

    // Metadata-only books exist nowhere but this export. Remember them so
    // the library entry can be re-created after the user data is merged.
    if (entry.fileless === true) {
      filelessToRestore.push(entry);
    }

    const existing = currentData.books[filePath];
    if (existing && existing.status !== "not_started") {
      skipped++;
      continue;
    }

    // Remap collection IDs
    const rawCollections = Array.isArray(entry.userData?.collections) ? entry.userData.collections : [];
    const remappedCollections = rawCollections
      .filter((id): id is string => typeof id === "string")
      .map((id) => idMap.get(id) || id)
      .filter((id) => get(userdataStore).collections.some((c) => c.id === id));

    await setUserBookData(filePath, {
      ...entry.userData,
      collections: remappedCollections,
    });

    // Restore saved position
    if (
      entry.position &&
      typeof entry.position.position === "number" &&
      entry.position.position > 0 &&
      typeof entry.position.duration === "number"
    ) {
      await savePositionFn(
        filePath,
        entry.position.position,
        entry.position.duration,
        typeof entry.position.trackIndex === "number" ? entry.position.trackIndex : 0,
      );
    }

    imported++;
  }

  // Re-create fileless books with their original sentinel path so the
  // userdata / positions / tier assignments merged above line up.
  // Dynamic import: libraryStore imports this module, so a static import
  // would be an evaluation-order cycle.
  let filelessRestored = 0;
  if (filelessToRestore.length > 0) {
    const { restoreFilelessBook } = await import("./libraryStore");
    for (const meta of filelessToRestore) {
      if (await restoreFilelessBook(meta)) filelessRestored++;
    }
  }

  // Books combined from separate files: restore the grouping before the
  // caller's rescan, so their user data and tier placements find a book.
  if (Array.isArray(importData.groups) && importData.groups.length > 0) {
    const { restoreGroups } = await import("./libraryStore");
    await restoreGroups(importData.groups);
  }

  // Tier lists were added to the export in format v2; restore them too.
  // Assignments are kept for books in this export (real files reappear on the
  // rescan the caller triggers) or already in the library. Dynamic import for
  // the same cycle reason as above.
  let tierListsImported = 0;
  if (Array.isArray(importData.tierLists)) {
    const { importTierLists } = await import("./tierListStore");
    const { libraryStore } = await import("./libraryStore");
    const knownPaths = new Set<string>([
      ...Object.keys(importData.books),
      ...get(libraryStore).books.map((b) => b.filePath),
    ]);
    tierListsImported = await importTierLists(importData.tierLists, knownPaths);
  }

  // Optionally merge preferences (only if user has defaults)
  const validSortValues: string[] = ["title", "author", "recent", "status", "series"];
  if (
    importData.preferences &&
    typeof importData.preferences === "object" &&
    typeof importData.preferences.sortBy === "string" &&
    validSortValues.includes(importData.preferences.sortBy)
  ) {
    const current = get(userdataStore).preferences;
    if (current.sortBy === "title" && current.filterStatus === "all") {
      await setPreference("sortBy", importData.preferences.sortBy as SortBy);
    }
  }

  return { imported, skipped, tierListsImported, filelessRestored };
}

// ---- Cover Art Override ----

/** Prompt the user to pick an image and return a resized JPEG base64 data URL, or null. */
export async function pickCoverArtData(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    title: "Select cover art",
  });

  if (!selected) return null;
  return coverDataFromFile(selected as string);
}

/** Read an image file and return it as a cover-sized JPEG data URL, or null if it can't be read. */
export async function coverDataFromFile(imgPath: string): Promise<string | null> {
  try {
    const imgData = await readFile(imgPath);

    const ext = imgPath.split(".").pop()?.toLowerCase() || "png";
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "webp"
          ? "image/webp"
          : "image/png";

    const blob = new Blob([imgData], { type: mime });
    const bitmap = await createImageBitmap(blob);

    const maxDim = 256;
    let w = bitmap.width;
    let h = bitmap.height;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); return null; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const resizedBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    const arrayBuf = await resizedBlob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuf);

    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      const chunk = uint8.subarray(i, Math.min(i + chunkSize, uint8.length));
      binary += String.fromCharCode(...chunk);
    }
    return `data:image/jpeg;base64,${btoa(binary)}`;
  } catch (e) {
    console.error("Failed to process cover art:", e);
    return null;
  }
}

export async function pickCoverArt(filePath: string): Promise<void> {
  const base64 = await pickCoverArtData();
  if (!base64) return;
  // Store the override as a file in $APPDATA/covers/ (own key, so it never
  // clobbers the cover extracted from the audio file) and keep the asset URL.
  let ref = base64;
  try {
    ref = await saveCoverToDisk(overrideCoverKey(filePath), base64);
  } catch (e) {
    console.warn("Cover override not written to disk, keeping inline:", e);
  }
  await setUserBookData(filePath, { coverArtOverride: ref });
}
