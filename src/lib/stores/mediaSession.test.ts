// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Chapter } from "../types";
import { chapterStep, initMediaSession, positionStateFor } from "./mediaSession";
import { audioStore } from "./audioStore";

describe("positionStateFor", () => {
  it("maps a normal state and clamps the position to the duration", () => {
    expect(positionStateFor({ duration: 100, currentTime: 40, speed: 1.5 })).toEqual({
      duration: 100,
      position: 40,
      playbackRate: 1.5,
    });
    expect(positionStateFor({ duration: 100, currentTime: 140, speed: 1 })?.position).toBe(100);
  });

  it("refuses what setPositionState would throw on", () => {
    expect(positionStateFor({ duration: 0, currentTime: 0, speed: 1 })).toBeNull();
    expect(positionStateFor({ duration: NaN, currentTime: 0, speed: 1 })).toBeNull();
    expect(positionStateFor({ duration: 10, currentTime: -1, speed: 1 })).toBeNull();
    expect(positionStateFor({ duration: 10, currentTime: 1, speed: 0 })?.playbackRate).toBe(1);
  });
});

describe("chapterStep", () => {
  const chapters: Chapter[] = [
    { title: "1", startTimeMs: 0 },
    { title: "2", startTimeMs: 60_000 },
    { title: "3", startTimeMs: 120_000 },
  ];

  it("goes forward until the last chapter", () => {
    expect(chapterStep(chapters, 0, 10, 1)).toBe(1);
    expect(chapterStep(chapters, 2, 130, 1)).toBeNull();
  });

  it("restarts the current chapter when a few seconds in, else goes back", () => {
    expect(chapterStep(chapters, 1, 70, -1)).toBe(1); // 10 s into chapter 2
    expect(chapterStep(chapters, 1, 61, -1)).toBe(0); // just started it
    expect(chapterStep(chapters, 0, 1, -1)).toBeNull();
  });

  it("has nothing to do without chapters", () => {
    expect(chapterStep([], 0, 5, 1)).toBeNull();
    expect(chapterStep(chapters, -1, 5, 1)).toBeNull();
  });
});

describe("initMediaSession", () => {
  const handlers = new Map<string, unknown>();
  const session = {
    metadata: null as unknown,
    playbackState: "none",
    setActionHandler: vi.fn((action: string, h: unknown) => {
      if (h) handlers.set(action, h);
      else handlers.delete(action);
    }),
    setPositionState: vi.fn(),
  };
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    handlers.clear();
    session.metadata = null;
    session.playbackState = "none";
    session.setActionHandler.mockClear();
    session.setPositionState.mockClear();
    Object.defineProperty(navigator, "mediaSession", { value: session, configurable: true });
    vi.stubGlobal(
      "MediaMetadata",
      class {
        constructor(public init: Record<string, unknown>) {}
      },
    );
  });

  afterEach(() => {
    teardown?.();
    teardown = null;
    vi.unstubAllGlobals();
    audioStore.update((s) => ({ ...s, currentBook: null, playing: false }));
  });

  it("registers every transport action and clears them on teardown", () => {
    teardown = initMediaSession();
    expect([...handlers.keys()].sort()).toEqual(
      ["nexttrack", "pause", "play", "previoustrack", "seekbackward", "seekforward", "seekto", "stop"],
    );
    teardown();
    teardown = null;
    expect(handlers.size).toBe(0);
  });

  it("publishes the book as metadata and follows play/pause", () => {
    teardown = initMediaSession();
    audioStore.update((s) => ({
      ...s,
      currentBook: {
        filePath: "D:/x.m4b",
        title: "The Book",
        author: "A. Writer",
        album: "",
        duration: 3600,
        coverArt: null,
        chapters: [{ title: "Ch 1", startTimeMs: 0 }],
        tracks: [],
      },
      chapters: [{ title: "Ch 1", startTimeMs: 0 }],
      currentChapterIndex: 0,
      duration: 3600,
      currentTime: 12,
      playing: true,
    }));
    const meta = session.metadata as { init: Record<string, unknown> };
    expect(meta.init.title).toBe("The Book");
    expect(meta.init.artist).toBe("A. Writer");
    expect(meta.init.album).toBe("Ch 1");
    expect(session.playbackState).toBe("playing");
    expect(session.setPositionState).toHaveBeenCalledWith({
      duration: 3600,
      position: 12,
      playbackRate: 1,
    });

    audioStore.update((s) => ({ ...s, playing: false }));
    expect(session.playbackState).toBe("paused");
  });

  it("is a no-op where the API is missing", () => {
    Object.defineProperty(navigator, "mediaSession", { value: undefined, configurable: true });
    expect(() => initMediaSession()()).not.toThrow();
  });
});
