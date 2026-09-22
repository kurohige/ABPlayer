// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import PlayButton from "./PlayButton.svelte";
import { MORPH_SNAP_MS, playGlyphPath } from "../../utils/playGlyph";

/**
 * The glyph is animated by a rAF loop, but the fallback snap timer is the
 * contract: `MORPH_SNAP_MS` after `playing` flips, the path must be on its
 * target whatever rAF did. A regression here once left the button stuck on
 * the play glyph forever, because the effect tracked its own animation
 * position and restarted (and re-armed the timer) on every frame.
 */

let target: HTMLDivElement;
let app: ReturnType<typeof mount> | null = null;

function glyph(): string | null {
  return target.querySelector("path")?.getAttribute("d") ?? null;
}

afterEach(() => {
  if (app) unmount(app);
  app = null;
  target.remove();
});

describe("PlayButton", () => {
  it("starts on the glyph for its initial state", () => {
    target = document.createElement("div");
    document.body.appendChild(target);
    app = mount(PlayButton, { target, props: { playing: true } });
    flushSync();
    expect(glyph()).toBe(playGlyphPath(1));
  });

  it("lands on the pause glyph after playing flips, and back", async () => {
    target = document.createElement("div");
    document.body.appendChild(target);
    const props = $state({ playing: false });
    app = mount(PlayButton, { target, props });
    flushSync();
    expect(glyph()).toBe(playGlyphPath(0));

    props.playing = true;
    flushSync();
    await new Promise((r) => setTimeout(r, MORPH_SNAP_MS + 150));
    flushSync();
    expect(glyph()).toBe(playGlyphPath(1));

    props.playing = false;
    flushSync();
    await new Promise((r) => setTimeout(r, MORPH_SNAP_MS + 150));
    flushSync();
    expect(glyph()).toBe(playGlyphPath(0));
  });

  it("shows the ring instead of the glyph while loading", () => {
    target = document.createElement("div");
    document.body.appendChild(target);
    app = mount(PlayButton, { target, props: { playing: false, loading: true } });
    flushSync();
    expect(glyph()).toBeNull();
    expect(target.querySelector("circle.ring")).not.toBeNull();
  });
});
