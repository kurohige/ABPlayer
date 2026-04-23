import { writable, derived, get } from "svelte/store";
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
  FilterStatus,
  ExportData,
  SavedPosition,
  TierList,
} from "../types";
import { createId } from "../utils/id";
import { getStore } from "./storeUtils";

const STORE_FILE = "userdata.json";

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
};

function defaultUserBookData(): UserBookData {
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
function normalizeUserBookData(raw: Partial<UserBookData> | undefined | null): UserBookData {
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
    const collections = (await s.get<Collection[]>("collections")) || [];
    const loadedPrefs = await s.get<Partial<UserPreferences>>("preferences");
    // Merge with defaults so new fields always have values
    const preferences: UserPreferences = { ...DEFAULT_PREFERENCES, ...loadedPrefs };

    userdataStore.set({ books, collections, preferences });
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

export async function removeBookFromCollection(
  filePath: string,
  collectionId: string,
): Promise<void> {
  const current = getUserBookData(filePath);
  await setUserBookData(filePath, {
    collections: current.collections.filter((c) => c !== collectionId),
  });
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
  };

  const path = await save({
    defaultPath: "abplayer-library.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (!path) return;

  await writeTextFile(path, JSON.stringify(exportData, null, 2));
}

// ---- Import Library ----

export async function importLibrary(
  savePositionFn: (
    filePath: string,
    position: number,
    duration: number,
    trackIndex: number,
  ) => Promise<void>,
): Promise<{ imported: number; skipped: number }> {
  const path = await open({
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
    title: "Import ABPlayer library",
  });

  if (!path) return { imported: 0, skipped: 0 };

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

  return { imported, skipped };
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

  try {
    const imgPath = selected as string;
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
  if (base64) {
    await setUserBookData(filePath, { coverArtOverride: base64 });
  }
}
