import { writable, get } from "svelte/store";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, watch } from "@tauri-apps/plugin-fs";
import type { BookMeta, LibraryIndex, TrackInfo } from "../types";
import {
  isSupportedAudioFile,
  isStandaloneAudiobook,
  extractMetadata,
  bookMetaFromPath,
  probeDuration,
} from "../utils/metadata";
import { saveCoverToDisk, isBase64Cover } from "../utils/coverStorage";
import { getSavedPosition, removePosition } from "./positionStore";
import { resetUserBookData } from "./userdataStore";
import { naturalCompare } from "../utils/sort";
import { getStore } from "./storeUtils";

const STORE_FILE = "library.json";

/** Already loaded from store this session — skip redundant reloads on view switch */
let _libraryLoaded = false;

/**
 * Re-generate asset URL through current runtime's convertFileSrc.
 * Handles http:// vs https:// scheme differences between debug/release builds.
 */
function normalizeAssetUrl(url: string | null): string | null {
  if (!url) return url;
  const match = url.match(/^https?:\/\/asset\.localhost\/(.+)/);
  if (match) {
    const filePath = decodeURIComponent(match[1]);
    return convertFileSrc(filePath);
  }
  return url;
}

interface LibraryState {
  books: BookMeta[];
  folders: string[];
  scanning: boolean;
  enriching: boolean;
  positions: Record<string, { position: number; duration: number; lastPlayed: string }>;
}

export const libraryStore = writable<LibraryState>({
  books: [],
  folders: [],
  scanning: false,
  enriching: false,
  positions: {},
});

function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

function parentDir(filePath: string): string {
  const sep = filePath.includes("\\") ? "\\" : "/";
  const parts = filePath.split(sep);
  parts.pop();
  return parts.join(sep);
}

function fileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath;
}

function fileNameNoExt(filePath: string): string {
  return fileName(filePath).replace(/\.[^.]+$/, "");
}

function folderName(dirPath: string): string {
  const parts = dirPath.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || dirPath;
}

/** Recursively collect audio files, returning them ungrouped. */
async function collectAudioFiles(dirPath: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readDir(dirPath);
    for (const entry of entries) {
      const fullPath = joinPath(dirPath, entry.name);
      if (entry.isDirectory) {
        const nested = await collectAudioFiles(fullPath);
        results.push(...nested);
      } else if (entry.name && isSupportedAudioFile(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch (e) {
    console.warn(`Failed to read directory: ${dirPath}`, e);
  }
  return results;
}

/**
 * Group files by parent folder with smart rules:
 * - .m4b files are ALWAYS standalone (complete audiobooks)
 * - Folder with 1 non-standalone file → single-file book
 * - Folder with 2+ non-standalone files → multi-file book (tracks = sorted)
 */
function groupFilesByFolder(
  files: string[],
  scannedRoots: string[],
): BookMeta[] {
  const standalone: string[] = [];
  const groupable: string[] = [];

  for (const fp of files) {
    if (isStandaloneAudiobook(fp)) {
      standalone.push(fp);
    } else {
      groupable.push(fp);
    }
  }

  // Group non-standalone files by parent folder
  const byFolder = new Map<string, string[]>();
  for (const fp of groupable) {
    const dir = parentDir(fp);
    if (!byFolder.has(dir)) byFolder.set(dir, []);
    byFolder.get(dir)!.push(fp);
  }

  const books: BookMeta[] = [];

  // Add all standalone files as individual books
  for (const fp of standalone) {
    books.push({ ...bookMetaFromPath(fp), tracks: [] });
  }

  // Process grouped folders
  for (const [dir, folderFiles] of byFolder) {
    // If this folder is a scanned root folder, treat each file individually
    // (loose files in the root shouldn't be grouped with each other)
    const isRoot = scannedRoots.some(
      (root) => dir === root || dir.replace(/[\\/]$/, "") === root.replace(/[\\/]$/, ""),
    );

    if (folderFiles.length === 1 || isRoot) {
      // Single file or root-level loose files → individual book entries
      for (const fp of folderFiles) {
        books.push({ ...bookMetaFromPath(fp), tracks: [] });
      }
    } else {
      // Multiple files in a subfolder → group as one book with tracks
      folderFiles.sort((a, b) => naturalCompare(fileName(a), fileName(b)));

      const tracks: TrackInfo[] = folderFiles.map((fp, i) => ({
        filePath: fp,
        title: fileNameNoExt(fp),
        duration: 0,
        order: i,
      }));

      books.push({
        filePath: dir,
        title: folderName(dir),
        author: "Unknown Author",
        album: "",
        duration: 0,
        coverArt: null,
        chapters: [],
        tracks,
      });
    }
  }

  return books;
}

async function persistLibrary(): Promise<void> {
  const s = await getStore(STORE_FILE);
  const state = get(libraryStore);
  const index: LibraryIndex = {
    folders: state.folders,
    books: state.books,
    lastScan: new Date().toISOString(),
  };
  await s.set("library", index);
}

export async function removeBook(filePath: string): Promise<void> {
  libraryStore.update((s) => ({
    ...s,
    books: s.books.filter((b) => b.filePath !== filePath),
    positions: Object.fromEntries(
      Object.entries(s.positions).filter(([k]) => k !== filePath),
    ),
  }));
  await resetUserBookData(filePath);
  await removePosition(filePath);
  await persistLibrary();
}

export async function removeFolder(folder: string): Promise<void> {
  const state = get(libraryStore);
  const normalizedFolder = folder.replace(/[\\/]$/, "");
  const booksToRemove = state.books.filter(
    (b) =>
      b.filePath === normalizedFolder ||
      b.filePath.startsWith(normalizedFolder + "\\") ||
      b.filePath.startsWith(normalizedFolder + "/") ||
      b.tracks.some(
        (t) =>
          t.filePath.startsWith(normalizedFolder + "\\") ||
          t.filePath.startsWith(normalizedFolder + "/"),
      ),
  );

  libraryStore.update((s) => ({
    ...s,
    folders: s.folders.filter(
      (f) => f.replace(/[\\/]$/, "") !== normalizedFolder,
    ),
    books: s.books.filter(
      (b) => !booksToRemove.some((r) => r.filePath === b.filePath),
    ),
  }));

  for (const book of booksToRemove) {
    await resetUserBookData(book.filePath);
    await removePosition(book.filePath);
  }

  await persistLibrary();
}

export function getFolders(): string[] {
  return get(libraryStore).folders;
}

export async function loadLibraryFromStore(): Promise<void> {
  if (_libraryLoaded) return;
  _libraryLoaded = true;
  try {
    const s = await getStore(STORE_FILE);
    const index = await s.get<LibraryIndex>("library");
    if (index && index.books.length > 0) {
      // Normalize asset URLs to match current runtime scheme (http vs https)
      const books = index.books.map((b) => ({
        ...b,
        coverArt: normalizeAssetUrl(b.coverArt),
      }));

      const positions: Record<string, { position: number; duration: number; lastPlayed: string }> =
        {};
      for (const book of books) {
        const saved = await getSavedPosition(book.filePath);
        if (saved) {
          positions[book.filePath] = {
            position: saved.position,
            duration: saved.duration,
            lastPlayed: saved.lastPlayed || "",
          };
        }
      }
      libraryStore.set({
        books,
        folders: index.folders,
        scanning: false,
        enriching: false,
        positions,
      });

      // Re-enrich books missing cover art
      const booksNeedingArt = books.filter((b) => !b.coverArt);
      if (booksNeedingArt.length > 0) {
        libraryStore.update((s) => ({ ...s, enriching: true }));
        for (const book of booksNeedingArt) {
          try {
            // For multi-file books, extract metadata from the first track
            const targetFile =
              book.tracks.length > 0 ? book.tracks[0].filePath : book.filePath;
            const enriched = await extractMetadata(targetFile);
            libraryStore.update((s) => {
              const updated = [...s.books];
              const idx = updated.findIndex(
                (b) => b.filePath === book.filePath,
              );
              if (idx !== -1) {
                updated[idx] = {
                  ...updated[idx],
                  coverArt: enriched.coverArt,
                  author: updated[idx].author === "Unknown Author"
                    ? enriched.author
                    : updated[idx].author,
                };
              }
              return { ...s, books: updated };
            });
          } catch {
            // skip
          }
        }
        libraryStore.update((s) => ({ ...s, enriching: false }));
        const updated = get(libraryStore);
        await s.set("library", {
          folders: updated.folders,
          books: updated.books,
          lastScan: index.lastScan,
        });
      }

      // Migrate base64 covers to disk storage (one-time, skips if none found)
      const currentBooks = get(libraryStore).books;
      const hasBase64Covers = currentBooks.some((b) => isBase64Cover(b.coverArt));
      if (hasBase64Covers) {
        const coverUpdates = new Map<string, string>();
        for (const book of currentBooks) {
          if (isBase64Cover(book.coverArt)) {
            try {
              const fileUrl = await saveCoverToDisk(book.filePath, book.coverArt!);
              coverUpdates.set(book.filePath, fileUrl);
            } catch {
              // skip failed migration
            }
          }
        }
        if (coverUpdates.size > 0) {
          libraryStore.update((st) => ({
            ...st,
            books: st.books.map((b) =>
              coverUpdates.has(b.filePath)
                ? { ...b, coverArt: coverUpdates.get(b.filePath)! }
                : b,
            ),
          }));
          await persistLibrary();
        }
      }
    }
  } catch (e) {
    console.warn("Failed to load library from store:", e);
  }
}

export async function addFolder(): Promise<void> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Select audiobook folder",
  });

  if (!selected) return;

  const folder = selected as string;
  const state = get(libraryStore);
  if (state.folders.includes(folder)) return;

  const newFolders = [...state.folders, folder];
  libraryStore.update((s) => ({ ...s, folders: newFolders }));

  await scanFolders(newFolders);
}

export async function scanFolders(folders?: string[]): Promise<void> {
  const state = get(libraryStore);
  const foldersToScan = folders || state.folders;

  if (foldersToScan.length === 0) return;

  libraryStore.update((s) => ({ ...s, scanning: true }));

  try {
    // Phase 1: Collect all files and group by folder
    const allFiles: string[] = [];
    for (const folder of foldersToScan) {
      const files = await collectAudioFiles(folder);
      allFiles.push(...files);
    }

    const books = groupFilesByFolder(allFiles, foldersToScan);
    books.sort((a, b) => a.title.localeCompare(b.title));

    // Load saved positions
    const positions: Record<string, { position: number; duration: number; lastPlayed: string }> =
      {};
    for (const book of books) {
      try {
        const saved = await getSavedPosition(book.filePath);
        if (saved) {
          positions[book.filePath] = {
            position: saved.position,
            duration: saved.duration,
            lastPlayed: saved.lastPlayed || "",
          };
        }
      } catch {
        // skip
      }
    }

    // Show immediately
    libraryStore.set({
      books,
      folders: foldersToScan,
      scanning: false,
      enriching: true,
      positions,
    });

    // Phase 2: Enrich metadata (batch updates every 5 books to reduce re-renders)
    const ENRICH_BATCH_SIZE = 5;
    const enrichedMap = new Map<string, BookMeta>();

    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      try {
        if (book.tracks.length > 0) {
          const firstTrackMeta = await extractMetadata(book.tracks[0].filePath);
          const updatedTracks: TrackInfo[] = [];
          let totalDuration = 0;
          for (const track of book.tracks) {
            const dur = await probeDuration(track.filePath);
            updatedTracks.push({ ...track, duration: dur });
            totalDuration += dur;
          }
          enrichedMap.set(book.filePath, {
            ...book,
            title: firstTrackMeta.album || firstTrackMeta.title || book.title,
            author: firstTrackMeta.author,
            album: firstTrackMeta.album || book.title,
            coverArt: firstTrackMeta.coverArt,
            duration: totalDuration,
            tracks: updatedTracks,
          });
        } else {
          const enriched = await extractMetadata(book.filePath);
          enriched.tracks = [];
          enrichedMap.set(book.filePath, enriched);
        }
      } catch (e) {
        console.warn(`Metadata extraction failed for: ${book.filePath}`, e);
      }

      // Flush batch to store periodically
      if (enrichedMap.size >= ENRICH_BATCH_SIZE || i === books.length - 1) {
        const batch = new Map(enrichedMap);
        enrichedMap.clear();
        libraryStore.update((s) => ({
          ...s,
          books: s.books.map((b) => batch.get(b.filePath) ?? b),
        }));
      }
    }

    libraryStore.update((s) => ({ ...s, enriching: false }));

    // Persist
    await persistLibrary();
  } catch (e) {
    console.error("Library scan failed:", e);
    libraryStore.update((s) => ({
      ...s,
      scanning: false,
      enriching: false,
    }));
  }
}

export async function rescan(): Promise<void> {
  const state = get(libraryStore);
  await scanFolders(state.folders);
}

// ---- File Watcher ----

const WATCH_DEBOUNCE_MS = 2000;
let activeWatchers: Array<() => void> = [];
let watchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export async function startWatching(): Promise<void> {
  await stopWatching();
  const state = get(libraryStore);

  for (const folder of state.folders) {
    try {
      const stop = await watch(folder, () => {
        // Debounce: wait 2s after last change before rescanning
        if (watchDebounceTimer) clearTimeout(watchDebounceTimer);
        watchDebounceTimer = setTimeout(() => {
          watchDebounceTimer = null;
          rescan();
        }, WATCH_DEBOUNCE_MS);
      }, { recursive: true });
      activeWatchers.push(stop);
    } catch (e) {
      console.warn(`Failed to watch folder: ${folder}`, e);
    }
  }
}

export async function stopWatching(): Promise<void> {
  for (const stop of activeWatchers) {
    try { stop(); } catch {}
  }
  activeWatchers = [];
  if (watchDebounceTimer) {
    clearTimeout(watchDebounceTimer);
    watchDebounceTimer = null;
  }
}
