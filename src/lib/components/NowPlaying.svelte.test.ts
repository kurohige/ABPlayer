// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import NowPlaying from "./NowPlaying.svelte";
import type { ExternalState } from "./NowPlaying.svelte";

/**
 * The mini-player strip. It lives in its own window, which no test can drive,
 * so the contract is pinned here: what the rail and the subtitle show, and
 * that the elapsed time is a control while everything around it stays a drag
 * region (the window has no title bar — the strip is it).
 */

const base: ExternalState = {
  playing: false,
  loading: false,
  currentTime: 750,
  duration: 3600,
  title: "Loop Breaker",
  author: "Shawn Wilson",
  coverArt: null,
};

let target: HTMLDivElement;
let app: ReturnType<typeof mount> | null = null;

function render(state: Partial<ExternalState>, props: Record<string, unknown> = {}) {
  target = document.createElement("div");
  document.body.appendChild(target);
  app = mount(NowPlaying, {
    target,
    props: { state: { ...base, ...state }, onplay: vi.fn(), onskip: vi.fn(), ...props },
  });
  flushSync();
}

function q(sel: string): HTMLElement | null {
  return target.querySelector(sel);
}

afterEach(() => {
  if (app) unmount(app);
  app = null;
  target.remove();
});

describe("NowPlaying", () => {
  it("fills the rail with the share played", () => {
    render({ currentTime: 900, duration: 3600 });
    expect(q(".np-rail-fill")?.style.width).toBe("25%");
  });

  it("leaves the rail empty before a duration is known", () => {
    render({ currentTime: 0, duration: 0 });
    expect(q(".np-rail-fill")?.style.width).toBe("0%");
  });

  it("shows chapter, author and an off-normal speed on one line", () => {
    render({ chapterLabel: "Ch 10", speedLabel: "1.5×" });
    expect(q(".np-sub")?.textContent).toBe("Ch 10 · Shawn Wilson · 1.5×");
  });

  it("drops the empty fields rather than leaving separators behind", () => {
    render({ chapterLabel: "", speedLabel: "" });
    expect(q(".np-sub")?.textContent).toBe("Shawn Wilson");
  });

  it("replaces the subtitle with a playback error", () => {
    render({ chapterLabel: "Ch 10", error: "File not found" });
    expect(q(".np-sub")?.textContent).toBe("File not found");
    expect(q(".np-sub")?.classList.contains("np-error")).toBe(true);
  });

  it("writes both times as h:mm:ss with a dimmed separator", () => {
    render({ currentTime: 10652, duration: 78788 });
    expect(q(".np-time")?.textContent?.replace(/\s+/g, " ").trim()).toBe("2:57:32 / 21:53:08");
    expect(q(".np-sep")?.textContent).toBe("/");
  });

  it("shows the spine cue only over real art", () => {
    render({ coverArt: null });
    expect(q(".np-cover")?.classList.contains("art")).toBe(false);

    if (app) unmount(app);
    target.remove();
    render({ coverArt: "https://asset.localhost/cover.jpg" });
    expect(q(".np-cover")?.classList.contains("art")).toBe(true);
  });

  describe("typing a time", () => {
    function type(text: string) {
      const input = q(".np-time-input") as HTMLInputElement;
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      flushSync();
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      flushSync();
      return input;
    }

    it("only offers the field when there is somewhere to seek to", () => {
      render({}, { onseek: undefined });
      expect(q(".np-now")).toBeNull();

      if (app) unmount(app);
      target.remove();
      render({ duration: 0 }, { onseek: vi.fn() });
      expect(q(".np-now")).toBeNull();
    });

    it("seeks to the time typed", () => {
      const onseek = vi.fn();
      render({}, { onseek });

      (q(".np-now") as HTMLButtonElement).click();
      flushSync();
      type("12:30");

      expect(onseek).toHaveBeenCalledWith(750);
      expect(q(".np-time-input")).toBeNull();
    });

    it("never seeks past the end", () => {
      const onseek = vi.fn();
      render({ duration: 3600 }, { onseek });

      (q(".np-now") as HTMLButtonElement).click();
      flushSync();
      type("9:00:00");

      expect(onseek).toHaveBeenCalledWith(3600);
    });

    it("marks something unreadable instead of jumping anywhere", () => {
      const onseek = vi.fn();
      render({}, { onseek });

      (q(".np-now") as HTMLButtonElement).click();
      flushSync();
      const input = type("half four");

      expect(onseek).not.toHaveBeenCalled();
      expect(input.classList.contains("invalid")).toBe(true);
      expect(q(".np-time-input")).not.toBeNull();
    });

    it("leaves the field on Escape without seeking", () => {
      const onseek = vi.fn();
      render({}, { onseek });

      (q(".np-now") as HTMLButtonElement).click();
      flushSync();
      const input = q(".np-time-input") as HTMLInputElement;
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      flushSync();

      expect(onseek).not.toHaveBeenCalled();
      expect(q(".np-time-input")).toBeNull();
    });
  });

  describe("drag regions", () => {
    it("keeps the frame draggable but not the controls", () => {
      render({}, { onseek: vi.fn() });

      expect(q(".np")?.hasAttribute("data-tauri-drag-region")).toBe(true);
      expect(q(".np-title")?.hasAttribute("data-tauri-drag-region")).toBe(true);
      // The cover's image is a child, so this one has to reach descendants
      expect(q(".np-cover")?.getAttribute("data-tauri-drag-region")).toBe("deep");

      // The elapsed time is a button: a drag region here would swallow the click
      expect(q(".np-now")?.hasAttribute("data-tauri-drag-region")).toBe(false);
      expect(q(".np-controls")?.hasAttribute("data-tauri-drag-region")).toBe(false);
      for (const btn of target.querySelectorAll(".np-controls button")) {
        expect(btn.hasAttribute("data-tauri-drag-region")).toBe(false);
      }
    });

    it("opts the elapsed time out of the global press-scale", () => {
      render({}, { onseek: vi.fn() });
      expect(q(".np-now")?.getAttribute("data-press")).toBe("none");
    });
  });

  it("reports the transport back to the window", () => {
    const onplay = vi.fn();
    const onskip = vi.fn();
    render({}, { onplay, onskip });

    const buttons = target.querySelectorAll<HTMLButtonElement>(".np-controls button");
    expect(buttons).toHaveLength(3);
    buttons[0].click();
    buttons[1].click();
    buttons[2].click();

    expect(onskip.mock.calls).toEqual([[-30], [30]]);
    expect(onplay).toHaveBeenCalledOnce();
  });
});
