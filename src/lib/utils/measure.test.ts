// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { remPx, watchBelow } from "./measure";

/**
 * happy-dom has no layout, so the observer is replaced with one that hands
 * back whatever content rect the test says the node has.
 */
type Callback = (entries: { contentRect: { width: number; height: number } }[]) => void;
let callbacks: Callback[] = [];
let disconnected = 0;

class FakeResizeObserver {
  constructor(private cb: Callback) {
    callbacks.push(cb);
  }
  observe() {
    // fires once on observe, like the real one
    this.cb([{ contentRect: { width: 800, height: 600 } }]);
  }
  disconnect() {
    disconnected += 1;
  }
}

function resize(width: number, height = 600) {
  for (const cb of callbacks) cb([{ contentRect: { width, height } }]);
}

beforeEach(() => {
  callbacks = [];
  disconnected = 0;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  document.documentElement.style.fontSize = "16px";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("remPx", () => {
  it("reads the root font-size", () => {
    document.documentElement.style.fontSize = "20px";
    expect(remPx()).toBe(20);
  });
});

describe("watchBelow", () => {
  it("reports below/above on mount and on crossing the threshold, once per change", () => {
    const seen: boolean[] = [];
    const node = document.createElement("div");
    const action = watchBelow(node, { rem: 40, onchange: (b) => seen.push(b) });

    expect(seen).toEqual([false]); // 800px vs 40rem = 640px
    resize(600);
    resize(500); // still below — no second call
    resize(700);
    expect(seen).toEqual([false, true, false]);

    action.destroy();
    expect(disconnected).toBe(1);
  });

  it("scales the threshold with the root font-size", () => {
    document.documentElement.style.fontSize = "20px"; // 40rem = 800px
    const seen: boolean[] = [];
    watchBelow(document.createElement("div"), { rem: 40, onchange: (b) => seen.push(b) });
    resize(799);
    expect(seen).toEqual([false, true]);
  });

  it("can watch the height instead", () => {
    const seen: boolean[] = [];
    watchBelow(document.createElement("div"), {
      rem: 44,
      axis: "height",
      onchange: (b) => seen.push(b),
    });
    expect(seen).toEqual([true]); // 600px < 44rem = 704px
    resize(800, 900);
    expect(seen).toEqual([true, false]);
  });
});
