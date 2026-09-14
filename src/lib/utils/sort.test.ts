import { describe, it, expect } from "vitest";
import { naturalCompare } from "./sort";

describe("naturalCompare", () => {
  it("orders embedded numbers numerically, not lexically", () => {
    const names = ["Track 10.mp3", "Track 2.mp3", "Track 1.mp3"];
    expect([...names].sort(naturalCompare)).toEqual([
      "Track 1.mp3",
      "Track 2.mp3",
      "Track 10.mp3",
    ]);
  });

  it("is case-insensitive on the text runs", () => {
    expect(naturalCompare("chapter 1", "Chapter 1")).toBe(0);
  });

  it("falls back to text comparison when one side has no number", () => {
    expect(naturalCompare("Intro", "Chapter 1")).toBeGreaterThan(0);
    expect(naturalCompare("Chapter 1", "Intro")).toBeLessThan(0);
  });
});
