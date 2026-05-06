import { writable, get } from "svelte/store";
import type { Bookmark } from "../types";
import { createId } from "../utils/id";
import { getStore } from "./storeUtils";

const STORE_FILE = "bookmarks.json";

export const bookmarkStore = writable<Record<string, Bookmark[]>>({});

export async function loadBookmarks(): Promise<void> {
  try {
    const s = await getStore(STORE_FILE);
    const data =
      (await s.get<Record<string, Bookmark[]>>("bookmarks")) || {};
    bookmarkStore.set(data);
  } catch (e) {
    console.warn("Failed to load bookmarks:", e);
  }
}

async function persist(): Promise<void> {
  try {
    const s = await getStore(STORE_FILE);
    await s.set("bookmarks", get(bookmarkStore));
  } catch (e) {
    console.warn("Failed to persist bookmarks:", e);
  }
}

export function getBookmarks(bookFilePath: string): Bookmark[] {
  return get(bookmarkStore)[bookFilePath] || [];
}

export async function addBookmark(
  bookFilePath: string,
  name: string,
  position: number,
  trackIndex: number,
): Promise<Bookmark> {
  const bookmark: Bookmark = {
    id: createId(),
    bookFilePath,
    name,
    position,
    trackIndex,
    createdAt: new Date().toISOString(),
  };

  bookmarkStore.update((s) => {
    const existing = s[bookFilePath] || [];
    return { ...s, [bookFilePath]: [...existing, bookmark] };
  });
  await persist();
  return bookmark;
}

export async function removeBookmark(
  bookFilePath: string,
  bookmarkId: string,
): Promise<void> {
  bookmarkStore.update((s) => {
    const existing = s[bookFilePath] || [];
    return {
      ...s,
      [bookFilePath]: existing.filter((b) => b.id !== bookmarkId),
    };
  });
  await persist();
}

export async function renameBookmark(
  bookFilePath: string,
  bookmarkId: string,
  newName: string,
): Promise<void> {
  bookmarkStore.update((s) => {
    const existing = s[bookFilePath] || [];
    return {
      ...s,
      [bookFilePath]: existing.map((b) =>
        b.id === bookmarkId ? { ...b, name: newName } : b,
      ),
    };
  });
  await persist();
}
