import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { BookMeta, UserPreferences } from "../types";
import { resetStores, makeStore } from "../../test/memoryStore";
import {
  userdataStore,
  loadUserData,
  normalizeUserBookData,
  sortAndFilterBooks,
  createCollection,
  setUserBookData,
  exportLibrary,
  importLibrary,
  normalizeAudioSettings,
  DEFAULT_AUDIO_SETTINGS,
} from "./userdataStore";
import { tierListsStore, loadTierLists, createTierList, assignBookToTier } from "./tierListStore";
import { libraryStore, addFilelessBook } from "./libraryStore";

function book(filePath: string, title: string, author = "Author"): BookMeta {
  return {
    filePath,
    title,
    author,
    album: "",
    duration: 0,
    coverArt: null,
    chapters: [],
    tracks: [],
  };
}

function emptyLibrary(): void {
  libraryStore.set({ books: [], folders: [], scanning: false, enriching: false, positions: {} });
}

describe("normalizeUserBookData", () => {
  it("back-fills every field from defaults when given nothing", () => {
    const d = normalizeUserBookData(undefined);

    expect(d.status).toBe("not_started");
    expect(d.collections).toEqual([]);
    expect(d.quotes).toEqual([]);
    expect(d.tags).toEqual([]);
    expect(d.axes).toEqual({});
    expect(d.axisLabels).toBeNull();
    expect(d.source).toBeNull();
  });

  it("keeps valid persisted fields and replaces wrong-typed ones", () => {
    const d = normalizeUserBookData({
      status: "finished",
      notes: "great",
      collections: ["c1"],
      quotes: "not-an-array" as unknown as string[],
      axes: [1, 2] as unknown as Record<string, number>,
    });

    expect(d.status).toBe("finished");
    expect(d.notes).toBe("great");
    expect(d.collections).toEqual(["c1"]);
    expect(d.quotes).toEqual([]);
    expect(d.axes).toEqual({});
  });
});

describe("sortAndFilterBooks", () => {
  const a = book("a", "Zeta", "Ann");
  const b = book("b", "Alpha", "Bob");
  const c = book("c", "Mid", "Cat");
  const userData = {
    a: { ...normalizeUserBookData(undefined), status: "finished" as const, collections: ["col"] },
    b: { ...normalizeUserBookData(undefined), status: "in_progress" as const, series: "Saga", seriesOrder: 2 },
    c: { ...normalizeUserBookData(undefined), series: "Saga", seriesOrder: 1, titleOverride: "AAA first" },
  };
  let prefs: UserPreferences;

  beforeEach(async () => {
    resetStores();
    await loadUserData();
    prefs = get(userdataStore).preferences;
  });

  it("filters by status", () => {
    const out = sortAndFilterBooks([a, b, c], userData, {}, { ...prefs, filterStatus: "finished" });
    expect(out.map((x) => x.filePath)).toEqual(["a"]);
  });

  it("filters by collection", () => {
    const out = sortAndFilterBooks([a, b, c], userData, {}, { ...prefs, filterCollection: "col" });
    expect(out.map((x) => x.filePath)).toEqual(["a"]);
  });

  it("sorts by title using the override when present", () => {
    const out = sortAndFilterBooks([a, b, c], userData, {}, { ...prefs, sortBy: "title" });
    expect(out.map((x) => x.filePath)).toEqual(["c", "b", "a"]);
  });

  it("sorts by series then series order, series-less books last", () => {
    const out = sortAndFilterBooks([a, b, c], userData, {}, { ...prefs, sortBy: "series" });
    expect(out.map((x) => x.filePath)).toEqual(["c", "b", "a"]);
  });
});

describe("export → import round trip", () => {
  const real = "C:\\Audiobooks\\Dune.m4b";

  beforeEach(async () => {
    resetStores();
    await loadUserData();
    await loadTierLists();
    emptyLibrary();
  });

  async function seedAndExport(): Promise<{ exported: string; paperPath: string; tierId: string }> {
    const colId = await createCollection("Fantasy", "#123456");
    await setUserBookData(real, { status: "finished", notes: "spice", collections: [colId] });

    const listId = await createTierList("All-time", { description: "best of", scope: "finished" });
    const tierId = get(tierListsStore).lists[0].tiers[0].id;
    await assignBookToTier(listId, real, tierId);

    const paperPath = await addFilelessBook({ title: "Paper Book", author: "Someone" });
    await assignBookToTier(listId, paperPath, tierId);

    let exported = "";
    vi.mocked(save).mockResolvedValueOnce("C:\\export.json");
    vi.mocked(writeTextFile).mockImplementationOnce(async (_path, contents) => {
      exported = contents as string;
    });
    await exportLibrary(
      [book(real, "Dune"), ...get(libraryStore).books],
      async () => null,
      get(tierListsStore).lists,
    );

    expect(exported).not.toBe("");
    return { exported, paperPath, tierId };
  }

  async function freshInstall(): Promise<void> {
    resetStores();
    await loadUserData();
    await loadTierLists();
    emptyLibrary();
  }

  async function importFrom(exported: string) {
    vi.mocked(open).mockResolvedValueOnce("C:\\export.json");
    vi.mocked(readFile).mockResolvedValueOnce(new TextEncoder().encode(exported));
    return importLibrary(async () => {});
  }

  it("writes tier lists into the export (format v2)", async () => {
    const { exported } = await seedAndExport();
    const parsed = JSON.parse(exported);

    expect(parsed.version).toBe(2);
    expect(parsed.tierLists).toHaveLength(1);
    expect(Object.keys(parsed.books)).toHaveLength(2);
  });

  it("restores tier lists, their assignments, and fileless books on a fresh install", async () => {
    const { exported, paperPath, tierId } = await seedAndExport();
    await freshInstall();
    expect(get(tierListsStore).lists).toHaveLength(0);
    expect(get(libraryStore).books).toHaveLength(0);

    const result = await importFrom(exported);

    expect(result).toEqual({ imported: 2, skipped: 0, tierListsImported: 1, filelessRestored: 1 });

    const list = get(tierListsStore).lists[0];
    expect(list.name).toBe("All-time");
    expect(list.description).toBe("best of");
    expect(list.scope).toBe("finished");
    expect(list.assignments[real]).toBe(tierId);
    expect(list.assignments[paperPath]).toBe(tierId);
    expect(get(userdataStore).preferences.defaultTierListId).toBe(list.id);

    const restored = get(libraryStore).books.find((b) => b.filePath === paperPath);
    expect(restored?.fileless).toBe(true);
    expect(restored?.title).toBe("Paper Book");

    const ud = get(userdataStore).books[real];
    expect(ud.status).toBe("finished");
    expect(ud.notes).toBe("spice");
    const fantasy = get(userdataStore).collections.find((c) => c.name === "Fantasy");
    expect(ud.collections).toEqual([fantasy!.id]);
  });

  it("does not merge into an existing tier list with the same name", async () => {
    const { exported } = await seedAndExport();
    await freshInstall();
    await createTierList("All-time");
    const before = get(tierListsStore).lists[0];

    const result = await importFrom(exported);

    expect(result.tierListsImported).toBe(0);
    expect(get(tierListsStore).lists).toHaveLength(1);
    expect(get(tierListsStore).lists[0].assignments).toEqual(before.assignments);
  });

  it("drops assignments whose tier id is not on the imported list", async () => {
    const { exported, tierId } = await seedAndExport();
    const tampered = JSON.parse(exported);
    tampered.tierLists[0].assignments["C:\\nowhere.mp3"] = tierId;
    tampered.tierLists[0].assignments[real] = "no-such-tier";
    await freshInstall();

    await importFrom(JSON.stringify(tampered));

    const list = get(tierListsStore).lists[0];
    expect(list.assignments["C:\\nowhere.mp3"]).toBeUndefined();
    expect(list.assignments[real]).toBeUndefined();
  });
});

describe("remembered audio settings", () => {
  it("normalizes missing, wrong-typed and out-of-range values", () => {
    expect(normalizeAudioSettings(undefined)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(normalizeAudioSettings("nope")).toEqual(DEFAULT_AUDIO_SETTINGS);

    const n = normalizeAudioSettings({
      speed: 9,
      volume: -1,
      muted: "yes",
      eqBass: "3",
      eqMid: 40,
      eqTreble: -2.5,
    });
    expect(n).toEqual({ speed: 3, volume: 0, muted: false, eqBass: 0, eqMid: 12, eqTreble: -2.5 });
  });

  it("loads a partial persisted audio object merged with defaults", async () => {
    resetStores();
    await makeStore("userdata.json").set("preferences", {
      theme: "light",
      audio: { speed: 1.5, eqBass: 3, muted: true },
    });

    await loadUserData();

    const prefs = get(userdataStore).preferences;
    expect(prefs.theme).toBe("light");
    expect(prefs.audio).toEqual({ ...DEFAULT_AUDIO_SETTINGS, speed: 1.5, eqBass: 3, muted: true });
  });

  it("falls back to defaults for stores written before the feature existed", async () => {
    resetStores();
    await makeStore("userdata.json").set("preferences", { theme: "dark", sortBy: "author" });

    await loadUserData();

    expect(get(userdataStore).preferences.audio).toEqual(DEFAULT_AUDIO_SETTINGS);
  });
});
