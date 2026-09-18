import { writable, get } from "svelte/store";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, watch } from "@tauri-apps/plugin-fs";
import type { BookGroup, BookMeta, LibraryIndex, TrackInfo, UserBookData } from "../types";
import {
  isSupportedAudioFile,
  isStandaloneAudiobook,
  extractMetadata,
  bookMetaFromPath,
  probeDuration,
} from "../utils/metadata";
import { saveCoverToDisk, isBase64Cover, normalizeAssetUrl } from "../utils/coverStorage";
import { getSavedPosition, removePosition } from "./positionStore";
import {
  userdataStore,
  resetUserBookData,
  setUserBookData,
  coverDataFromFile,
} from "./userdataStore";
import { tierListsStore, assignBookToTier, removeBookFromAllLists } from "./tierListStore";
import {
  autoGroupPath,
  fileStem,
  groupLooseFiles,
  manualGroupPath,
  pickFolderCover,
  titleFromLabel,
} from "../utils/grouping";
import { naturalCompare } from "../utils/sort";
import { getStore } from "./storeUtils";
import { createId } from "../utils/id";

const STORE_FILE = "library.json";

/** Already loaded from store this session — skip redundant reloads on view switch */
let _libraryLoaded = false;

interface LibraryState {
  books: BookMeta[];
  folders: string[];
  scanning: boolean;
  enriching: boolean;
  positions: Record<string, { position: number; duration: number; lastPlayed: string }>;
  /** Books the user combined from separate files. */
  groups?: BookGroup[];
  /** Folder paths and auto-group keys the user split back into files. */
  splitKeys?: string[];
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

export interface GroupingOptions {
  /** Fold loose chapter files in a scanned root into books (default true). */
  autoGroup?: boolean;
  /** Album tag per file, from an earlier scan; files not listed count as untagged. */
  albums?: Map<string, string>;
  /** Books the user combined by hand; they claim their files first. */
  groups?: BookGroup[];
  /** Folder paths and auto-group keys that must stay single files. */
  splitKeys?: string[];
}

function tracksFrom(paths: string[]): TrackInfo[] {
  return paths.map((fp, i) => ({ filePath: fp, title: fileNameNoExt(fp), duration: 0, order: i }));
}

function multiFileBook(
  filePath: string,
  title: string,
  paths: string[],
  grouped?: "auto" | "manual",
): BookMeta {
  return {
    filePath,
    title,
    author: "Unknown Author",
    album: "",
    duration: 0,
    coverArt: null,
    chapters: [],
    tracks: tracksFrom(paths),
    ...(grouped ? { grouped } : {}),
  };
}

/**
 * Group files into books with smart rules:
 * - Files the user combined by hand are one book, whatever else applies
 * - .m4b files are ALWAYS standalone (complete audiobooks)
 * - Folder with 1 non-standalone file → single-file book
 * - Subfolder with 2+ non-standalone files → multi-file book (tracks = sorted)
 * - Loose files in a scanned root → grouped by album tag, else by file name
 *   once numbering is removed (see utils/grouping); the rest stay single
 */
export function groupFilesByFolder(
  files: string[],
  scannedRoots: string[],
  options: GroupingOptions = {},
): BookMeta[] {
  const autoGroup = options.autoGroup !== false;
  const albums = options.albums ?? new Map<string, string>();
  const split = new Set(options.splitKeys ?? []);

  const standalone: string[] = [];
  const groupable: string[] = [];
  const manual: BookMeta[] = [];

  const present = new Set(files);
  const claimed = new Set<string>();
  for (const g of options.groups ?? []) {
    // A track whose file is gone drops out; the group itself is kept
    const paths = g.trackPaths.filter((p) => present.has(p) && !claimed.has(p));
    if (paths.length === 0) continue;
    for (const p of paths) claimed.add(p);
    manual.push(multiFileBook(manualGroupPath(g.id), g.title, paths, "manual"));
  }

  for (const fp of files) {
    if (claimed.has(fp)) continue;
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

  const books: BookMeta[] = [...manual];

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

    if (isRoot && autoGroup && folderFiles.length > 1) {
      // Loose files in the root: several books' chapters may share this folder
      const { groups, singles } = groupLooseFiles(
        folderFiles.map((fp) => ({ path: fp, name: fileNameNoExt(fp), album: albums.get(fp) ?? "" })),
      );
      for (const g of groups) {
        const key = autoGroupPath(dir, g.label);
        if (split.has(key)) {
          singles.push(...g.files);
          continue;
        }
        const title =
          g.source === "album" ? g.label : g.label ? titleFromLabel(g.label) : folderName(dir);
        books.push(multiFileBook(key, title, g.files.map((f) => f.path), "auto"));
      }
      for (const f of singles) books.push({ ...bookMetaFromPath(f.path), tracks: [] });
    } else if (folderFiles.length === 1 || isRoot || split.has(dir)) {
      // Single file, root-level loose files, or a folder the user split → individual entries
      for (const fp of folderFiles) {
        books.push({ ...bookMetaFromPath(fp), tracks: [] });
      }
    } else {
      // Multiple files in a subfolder → group as one book with tracks
      folderFiles.sort((a, b) => naturalCompare(fileName(a), fileName(b)));
      books.push(multiFileBook(dir, folderName(dir), folderFiles));
    }
  }

  return books;
}

/**
 * After tags are read, grouping may find books it could not see by file name
 * alone. Keep every book that still exists as it is; build each new grouped
 * book from the single-file entries it replaces, so nothing is read twice.
 */
export function mergeRegrouped(current: BookMeta[], regrouped: BookMeta[]): BookMeta[] {
  const byPath = new Map(current.map((b) => [b.filePath, b]));
  return regrouped.map((next) => {
    const existing = byPath.get(next.filePath);
    if (existing) return existing;
    if (next.tracks.length === 0) return next;
    const parts = next.tracks.map((t) => byPath.get(t.filePath));
    const first = parts.find((p) => p !== undefined);
    return {
      ...next,
      author: first?.author ?? next.author,
      album: first?.album ?? "",
      coverArt: parts.find((p) => p?.coverArt)?.coverArt ?? null,
      duration: parts.reduce((sum, p) => sum + (p?.duration ?? 0), 0),
      tracks: next.tracks.map((t, i) => ({ ...t, duration: parts[i]?.duration ?? 0 })),
    };
  });
}

/** Album per audio file, as far as the current library knows it. */
function knownAlbums(books: BookMeta[]): Map<string, string> {
  const albums = new Map<string, string>();
  for (const b of books) {
    if (b.fileless || !b.album) continue;
    // A manual group's album is its first file's, not necessarily every file's
    if (b.grouped === "manual") continue;
    if (b.tracks.length === 0) albums.set(b.filePath, b.album);
    else for (const t of b.tracks) albums.set(t.filePath, b.album);
  }
  return albums;
}

function groupingOptions(state: LibraryState): GroupingOptions {
  return {
    autoGroup: get(userdataStore).preferences.autoGroupFiles,
    albums: knownAlbums(state.books),
    groups: state.groups ?? [],
    splitKeys: state.splitKeys ?? [],
  };
}

function isScannedRoot(dir: string, roots: string[]): boolean {
  const norm = dir.replace(/[\\/]$/, "");
  return roots.some((r) => r.replace(/[\\/]$/, "") === norm);
}

/**
 * A cover from an image file in the book's folder (cover.jpg, folder.png, or
 * the folder's only image). Skipped for a scanned root, where an image could
 * belong to any of the books lying there.
 */
async function folderCover(dir: string, roots: string[]): Promise<string | null> {
  if (isScannedRoot(dir, roots)) return null;
  try {
    const entries = await readDir(dir);
    const pick = pickFolderCover(entries.filter((e) => !e.isDirectory).map((e) => e.name));
    return pick ? await coverDataFromFile(joinPath(dir, pick)) : null;
  } catch {
    return null;
  }
}

async function persistLibrary(): Promise<void> {
  const s = await getStore(STORE_FILE);
  const state = get(libraryStore);
  const index: LibraryIndex = {
    folders: state.folders,
    books: state.books,
    lastScan: new Date().toISOString(),
    groups: state.groups ?? [],
    splitKeys: state.splitKeys ?? [],
  };
  await s.set("library", index);
}

export async function removeBook(filePath: string): Promise<void> {
  libraryStore.update((s) => ({
    ...s,
    books: s.books.filter((b) => b.filePath !== filePath),
    // A combined book would otherwise come back on the next scan
    groups: (s.groups ?? []).filter((g) => manualGroupPath(g.id) !== filePath),
    positions: Object.fromEntries(
      Object.entries(s.positions).filter(([k]) => k !== filePath),
    ),
  }));
  await resetUserBookData(filePath);
  await removePosition(filePath);
  await removeBookFromAllLists(filePath);
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
    groups: (s.groups ?? []).filter(
      (g) => !booksToRemove.some((r) => r.filePath === manualGroupPath(g.id)),
    ),
  }));

  for (const book of booksToRemove) {
    await resetUserBookData(book.filePath);
    await removePosition(book.filePath);
    await removeBookFromAllLists(book.filePath);
  }

  await persistLibrary();
}

/**
 * Create a metadata-only ("fileless") book — no audio file required.
 * Stored alongside real books with `fileless: true`; uses a sentinel filePath
 * (`fileless:<id>`) so existing filePath-keyed stores keep working unchanged.
 */
export async function addFilelessBook(args: {
  title: string;
  author: string;
  coverArt?: string | null;
  userData?: Partial<UserBookData>;
}): Promise<string> {
  const filePath = `fileless:${createId()}`;
  // Write the picked cover to $APPDATA/covers/ up front so the store never
  // holds inline base64 (it would otherwise wait for the next-launch migration).
  let coverArt = args.coverArt ?? null;
  if (coverArt && isBase64Cover(coverArt)) {
    try {
      coverArt = await saveCoverToDisk(filePath, coverArt);
    } catch {
      // keep inline; migrated on next load
    }
  }
  const book: BookMeta = {
    filePath,
    title: args.title.trim() || "Untitled",
    author: (args.author || "Unknown Author").trim(),
    album: "",
    duration: 0,
    coverArt,
    chapters: [],
    tracks: [],
    fileless: true,
  };

  libraryStore.update((s) => ({ ...s, books: [...s.books, book] }));
  if (args.userData) {
    await setUserBookData(filePath, args.userData);
  }
  await persistLibrary();
  return filePath;
}

/**
 * Re-create a fileless book from a library export, keeping its original
 * sentinel filePath so userdata / positions / tier assignments line up.
 * No-op if a book with that path already exists. Returns true if added.
 */
export async function restoreFilelessBook(meta: BookMeta): Promise<boolean> {
  if (typeof meta.filePath !== "string" || !meta.filePath.startsWith("fileless:")) return false;
  if (get(libraryStore).books.some((b) => b.filePath === meta.filePath)) return false;

  let coverArt = meta.coverArt ?? null;
  if (coverArt && isBase64Cover(coverArt)) {
    try {
      coverArt = await saveCoverToDisk(meta.filePath, coverArt);
    } catch {
      // keep inline
    }
  } else {
    coverArt = normalizeAssetUrl(coverArt);
  }

  const book: BookMeta = {
    filePath: meta.filePath,
    title: (typeof meta.title === "string" ? meta.title : "").trim() || "Untitled",
    author: (typeof meta.author === "string" ? meta.author : "").trim() || "Unknown Author",
    album: typeof meta.album === "string" ? meta.album : "",
    duration: typeof meta.duration === "number" ? meta.duration : 0,
    coverArt,
    chapters: [],
    tracks: [],
    fileless: true,
  };
  libraryStore.update((s) => ({ ...s, books: [...s.books, book] }));
  await persistLibrary();
  return true;
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
        groups: Array.isArray(index.groups) ? index.groups : [],
        splitKeys: Array.isArray(index.splitKeys) ? index.splitKeys : [],
      });

      // Re-enrich books missing cover art (skip fileless — they have no file to extract from)
      const booksNeedingArt = books.filter((b) => !b.coverArt && !b.fileless);
      if (booksNeedingArt.length > 0) {
        libraryStore.update((s) => ({ ...s, enriching: true }));
        for (const book of booksNeedingArt) {
          try {
            // For multi-file books, extract metadata from the first track
            const targetFile =
              book.tracks.length > 0 ? book.tracks[0].filePath : book.filePath;
            const enriched = await extractMetadata(targetFile);
            const coverArt =
              enriched.coverArt ?? (await folderCover(parentDir(targetFile), index.folders));
            libraryStore.update((s) => {
              const updated = [...s.books];
              const idx = updated.findIndex(
                (b) => b.filePath === book.filePath,
              );
              if (idx !== -1) {
                updated[idx] = {
                  ...updated[idx],
                  coverArt,
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
          groups: updated.groups ?? [],
          splitKeys: updated.splitKeys ?? [],
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

    const scannedBooks = groupFilesByFolder(allFiles, foldersToScan, groupingOptions(get(libraryStore)));
    // Preserve any fileless (metadata-only) books already in the library
    const preservedFileless = get(libraryStore).books.filter((b) => b.fileless === true);
    const books = [...scannedBooks, ...preservedFileless];
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
    libraryStore.update((s) => ({
      ...s,
      books,
      folders: foldersToScan,
      scanning: false,
      enriching: true,
      positions,
    }));

    // Phase 2: Enrich metadata (batch updates every 5 books to reduce re-renders)
    const ENRICH_BATCH_SIZE = 5;
    const enrichedMap = new Map<string, BookMeta>();

    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      if (book.fileless) continue;
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
            // The first file's own title is a chapter name, never the book's
            title: book.grouped === "manual" ? book.title : firstTrackMeta.album || book.title,
            author: firstTrackMeta.author,
            album: firstTrackMeta.album || book.title,
            coverArt:
              firstTrackMeta.coverArt ??
              (await folderCover(parentDir(book.tracks[0].filePath), foldersToScan)),
            duration: totalDuration,
            tracks: updatedTracks,
          });
        } else {
          const enriched = await extractMetadata(book.filePath);
          enriched.tracks = [];
          if (!enriched.coverArt) {
            enriched.coverArt = await folderCover(parentDir(book.filePath), foldersToScan);
          }
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

    // Now that album tags are known, files that could not be matched by name may belong together
    const enrichedState = get(libraryStore);
    const regrouped = groupFilesByFolder(allFiles, foldersToScan, groupingOptions(enrichedState));
    const scannedNow = enrichedState.books.filter((b) => !b.fileless);
    const same =
      regrouped.length === scannedNow.length &&
      regrouped.every((r) => scannedNow.some((b) => b.filePath === r.filePath));
    if (!same) {
      const merged = [
        ...mergeRegrouped(scannedNow, regrouped),
        ...enrichedState.books.filter((b) => b.fileless === true),
      ].sort((a, b) => a.title.localeCompare(b.title));
      libraryStore.update((s) => ({ ...s, books: merged }));
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

/** Drop a book's user data, position and tier placements (the book entry itself is the caller's). */
async function forgetBook(filePath: string): Promise<void> {
  await resetUserBookData(filePath);
  await removePosition(filePath);
  await removeBookFromAllLists(filePath);
}

/**
 * Combine books (single files, or already-grouped ones) into one book that
 * plays `trackPaths` in order. The group is remembered, so rescans rebuild
 * it. Rating, tags, collections and tier of the first member that has any
 * carry over; listening positions do not, since they were per file.
 * Returns the new book's filePath, or null when there was nothing to combine.
 */
export async function combineBooks(
  memberPaths: string[],
  title: string,
  trackPaths: string[],
  cover: string | null = null,
): Promise<string | null> {
  const state = get(libraryStore);
  const members = state.books.filter((b) => memberPaths.includes(b.filePath) && !b.fileless);
  if (members.length === 0 || trackPaths.length < 2) return null;

  const trackInfo = new Map<string, { title: string; duration: number }>();
  for (const m of members) {
    if (m.tracks.length === 0) trackInfo.set(m.filePath, { title: m.title, duration: m.duration });
    else for (const t of m.tracks) trackInfo.set(t.filePath, { title: t.title, duration: t.duration });
  }

  const group: BookGroup = { id: createId(), title: title.trim() || members[0].title, trackPaths };
  const filePath = manualGroupPath(group.id);
  const tracks: TrackInfo[] = trackPaths.map((fp, i) => ({
    filePath: fp,
    title: trackInfo.get(fp)?.title ?? fileNameNoExt(fp),
    duration: trackInfo.get(fp)?.duration ?? 0,
    order: i,
  }));

  const coverArt =
    cover ??
    members.find((m) => m.coverArt)?.coverArt ??
    (await folderCover(parentDir(trackPaths[0]), state.folders));

  const book: BookMeta = {
    filePath,
    title: group.title,
    author: members.find((m) => m.author && m.author !== "Unknown Author")?.author ?? "Unknown Author",
    album: members.find((m) => m.album)?.album ?? "",
    duration: tracks.reduce((sum, t) => sum + t.duration, 0),
    coverArt,
    chapters: [],
    tracks,
    grouped: "manual",
  };

  // Carry over what the user said about the first member they said anything about
  const userBooks = get(userdataStore).books;
  const donor = members.find((m) => userBooks[m.filePath]);
  if (donor) {
    await setUserBookData(filePath, { ...userBooks[donor.filePath], titleOverride: null });
  }
  for (const list of get(tierListsStore).lists) {
    const tierId = members.map((m) => list.assignments[m.filePath]).find(Boolean);
    if (tierId) await assignBookToTier(list.id, filePath, tierId);
  }

  const gone = new Set(members.map((m) => m.filePath));
  libraryStore.update((s) => ({
    ...s,
    books: [...s.books.filter((b) => !gone.has(b.filePath)), book].sort((a, b) =>
      a.title.localeCompare(b.title),
    ),
    positions: Object.fromEntries(Object.entries(s.positions).filter(([k]) => !gone.has(k))),
    groups: [
      ...(s.groups ?? []).filter((g) => !gone.has(manualGroupPath(g.id))),
      group,
    ],
  }));
  for (const fp of gone) await forgetBook(fp);
  await persistLibrary();
  return filePath;
}

/**
 * Turn a multi-file book back into one entry per file, and remember the
 * choice so the scanner does not fold them together again.
 */
export async function splitBook(filePath: string): Promise<void> {
  const state = get(libraryStore);
  const book = state.books.find((b) => b.filePath === filePath);
  if (!book || book.tracks.length < 2) return;

  const singles: BookMeta[] = [];
  for (const t of book.tracks) {
    try {
      const meta = await extractMetadata(t.filePath);
      singles.push({ ...meta, tracks: [] });
    } catch {
      singles.push({ ...bookMetaFromPath(t.filePath), duration: t.duration, tracks: [] });
    }
  }

  // Every key the scanner could regroup these files under
  const keys = new Set<string>([filePath]);
  for (const s of singles) {
    const dir = parentDir(s.filePath);
    // A plain subfolder book is keyed by its folder; combined/auto books are not
    if (!book.grouped) keys.add(dir);
    if (s.album) keys.add(autoGroupPath(dir, s.album));
    keys.add(autoGroupPath(dir, fileStem(fileNameNoExt(s.filePath))));
  }

  libraryStore.update((s) => ({
    ...s,
    books: [...s.books.filter((b) => b.filePath !== filePath), ...singles].sort((a, b) =>
      a.title.localeCompare(b.title),
    ),
    positions: Object.fromEntries(Object.entries(s.positions).filter(([k]) => k !== filePath)),
    groups: (s.groups ?? []).filter((g) => manualGroupPath(g.id) !== filePath),
    splitKeys: [...new Set([...(s.splitKeys ?? []), ...keys])],
  }));
  await forgetBook(filePath);
  await persistLibrary();
}

/** Forget every split, so the next scan groups those files again. */
export async function clearSplits(): Promise<void> {
  libraryStore.update((s) => ({ ...s, splitKeys: [] }));
  await persistLibrary();
  await rescan();
}

/** Groups restored from an export; ids already present are left alone. */
export async function restoreGroups(groups: BookGroup[]): Promise<number> {
  const have = new Set((get(libraryStore).groups ?? []).map((g) => g.id));
  const fresh = groups.filter(
    (g) =>
      g && typeof g.id === "string" && typeof g.title === "string" &&
      Array.isArray(g.trackPaths) && g.trackPaths.every((p) => typeof p === "string") &&
      !have.has(g.id),
  );
  if (fresh.length === 0) return 0;
  libraryStore.update((s) => ({ ...s, groups: [...(s.groups ?? []), ...fresh] }));
  await persistLibrary();
  return fresh.length;
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
