import { describe, expect, it } from "vitest";
import type { BookMeta, UserBookData } from "../types";
import { groupBySeries, seriesMeta } from "./series";

function book(filePath: string, title: string): BookMeta {
  return {
    filePath,
    title,
    author: "",
    duration: 0,
    coverArt: null,
    tracks: [],
  } as unknown as BookMeta;
}

function ud(partial: Partial<UserBookData>): UserBookData {
  return partial as UserBookData;
}

const titleOf = (b: BookMeta) => b.title;

describe("groupBySeries", () => {
  it("puts a series in reading order and marks the next unread", () => {
    const books = [book("c", "Third"), book("a", "First"), book("b", "Second")];
    const data = {
      a: ud({ series: "Demon Cycle", seriesOrder: 1, status: "finished" }),
      b: ud({ series: "Demon Cycle", seriesOrder: 2, status: "not_started" }),
      c: ud({ series: "Demon Cycle", seriesOrder: 3, status: "not_started" }),
    };

    const [group] = groupBySeries(books, data, titleOf);
    expect(group.series).toBe("Demon Cycle");
    expect(group.books.map((b) => b.filePath)).toEqual(["a", "b", "c"]);
    expect(group.nextUp).toBe("b");
    expect(group.finished).toBe(1);
  });

  it("marks nothing as next when the whole series is finished", () => {
    const books = [book("a", "One"), book("b", "Two")];
    const data = {
      a: ud({ series: "S", seriesOrder: 1, status: "finished" }),
      b: ud({ series: "S", seriesOrder: 2, status: "finished" }),
    };
    expect(groupBySeries(books, data, titleOf)[0].nextUp).toBeNull();
  });

  it("sorts numbered books before unnumbered ones, then by title", () => {
    const books = [book("z", "Zeta"), book("a", "Alpha"), book("n", "Numbered")];
    const data = {
      z: ud({ series: "S" }),
      a: ud({ series: "S" }),
      n: ud({ series: "S", seriesOrder: 4 }),
    };
    expect(groupBySeries(books, data, titleOf)[0].books.map((b) => b.filePath)).toEqual([
      "n",
      "a",
      "z",
    ]);
  });

  it("keeps books with no series in one trailing group", () => {
    const books = [book("a", "In a series"), book("b", "Standalone")];
    const data = { a: ud({ series: "S" }), b: ud({}) };

    const groups = groupBySeries(books, data, titleOf);
    expect(groups).toHaveLength(2);
    expect(groups[1].series).toBeNull();
    expect(groups[1].books.map((b) => b.filePath)).toEqual(["b"]);
    expect(groups[1].nextUp).toBeNull();
  });

  it("treats a blank or whitespace series name as no series", () => {
    const books = [book("a", "A"), book("b", "B")];
    const data = { a: ud({ series: "   " }), b: ud({ series: "" }) };

    const groups = groupBySeries(books, data, titleOf);
    expect(groups).toHaveLength(1);
    expect(groups[0].series).toBeNull();
  });

  it("orders series by name using the natural comparator", () => {
    const books = [book("a", "A"), book("b", "B"), book("c", "C")];
    const data = {
      a: ud({ series: "Series 10" }),
      b: ud({ series: "Series 2" }),
      c: ud({ series: "Series 1" }),
    };
    expect(groupBySeries(books, data, titleOf).map((g) => g.series)).toEqual([
      "Series 1",
      "Series 2",
      "Series 10",
    ]);
  });

  it("returns nothing for an empty library", () => {
    expect(groupBySeries([], {}, titleOf)).toEqual([]);
  });
});

describe("seriesMeta", () => {
  it("counts books, and finished ones only when there are any", () => {
    expect(seriesMeta({ series: "S", books: [1, 2, 3] as never[], finished: 0, nextUp: null })).toBe(
      "3 books",
    );
    expect(seriesMeta({ series: "S", books: [1] as never[], finished: 1, nextUp: null })).toBe(
      "1 book · 1 finished",
    );
  });
});
