import { describe, expect, it } from "vitest";
import {
  BUILT_IN_EQ_PRESETS,
  MAX_USER_PRESETS,
  findPreset,
  normalizeEqPresets,
  presetMatches,
  withPreset,
  withoutPreset,
} from "./eqPresets";

describe("built-in presets", () => {
  it("start with Flat and stay within the band range", () => {
    expect(BUILT_IN_EQ_PRESETS[0]).toEqual({ name: "Flat", bass: 0, mid: 0, treble: 0 });
    for (const p of BUILT_IN_EQ_PRESETS) {
      for (const v of [p.bass, p.mid, p.treble]) expect(Math.abs(v)).toBeLessThanOrEqual(12);
    }
  });
});

describe("findPreset / presetMatches", () => {
  it("recognises the bands sitting on a preset, built-ins before user presets", () => {
    const mine = [{ name: "Mine", bass: 0, mid: 0, treble: 0 }];
    expect(findPreset(mine, { bass: 0, mid: 0, treble: 0 })?.name).toBe("Flat");
    expect(findPreset(mine, { bass: -2, mid: 4, treble: 2 })?.name).toBe("Voice Boost");
    expect(findPreset([], { bass: 1, mid: 0, treble: 0 })).toBeNull();
    expect(presetMatches({ bass: 1, mid: 2, treble: 3 }, { bass: 1, mid: 2, treble: 3 })).toBe(true);
  });
});

describe("normalizeEqPresets", () => {
  it("keeps well-formed presets and drops the rest", () => {
    const raw = [
      { name: "  Night  ", bass: 3.4, mid: -20, treble: "x" }, // treble invalid → dropped
      { name: "Night", bass: 3.4, mid: -20, treble: 2 }, // rounded, clamped
      { name: "night", bass: 0, mid: 0, treble: 0 }, // duplicate name → dropped
      { name: "flat", bass: 1, mid: 1, treble: 1 }, // built-in name → dropped
      { name: "", bass: 0, mid: 0, treble: 0 },
      null,
      "junk",
    ];
    expect(normalizeEqPresets(raw)).toEqual([{ name: "Night", bass: 3, mid: -12, treble: 2 }]);
  });

  it("returns nothing for a non-array and caps the count", () => {
    expect(normalizeEqPresets(undefined)).toEqual([]);
    expect(normalizeEqPresets({})).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `P${i}`, bass: 0, mid: 0, treble: 0 }));
    expect(normalizeEqPresets(many)).toHaveLength(MAX_USER_PRESETS);
  });
});

describe("withPreset / withoutPreset", () => {
  it("appends a new name and replaces an existing one case-insensitively", () => {
    const a = withPreset([], { name: "Car", bass: 2, mid: 0, treble: 1 });
    const b = withPreset(a, { name: "car", bass: 5, mid: 0, treble: 0 });
    expect(b).toEqual([{ name: "car", bass: 5, mid: 0, treble: 0 }]);
    expect(withoutPreset(b, "CAR")).toEqual([]);
  });
});
