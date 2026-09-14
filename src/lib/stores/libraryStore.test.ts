import { describe, it, expect } from "vitest";
import { groupFilesByFolder } from "./libraryStore";

const root = "C:\\Audiobooks";

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
