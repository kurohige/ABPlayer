// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PENDING_TTL_MS, claimFlight, clearFlight, startFlight } from "./coverFlight";
import { motionReduced } from "./motion";

function stubEl(rect: Partial<DOMRect>): Element {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({ top: 0, left: 0, width: 100, height: 100, ...rect }) as DOMRect;
  return el;
}

beforeEach(() => {
  clearFlight();
  document.documentElement.removeAttribute("data-reduce-motion");
});

afterEach(() => {
  clearFlight();
});

describe("flight hand-off", () => {
  it("hands the source rect to the matching destination", () => {
    startFlight(stubEl({ top: 40, left: 20, width: 108, height: 108 }), "cover.png", "a.m4b");
    const claimed = claimFlight("a.m4b");
    expect(claimed).not.toBeNull();
    expect(claimed?.rect).toEqual({ top: 40, left: 20, width: 108, height: 108 });
    expect(claimed?.src).toBe("cover.png");
  });

  it("is claimable only once", () => {
    startFlight(stubEl({}), null, "a.m4b");
    expect(claimFlight("a.m4b")).not.toBeNull();
    expect(claimFlight("a.m4b")).toBeNull();
  });

  it("refuses a flight belonging to another book, and discards it", () => {
    startFlight(stubEl({}), null, "a.m4b");
    expect(claimFlight("b.m4b")).toBeNull();
    // The stale flight must not survive to animate into a later navigation.
    expect(claimFlight("a.m4b")).toBeNull();
  });

  it("drops a flight that was never claimed in time", () => {
    startFlight(stubEl({}), null, "a.m4b");
    const realNow = Date.now;
    Date.now = () => realNow() + PENDING_TTL_MS + 1;
    try {
      expect(claimFlight("a.m4b")).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  it("clears when the source element is missing", () => {
    startFlight(stubEl({}), null, "a.m4b");
    startFlight(null, null, "a.m4b");
    expect(claimFlight("a.m4b")).toBeNull();
  });

  it("clearFlight discards a pending flight", () => {
    startFlight(stubEl({}), null, "a.m4b");
    clearFlight();
    expect(claimFlight("a.m4b")).toBeNull();
  });
});

describe("motionReduced", () => {
  it("follows the root attribute the app sets", () => {
    expect(motionReduced()).toBe(false);
    document.documentElement.setAttribute("data-reduce-motion", "on");
    expect(motionReduced()).toBe(true);
    document.documentElement.setAttribute("data-reduce-motion", "off");
    expect(motionReduced()).toBe(false);
  });
});
