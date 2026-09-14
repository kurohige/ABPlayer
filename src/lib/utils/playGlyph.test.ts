import { describe, expect, it } from "vitest";
import {
  PAUSE_PTS,
  PLAY_PTS,
  easeInOutCubic,
  playGlyphPath,
} from "./playGlyph";

describe("playGlyphPath", () => {
  it("both glyphs have the same number of points, or they cannot interpolate", () => {
    expect(PLAY_PTS).toHaveLength(PAUSE_PTS.length);
    expect(PAUSE_PTS).toHaveLength(8);
  });

  it("renders two closed 4-point subpaths", () => {
    const d = playGlyphPath(0.5);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/Z/g)).toHaveLength(2);
    expect(d.match(/ L/g)).toHaveLength(6);
  });

  it("lands exactly on the play glyph at 0", () => {
    expect(playGlyphPath(0)).toBe(
      "M7.00 5.00 L13.00 8.50 L13.00 15.50 L7.00 19.00 Z " +
        "M13.00 8.50 L19.00 12.00 L19.00 12.00 L13.00 15.50 Z",
    );
  });

  it("lands exactly on the pause glyph at 1", () => {
    expect(playGlyphPath(1)).toBe(
      "M7.00 5.00 L10.00 5.00 L10.00 19.00 L7.00 19.00 Z " +
        "M14.00 5.00 L17.00 5.00 L17.00 19.00 L14.00 19.00 Z",
    );
  });

  it("clamps out-of-range positions to the endpoints", () => {
    expect(playGlyphPath(-0.5)).toBe(playGlyphPath(0));
    expect(playGlyphPath(1.5)).toBe(playGlyphPath(1));
  });

  it("resolves a non-finite position to the play glyph instead of a broken path", () => {
    expect(playGlyphPath(Number.NaN)).toBe(playGlyphPath(0));
    expect(playGlyphPath(Number.POSITIVE_INFINITY)).toBe(playGlyphPath(0));
    expect(playGlyphPath(Number.NaN)).not.toContain("NaN");
  });

  it("moves monotonically from play to pause", () => {
    // "M7.00 5.00 L13.00 8.50 …" — token 2 is the second point's x.
    const at = (m: number) => Number(playGlyphPath(m).split(" ")[2].replace("L", ""));
    // The second point's x travels 13 → 10 as the triangle squares off.
    const seq = [0, 0.25, 0.5, 0.75, 1].map(at);
    expect(seq[0]).toBeCloseTo(13);
    expect(seq[4]).toBeCloseTo(10);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeLessThan(seq[i - 1]);
  });
});

describe("easeInOutCubic", () => {
  it("pins both ends", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("passes through the midpoint", () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 5);
  });

  it("clamps beyond the range", () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
    expect(easeInOutCubic(Number.NaN)).toBe(0);
  });

  it("is monotonic", () => {
    let prev = -1;
    for (let k = 0; k <= 1.0001; k += 0.05) {
      const v = easeInOutCubic(k);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});
