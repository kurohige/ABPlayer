import { describe, it, expect } from "vitest";
import { formatTime, formatTimeShort, parseTime } from "./format";

describe("parseTime", () => {
  it("reads the forms the app shows", () => {
    expect(parseTime("1h 23m 45s")).toBe(5025);
    expect(parseTime("1:23:45")).toBe(5025);
    expect(parseTime("23:45")).toBe(1425);
    expect(parseTime(formatTime(5025))).toBe(5025);
    expect(parseTime(formatTimeShort(5025))).toBe(5025);
  });

  it("reads single units without splitting their digits", () => {
    expect(parseTime("30s")).toBe(30);
    expect(parseTime("45m")).toBe(2700);
    expect(parseTime("2h")).toBe(7200);
    expect(parseTime(" 2H 5M ")).toBe(7500);
  });

  it("lets later units be left off", () => {
    expect(parseTime("1h23")).toBe(4980);
    expect(parseTime("5m30")).toBe(330);
    expect(parseTime("12 30")).toBe(750);
  });

  it("takes a bare number as minutes", () => {
    expect(parseTime("90")).toBe(5400);
    expect(parseTime("1.5")).toBe(90);
  });

  it("allows only the leading colon part past 59", () => {
    expect(parseTime("90:00")).toBe(5400);
    expect(parseTime("1:75")).toBeNull();
  });

  it("refuses what it cannot read", () => {
    for (const bad of ["", "  ", "abc", "1:2:3:4", "5s 2m", "1h 2h", "12x", "-5", "1:", "3s 4"]) {
      expect(parseTime(bad), bad).toBeNull();
    }
  });
});
