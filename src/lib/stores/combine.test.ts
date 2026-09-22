import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";
import type { BookMeta } from "../types";
import { resetStores } from "../../test/memoryStore";

vi.mock("../utils/metadata", async (orig) => {
  const real = await orig<typeof import("../utils/metadata")>();
  return {
    ...real,
    // Tags come from Rust; here every file reports the album its name starts with
    extractMetadata: vi.fn(async (filePath: string) => ({
      ...real.bookMetaFromPath(filePath),
      album: (filePath.split("\\").pop() ?? "").startsWith("Dune") ? "Dune" : "",
      duration: 30,
      tracks: [],
    })),
  };
});

import {
  libraryStore,
  combineBooks,
  splitBook,
  removeBook,
  removeFolder,
  addFolderPaths,
  groupFilesByFolder,
} from "./libraryStore";
import {
  userdataStore,
  loadUserData,
  setUserBookData,
  addBooksToCollection,
  addTagToBooks,
  removeTagFromBooks,
  setBooksStatus,
} from "./userdataStore";
import { tierListsStore, loadTierLists, createTierList, assignBookToTier, assignBooksToTier } from "./tierListStore";

const root = "C:\\Audiobooks";
const f1 = `${root}\\Dune 01.mp3`;
const f2 = `${root}\\Dune 02.mp3`;
const f3 = `${root}\\Other.mp3`;

function single(filePath: string, duration = 30): BookMeta {
  return {
    filePath,
    title: (filePath.split("\\").pop() ?? filePath).replace(/\.[^.]+$/, ""),
    author: "Unknown Author",
    album: "",
    duration,
    coverArt: null,
    chapters: [],
    tracks: [],
  };
}

beforeEach(async () => {
  resetStores();
  libraryStore.set({
    books: [single(f1, 60), single(f2, 40), single(f3)],
    folders: [root],
    scanning: false,
    enriching: false,
    positions: {},
  });
  await loadUserData();
  await loadTierLists();
});

describe("combineBooks", () => {
  it("replaces the members with one book that plays the files in the given order", async () => {
    const key = await combineBooks([f1, f2], "Dune", [f2, f1]);

    const books = get(libraryStore).books;
    expect(books.map((b) => b.filePath).sort()).toEqual([key, f3].sort());
    const dune = books.find((b) => b.filePath === key)!;
    expect(dune.title).toBe("Dune");
    expect(dune.grouped).toBe("manual");
    expect(dune.duration).toBe(100);
    expect(dune.tracks.map((t) => t.filePath)).toEqual([f2, f1]);
    expect(dune.tracks.map((t) => t.duration)).toEqual([40, 60]);
  });

  it("remembers the group, so a rescan rebuilds the same book", async () => {
    const key = await combineBooks([f1, f3], "Mixed", [f1, f3]);

    const rescanned = groupFilesByFolder([f1, f2, f3], [root], {
      groups: get(libraryStore).groups,
    });

    expect(rescanned.find((b) => b.filePath === key)!.tracks.map((t) => t.filePath)).toEqual([f1, f3]);
    expect(rescanned.find((b) => b.filePath === f2)).toBeTruthy();
  });

  it("carries tags and tier over from a member and drops the members' own data", async () => {
    await setUserBookData(f2, { tags: ["scifi"], status: "finished" });
    const listId = await createTierList("All time");
    const tierId = get(tierListsStore).lists[0].tiers[0].id;
    await assignBookToTier(listId, f2, tierId);

    const key = (await combineBooks([f1, f2], "Dune", [f1, f2]))!;

    const user = get(userdataStore).books;
    expect(user[key].tags).toEqual(["scifi"]);
    expect(user[key].status).toBe("finished");
    expect(user[f2]).toBeUndefined();
    const assignments = get(tierListsStore).lists[0].assignments;
    expect(assignments[key]).toBe(tierId);
    expect(assignments[f2]).toBeUndefined();
  });

  it("refuses fewer than two files", async () => {
    expect(await combineBooks([f1], "Solo", [f1])).toBeNull();
    expect(get(libraryStore).books).toHaveLength(3);
  });

  it("removing a combined book forgets the group", async () => {
    const key = (await combineBooks([f1, f2], "Dune", [f1, f2]))!;
    await removeBook(key);
    expect(get(libraryStore).groups).toEqual([]);
  });
});

describe("removed books stay removed", () => {
  it("keeps a removed file out of the next scan", async () => {
    await removeBook(f3);

    const state = get(libraryStore);
    expect(state.hidden).toEqual([f3]);
    const rescanned = groupFilesByFolder([f1, f2, f3], [root], { hidden: state.hidden });
    expect(rescanned.flatMap((b) => [b.filePath, ...b.tracks.map((t) => t.filePath)])).not.toContain(f3);
  });

  it("hides every file of a combined book, so they do not return as loose files", async () => {
    const key = (await combineBooks([f1, f2], "Dune", [f1, f2]))!;
    await removeBook(key);

    const state = get(libraryStore);
    expect([...(state.hidden ?? [])].sort()).toEqual([f1, f2].sort());
    const rescanned = groupFilesByFolder([f1, f2, f3], [root], {
      groups: state.groups,
      hidden: state.hidden,
    });
    expect(rescanned.map((b) => b.filePath)).toEqual([f3]);
  });

  it("hides a subfolder book by its folder, including files added to it later", async () => {
    const dir = `${root}\\Hobbit`;
    const tracks = [`${dir}\\1.mp3`, `${dir}\\2.mp3`];
    const hobbit = groupFilesByFolder(tracks, [root])[0];
    libraryStore.update((s) => ({ ...s, books: [...s.books, hobbit] }));

    await removeBook(dir);

    const hidden = get(libraryStore).hidden;
    expect(hidden).toEqual([dir]);
    const rescanned = groupFilesByFolder([...tracks, `${dir}\\3.mp3`, f3], [root], { hidden });
    expect(rescanned.map((b) => b.filePath)).toEqual([f3]);
  });

  it("forgets what was removed under a folder once that folder leaves the library", async () => {
    await removeBook(f3);
    await removeFolder(root);
    expect(get(libraryStore).hidden).toEqual([]);
  });

  it("brings removed books back when their folder is added again", async () => {
    const other = "D:\\More";
    libraryStore.update((s) => ({ ...s, hidden: [`${other}\\x.mp3`, f3] }));

    await addFolderPaths([other]);

    expect(get(libraryStore).hidden).toEqual([f3]);
    expect(get(libraryStore).folders).toEqual([root, other]);
  });
});

describe("splitBook", () => {
  it("turns a combined book back into files and keeps the scanner from regrouping them", async () => {
    const key = (await combineBooks([f1, f2], "Dune", [f1, f2]))!;

    await splitBook(key);

    const state = get(libraryStore);
    expect(state.books.map((b) => b.filePath).sort()).toEqual([f1, f2, f3].sort());
    expect(state.groups).toEqual([]);

    // Both the file-name rule and the album rule would otherwise fold them again
    const albums = new Map([[f1, "Dune"], [f2, "Dune"]]);
    const rescanned = groupFilesByFolder([f1, f2, f3], [root], {
      albums,
      splitKeys: state.splitKeys,
    });
    expect(rescanned.every((b) => b.tracks.length === 0)).toBe(true);
  });

  it("splits a subfolder book by remembering the folder", async () => {
    const dir = `${root}\\Hobbit`;
    const tracks = [`${dir}\\1.mp3`, `${dir}\\2.mp3`];
    const hobbit = groupFilesByFolder(tracks, [root])[0];
    libraryStore.update((s) => ({ ...s, books: [hobbit] }));

    await splitBook(dir);

    const state = get(libraryStore);
    expect(state.splitKeys).toContain(dir);
    expect(state.books.map((b) => b.filePath).sort()).toEqual(tracks);
    expect(groupFilesByFolder(tracks, [root], { splitKeys: state.splitKeys })).toHaveLength(2);
  });
});

describe("bulk edits", () => {
  it("adds many books to a collection without duplicating it", async () => {
    await setUserBookData(f1, { collections: ["c1"] });
    await addBooksToCollection([f1, f2], "c1");

    const user = get(userdataStore).books;
    expect(user[f1].collections).toEqual(["c1"]);
    expect(user[f2].collections).toEqual(["c1"]);
  });

  it("adds and removes a tag case-insensitively", async () => {
    await setUserBookData(f1, { tags: ["SciFi"] });
    await addTagToBooks([f1, f2], "scifi");

    expect(get(userdataStore).books[f1].tags).toEqual(["SciFi"]);
    expect(get(userdataStore).books[f2].tags).toEqual(["scifi"]);

    await removeTagFromBooks([f1, f2], "SCIFI");
    expect(get(userdataStore).books[f1].tags).toEqual([]);
    expect(get(userdataStore).books[f2].tags).toEqual([]);
  });

  it("stamps a finish date only when finishing", async () => {
    await setBooksStatus([f1], "finished");
    expect(get(userdataStore).books[f1].dateFinished).toBeTruthy();

    await setBooksStatus([f1], "in_progress");
    expect(get(userdataStore).books[f1].dateFinished).toBeNull();
  });

  it("places many books on a tier, and back in the pool", async () => {
    const listId = await createTierList("All time");
    const tierId = get(tierListsStore).lists[0].tiers[0].id;

    await assignBooksToTier(listId, [f1, f2], tierId);
    expect(get(tierListsStore).lists[0].assignments).toEqual({ [f1]: tierId, [f2]: tierId });

    await assignBooksToTier(listId, [f1], null);
    expect(get(tierListsStore).lists[0].assignments).toEqual({ [f2]: tierId });
  });
});
