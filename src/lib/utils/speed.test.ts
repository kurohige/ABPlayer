import { describe, expect, it } from "vitest";
import { SPEEDS, formatSpeed, speedOptions } from "./speed";

describe("formatSpeed", () => {
  it("writes the speed the way the tile shows it", () => {
    expect(formatSpeed(1)).toBe("1×");
    expect(formatSpeed(1.25)).toBe("1.25×");
  });
});

describe("speedOptions", () => {
  it("returns the presets when the current speed is one of them", () => {
    expect(speedOptions(1.5)).toEqual(SPEEDS);
  });

  it("slots an off-ladder speed into place so it can be checked", () => {
    expect(speedOptions(1.1)).toEqual([0.75, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]);
  });

  it("ignores a nonsensical speed rather than listing it", () => {
    expect(speedOptions(0)).toEqual(SPEEDS);
    expect(speedOptions(-1)).toEqual(SPEEDS);
    expect(speedOptions(Number.NaN)).toEqual(SPEEDS);
  });

  it("never mutates the preset list", () => {
    speedOptions(1.1);
    expect(SPEEDS).toEqual([0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]);
  });
});
