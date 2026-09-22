import { describe, it, expect } from "vitest";
import type { BookMeta } from "../types";
import { groupFilesByFolder, mergeRegrouped } from "./libraryStore";

const root = "C:\\Audiobooks";

function single(filePath: string): BookMeta {
  const title = (filePath.split("\\").pop() ?? filePath).replace(/\.[^.]+$/, "");
  return {
    filePath,
    title,
    author: "Unknown Author",
    album: "",
    duration: 0,
    coverArt: null,
    chapters: [],
    tracks: [],
  };
}

describe("groupFilesByFolder", () => {
  it("treats .m4b as a standalone book even when it shares a folder", () => {
    const files = [`${root}\\Dune\\Dune.m4b`, `${root}\\Dune\\bonus.mp3`];
    const books = groupFilesByFolder(files, [root]);

    expect(books.map((b) => b.filePath).sort()).toEqual([...files].sort());
    expect(books.every((b) => b.tracks.length === 0)).toBe(true);
  });

  it("groups 2+ non-m4b files in a subfolder into one multi-track book, naturally sorted", () => {
    const files = [
      `${root}\\Hobbit\\Track 10.mp3`,
      `${root}\\Hobbit\\Track 2.mp3`,
      `${root}\\Hobbit\\Track 1.mp3`,
    ];
    const books = groupFilesByFolder(files, [root]);

    expect(books).toHaveLength(1);
    expect(books[0].filePath).toBe(`${root}\\Hobbit`);
    expect(books[0].title).toBe("Hobbit");
    expect(books[0].tracks.map((t) => t.title)).toEqual(["Track 1", "Track 2", "Track 10"]);
    expect(books[0].tracks.map((t) => t.order)).toEqual([0, 1, 2]);
  });

  it("keeps loose files directly inside a scanned root as individual books", () => {
    const books = groupFilesByFolder([`${root}\\a.mp3`, `${root}\\b.mp3`], [root]);

    expect(books).toHaveLength(2);
    expect(books.every((b) => b.tracks.length === 0)).toBe(true);
  });

  it("tolerates a trailing separator on the scanned root", () => {
    const books = groupFilesByFolder([`${root}\\a.mp3`, `${root}\\b.mp3`], [`${root}\\`]);
    expect(books).toHaveLength(2);
  });

  it("makes a single non-m4b file in a subfolder a single-file book keyed by the file path", () => {
    const books = groupFilesByFolder([`${root}\\Solo\\only.mp3`], [root]);

    expect(books).toHaveLength(1);
    expect(books[0].filePath).toBe(`${root}\\Solo\\only.mp3`);
    expect(books[0].title).toBe("only");
    expect(books[0].tracks).toEqual([]);
  });
});

describe("groupFilesByFolder — loose chapter files", () => {
  it("folds numbered files in a root into one book per shared name", () => {
    const files = [
      `${root}\\Dune 02.mp3`,
      `${root}\\Dune 01.mp3`,
      `${root}\\Emma - 1.mp3`,
      `${root}\\Emma - 2.mp3`,
      `${root}\\Standalone.mp3`,
    ];
    const books = groupFilesByFolder(files, [root]);

    const dune = books.find((b) => b.title === "Dune")!;
    expect(dune.grouped).toBe("auto");
    expect(dune.filePath.startsWith("group:auto:")).toBe(true);
    expect(dune.tracks.map((t) => t.title)).toEqual(["Dune 01", "Dune 02"]);
    expect(books.find((b) => b.title === "Emma")!.tracks).toHaveLength(2);
    expect(books.find((b) => b.title === "Standalone")!.tracks).toEqual([]);
    expect(books).toHaveLength(3);
  });

  it("names a root of bare chapter numbers after the folder", () => {
    const books = groupFilesByFolder([`${root}\\Chapter 1.mp3`, `${root}\\Chapter 2.mp3`], [root]);

    expect(books).toHaveLength(1);
    expect(books[0].title).toBe("Audiobooks");
  });

  it("prefers a known album tag over the file name", () => {
    const files = [`${root}\\a1.mp3`, `${root}\\b7.mp3`, `${root}\\c3.mp3`];
    const albums = new Map([
      [files[0], "Dune"],
      [files[1], "Dune"],
      [files[2], "Emma"],
    ]);
    const books = groupFilesByFolder(files, [root], { albums });

    expect(books.find((b) => b.title === "Dune")!.tracks.map((t) => t.filePath)).toEqual([
      files[0],
      files[1],
    ]);
    expect(books.find((b) => b.filePath === files[2])).toBeTruthy();
  });

  it("gives the same key on every scan, so positions and ratings stay attached", () => {
    const files = [`${root}\\Dune 01.mp3`, `${root}\\Dune 02.mp3`];
    const a = groupFilesByFolder(files, [root])[0].filePath;
    const b = groupFilesByFolder([...files].reverse(), [root])[0].filePath;
    expect(a).toBe(b);
  });

  it("leaves files separate when grouping is switched off", () => {
    const files = [`${root}\\Dune 01.mp3`, `${root}\\Dune 02.mp3`];
    const books = groupFilesByFolder(files, [root], { autoGroup: false });
    expect(books.map((b) => b.filePath).sort()).toEqual(files);
  });

  it("respects a split: an auto group and a subfolder both stay as files", () => {
    const loose = [`${root}\\Dune 01.mp3`, `${root}\\Dune 02.mp3`];
    const sub = [`${root}\\Hobbit\\1.mp3`, `${root}\\Hobbit\\2.mp3`];
    const autoKey = groupFilesByFolder(loose, [root])[0].filePath;

    const books = groupFilesByFolder([...loose, ...sub], [root], {
      splitKeys: [autoKey, `${root}\\Hobbit`],
    });

    expect(books).toHaveLength(4);
    expect(books.every((b) => b.tracks.length === 0)).toBe(true);
  });
});

describe("groupFilesByFolder — books combined by hand", () => {
  const files = [`${root}\\x.mp3`, `${root}\\y.mp3`, `${root}\\Dune\\Dune.m4b`];

  it("claims its files first, in the saved order, even an .m4b", () => {
    const books = groupFilesByFolder(files, [root], {
      groups: [{ id: "g1", title: "My Book", trackPaths: [files[2], files[0]] }],
    });

    const combined = books.find((b) => b.filePath === "group:g1")!;
    expect(combined.title).toBe("My Book");
    expect(combined.grouped).toBe("manual");
    expect(combined.tracks.map((t) => t.filePath)).toEqual([files[2], files[0]]);
    expect(books.map((b) => b.filePath).sort()).toEqual(["group:g1", files[1]].sort());
  });

  it("drops a missing track but keeps the book; no files at all means no book", () => {
    const groups = [{ id: "g1", title: "My Book", trackPaths: [files[0], `${root}\\gone.mp3`] }];

    const some = groupFilesByFolder(files, [root], { groups });
    expect(some.find((b) => b.filePath === "group:g1")!.tracks).toHaveLength(1);

    const none = groupFilesByFolder([files[1]], [root], { groups });
    expect(none.find((b) => b.filePath === "group:g1")).toBeUndefined();
  });
});

describe("mergeRegrouped", () => {
  it("builds a newly found group from the single entries it replaces", () => {
    const a = { ...single(`${root}\\a1.mp3`), author: "Herbert", album: "Dune", duration: 60, coverArt: "c.jpg" };
    const b = { ...single(`${root}\\b7.mp3`), author: "Herbert", album: "Dune", duration: 40 };
    const keep = single(`${root}\\other.mp3`);
    const albums = new Map([[a.filePath, "Dune"], [b.filePath, "Dune"]]);
    const regrouped = groupFilesByFolder([a.filePath, b.filePath, keep.filePath], [root], { albums });

    const merged = mergeRegrouped([a, b, keep], regrouped);

    const dune = merged.find((m) => m.tracks.length > 0)!;
    expect(dune.author).toBe("Herbert");
    expect(dune.duration).toBe(100);
    expect(dune.coverArt).toBe("c.jpg");
    expect(dune.tracks.map((t) => t.duration)).toEqual([60, 40]);
    expect(merged).toContain(keep);
    expect(merged).toHaveLength(2);
  });
});
