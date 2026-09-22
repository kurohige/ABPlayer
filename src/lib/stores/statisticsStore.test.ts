import { describe, it, expect } from "vitest";
import type { Collection, StatsData } from "../types";
import { getCollectionBreakdown, secsFromSessions } from "./statisticsStore";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const collections: Collection[] = [
  { id: "c1", name: "Fantasy", color: "#aa0000", createdAt: "" },
  { id: "c2", name: "Commute", color: "#00aa00", createdAt: "" },
  { id: "c3", name: "Untouched", color: "#0000aa", createdAt: "" },
];

const userBooks = {
  "a.mp3": { collections: ["c1"] },
  "b.mp3": { collections: ["c1", "c2"] },
  "c.mp3": { collections: [] },
  "d.mp3": { collections: ["c3"] },
};

function stats(partial: Partial<StatsData>): StatsData {
  return {
    totalListeningTimeSecs: 0,
    sessionsLog: [],
    booksFinishedCount: 0,
    longestStreakDays: 0,
    currentStreakDays: 0,
    lastListenedDate: null,
    ...partial,
  };
}

describe("getCollectionBreakdown", () => {
  it("adds up each collection's books, most listened first, and keeps empty ones", () => {
    const rows = getCollectionBreakdown(
      stats({ secsByBook: { "a.mp3": 1000, "b.mp3": 500, "c.mp3": 9000 } }),
      userBooks,
      collections,
    );

    expect(rows.map((r) => [r.name, r.totalSecs, r.books])).toEqual([
      ["Fantasy", 1500, 2],
      ["Commute", 500, 1],
      ["Untouched", 0, 1],
    ]);
  });

  it("counts only the last seven days as this week", () => {
    const rows = getCollectionBreakdown(
      stats({
        secsByBook: { "a.mp3": 5000 },
        sessionsLog: [
          { bookFilePath: "a.mp3", startedAt: daysAgo(1), durationSecs: 600 },
          { bookFilePath: "a.mp3", startedAt: daysAgo(30), durationSecs: 4400 },
        ],
      }),
      userBooks,
      collections,
    );

    expect(rows[0]).toMatchObject({ name: "Fantasy", totalSecs: 5000, weekSecs: 600 });
  });

  it("falls back to the session log when per-book totals were never kept", () => {
    const sessionsLog = [
      { bookFilePath: "b.mp3", startedAt: daysAgo(2), durationSecs: 300 },
      { bookFilePath: "b.mp3", startedAt: daysAgo(3), durationSecs: 200 },
    ];
    expect(secsFromSessions(sessionsLog)).toEqual({ "b.mp3": 500 });

    const rows = getCollectionBreakdown(stats({ sessionsLog }), userBooks, collections);
    expect(rows.find((r) => r.name === "Commute")!.totalSecs).toBe(500);
  });
});
