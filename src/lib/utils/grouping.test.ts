import { describe, it, expect } from "vitest";
import { fileStem, groupLooseFiles, pickFolderCover, titleFromLabel, type LooseFile } from "./grouping";

function f(name: string, album = ""): LooseFile {
  return { path: `D:\\Books\\${name}.mp3`, name, album };
}

describe("fileStem", () => {
  it("drops numbering and numbering words", () => {
    expect(fileStem("My Book - 03")).toBe("my book");
    expect(fileStem("My Book 12")).toBe("my book");
    expect(fileStem("My_Book_Part_2")).toBe("my book");
    expect(fileStem("Chapter 7")).toBe("");
    expect(fileStem("04")).toBe("");
  });
});

describe("groupLooseFiles", () => {
  it("groups files that share an album and leaves lone albums single", () => {
    const { groups, singles } = groupLooseFiles([
      f("a2", "Dune"),
      f("a1", "Dune"),
      f("b1", "Emma"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Dune");
    expect(groups[0].files.map((x) => x.name)).toEqual(["a1", "a2"]);
    expect(singles.map((x) => x.name)).toEqual(["b1"]);
  });

  it("matches albums case-insensitively", () => {
    const { groups } = groupLooseFiles([f("1", "dune"), f("2", "Dune ")]);
    expect(groups).toHaveLength(1);
  });

  it("groups untagged numbered files by stem, in natural order", () => {
    const { groups, singles } = groupLooseFiles([
      f("Emma - 10"),
      f("Emma - 2"),
      f("Dune 01"),
      f("Dune 02"),
      f("Introduction"),
    ]);

    expect(groups.map((g) => g.label).sort()).toEqual(["dune", "emma"]);
    expect(groups.find((g) => g.label === "emma")!.files.map((x) => x.name)).toEqual([
      "Emma - 2",
      "Emma - 10",
    ]);
    expect(singles.map((x) => x.name)).toEqual(["Introduction"]);
  });

  it("treats bare chapter numbering as one book", () => {
    const { groups } = groupLooseFiles([f("Chapter 1"), f("Chapter 2"), f("Chapter 10")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("");
    expect(groups[0].files.map((x) => x.name)).toEqual(["Chapter 1", "Chapter 2", "Chapter 10"]);
  });

  it("never groups unnumbered, untagged files", () => {
    const { groups, singles } = groupLooseFiles([f("Dune"), f("Emma")]);
    expect(groups).toHaveLength(0);
    expect(singles).toHaveLength(2);
  });
});

describe("pickFolderCover", () => {
  it("prefers a conventionally named image", () => {
    expect(pickFolderCover(["back.jpg", "Cover.JPG", "01.mp3"])).toBe("Cover.JPG");
    expect(pickFolderCover(["scan.png", "folder.png"])).toBe("folder.png");
    expect(pickFolderCover(["my-book-cover.jpg", "other.jpg"])).toBe("my-book-cover.jpg");
  });

  it("takes the only image, but not one of several unnamed ones", () => {
    expect(pickFolderCover(["art.png", "01.mp3"])).toBe("art.png");
    expect(pickFolderCover(["a.png", "b.png"])).toBeNull();
    expect(pickFolderCover(["01.mp3", "notes.txt"])).toBeNull();
  });
});

describe("titleFromLabel", () => {
  it("title-cases a stem", () => {
    expect(titleFromLabel("the long way")).toBe("The Long Way");
  });
});
