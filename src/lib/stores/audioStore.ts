import { writable, get } from "svelte/store";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { BookMeta, Chapter } from "../types";

/** Use custom audiostream:// protocol that serves files with CORS headers,
 *  so Web Audio API's createMediaElementSource works. */
function audioSrc(filePath: string): string {
  return convertFileSrc(filePath, "audiostream");
}
import {
  savePosition,
  checkAndPromptResume,
  startAutoSave,
  stopAutoSave,
} from "./positionStore";
import { markInProgressIfNew, setBookStatus, getUserBookData, setUserBookData } from "./userdataStore";
import { onPlaybackStarted, onPlaybackPaused, incrementBooksFinished } from "./statisticsStore";

interface AudioState {
  playing: boolean;
  /** True while play has been requested but the audio element hasn't yet
   *  emitted "playing", or while it's buffering during playback (waiting).
   *  Drives the spinner UI for slow-loading files (e.g. M4Bs with moov-at-end). */
  loading: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  volume: number;
  muted: boolean;
  eqBass: number;
  eqMid: number;
  eqTreble: number;
  bookGainDb: number;
  currentBook: BookMeta | null;
  chapters: Chapter[];
  currentChapterIndex: number;
  /** For multi-file books: which track is currently playing. */
  currentTrackIndex: number;
  /** For multi-file books: how many tracks total. */
  totalTracks: number;
  error: string | null;
  sleepTimerRemaining: number | null;
  sleepTimerMode: "off" | "minutes" | "end-of-chapter";
  abRepeat: { a: number; b: number } | null;
}

const initialState: AudioState = {
  playing: false,
  loading: false,
  currentTime: 0,
  duration: 0,
  speed: 1,
  volume: 1,
  muted: false,
  eqBass: 0,
  eqMid: 0,
  eqTreble: 0,
  bookGainDb: 0,
  currentBook: null,
  chapters: [],
  currentChapterIndex: -1,
  currentTrackIndex: 0,
  totalTracks: 0,
  error: null,
  sleepTimerRemaining: null,
  sleepTimerMode: "off",
  abRepeat: null,
};

export const audioStore = writable<AudioState>(initialState);

let audioElement: HTMLAudioElement | null = null;

// --- Web Audio API ---
let audioContext: AudioContext | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let gainNode: GainNode | null = null;
let eqNodes: BiquadFilterNode[] = [];

let audioGraphConnected = false;

function ensureAudioGraph(): void {
  if (!audioElement) return;
  if (audioGraphConnected) return; // already connected

  audioContext = new AudioContext();
  sourceNode = audioContext.createMediaElementSource(audioElement);
  audioGraphConnected = true;

  // EQ: lowshelf → peaking (mid) → highshelf
  eqNodes = [
    audioContext.createBiquadFilter(),
    audioContext.createBiquadFilter(),
    audioContext.createBiquadFilter(),
  ];
  eqNodes[0].type = "lowshelf";
  eqNodes[0].frequency.value = 250;
  eqNodes[1].type = "peaking";
  eqNodes[1].frequency.value = 1000;
  eqNodes[1].Q.value = 1;
  eqNodes[2].type = "highshelf";
  eqNodes[2].frequency.value = 4000;

  gainNode = audioContext.createGain();

  // Wire: source → eq[0] → eq[1] → eq[2] → gain → destination
  sourceNode.connect(eqNodes[0]);
  eqNodes[0].connect(eqNodes[1]);
  eqNodes[1].connect(eqNodes[2]);
  eqNodes[2].connect(gainNode);
  gainNode.connect(audioContext.destination);
}

function isMultiFile(book: BookMeta): boolean {
  return book.tracks.length > 1;
}

function getTrackFilePath(book: BookMeta, trackIndex: number): string {
  if (book.tracks.length > 0 && trackIndex < book.tracks.length) {
    return book.tracks[trackIndex].filePath;
  }
  return book.filePath;
}

export function getAudioElement(): HTMLAudioElement {
  if (!audioElement) {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audioElement = audio;

    // timeupdate fires ~4x/sec — keep this lean
    audio.addEventListener("timeupdate", () => {
      const time = audio.currentTime;
      const dur = audio.duration;
      audioStore.update((s) => {
        // A-B repeat check inside update to avoid extra get()
        if (s.abRepeat && time >= s.abRepeat.b) {
          audio.currentTime = s.abRepeat.a;
        }
        return {
          ...s,
          currentTime: time,
          duration: dur || s.duration,
          currentChapterIndex: findCurrentChapter(s.chapters, time),
        };
      });
    });

    audio.addEventListener("loadedmetadata", () => {
      // Some moov-at-end M4Bs report NaN/0 here until the moov atom is parsed.
      // Keep the duration we already have (read from disk by Rust/lofty) in
      // that case — overwriting with NaN breaks the seek/progress UI.
      audioStore.update((s) => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          return { ...s, duration: audio.duration };
        }
        return s;
      });
    });

    audio.addEventListener("play", () => {
      audioStore.update((s) => {
        if (s.currentBook) onPlaybackStarted(s.currentBook.filePath);
        return { ...s, playing: true, loading: true };
      });
    });

    audio.addEventListener("playing", () => {
      audioStore.update((s) => ({ ...s, loading: false }));
    });

    audio.addEventListener("waiting", () => {
      audioStore.update((s) => ({ ...s, loading: true }));
    });

    audio.addEventListener("pause", () => {
      onPlaybackPaused();
      audioStore.update((s) => {
        if (s.currentBook) {
          savePosition(
            s.currentBook.filePath,
            audio.currentTime,
            audio.duration,
            s.currentTrackIndex,
          );
        }
        return { ...s, playing: false, loading: false };
      });
    });

    audio.addEventListener("ended", () => {
      onPlaybackPaused();
      const state = get(audioStore);
      if (state.currentBook && isMultiFile(state.currentBook)) {
        const nextTrack = state.currentTrackIndex + 1;
        if (nextTrack < state.currentBook.tracks.length) {
          playTrack(state.currentBook, nextTrack);
          return;
        }
      }
      audioStore.update((s) => ({ ...s, playing: false, loading: false }));
      if (state.currentBook) {
        setBookStatus(state.currentBook.filePath, "finished");
        incrementBooksFinished();
      }
    });

    audio.addEventListener("error", () => {
      const code = audio.error?.code;
      let msg = "Playback error";
      if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        msg = "Unsupported audio format";
      } else if (code === MediaError.MEDIA_ERR_NETWORK) {
        msg = "File not found or inaccessible";
      } else if (code === MediaError.MEDIA_ERR_DECODE) {
        msg = "Audio file is corrupted";
      }
      audioStore.update((s) => ({ ...s, playing: false, loading: false, error: msg }));
    });

    // Connect Web Audio graph before any src is set
    ensureAudioGraph();
  }
  return audioElement;
}

function findCurrentChapter(
  chapters: Chapter[],
  currentTimeSeconds: number,
): number {
  if (chapters.length === 0) return -1;
  const timeMs = currentTimeSeconds * 1000;
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (timeMs >= chapters[i].startTimeMs) return i;
  }
  return 0;
}

/** Call audio.play() with rejection handling.
 *  audio.play() rejects on autoplay-policy blocks (NotAllowedError) or pre-load
 *  source errors that the "error" listener won't see. Without a catch, the
 *  loading flag set by the "play" event would stay true and the spinner would
 *  spin forever. AbortError is benign (fired when src changes mid-play) and
 *  silently clears loading instead of surfacing as an error. */
function safePlay(audio: HTMLAudioElement): void {
  const p = audio.play();
  if (p && typeof p.catch === "function") {
    p.catch((e: unknown) => {
      const name = (e as { name?: string } | null)?.name;
      if (name === "AbortError") {
        audioStore.update((s) => ({ ...s, loading: false }));
        return;
      }
      const msg =
        name === "NotAllowedError"
          ? "Playback blocked — click play again"
          : (e as { message?: string } | null)?.message || "Playback failed";
      audioStore.update((s) => ({ ...s, playing: false, loading: false, error: msg }));
    });
  }
}

/** Load a specific track of a book into the audio element and play. */
function playTrack(book: BookMeta, trackIndex: number): void {
  const audio = getAudioElement();
  const filePath = getTrackFilePath(book, trackIndex);
  const src = audioSrc(filePath);
  audio.src = src;
  audio.playbackRate = get(audioStore).speed;

  audioStore.update((s) => ({
    ...s,
    currentTrackIndex: trackIndex,
    currentTime: 0,
  }));

  safePlay(audio);
}

export async function loadBook(book: BookMeta): Promise<void> {
  // Metadata-only books can't be played — caller should route to the detail view instead
  if (book.fileless) {
    audioStore.update((s) => ({
      ...s,
      currentBook: book,
      chapters: [],
      currentTime: 0,
      duration: book.duration || 0,
      currentChapterIndex: -1,
      currentTrackIndex: 0,
      totalTracks: 0,
      playing: false,
      error: null,
      abRepeat: null,
    }));
    markInProgressIfNew(book.filePath);
    return;
  }
  const audio = getAudioElement();
  if (audioContext?.state === "suspended") audioContext.resume();
  stopAutoSave();

  // Apply per-book gain
  const bookData = getUserBookData(book.filePath);
  const bookGainDb = bookData.gainDb ?? 0;
  if (gainNode) {
    gainNode.gain.value = Math.pow(10, bookGainDb / 20);
  }

  const totalTracks = book.tracks.length || 1;

  // Build chapters from tracks for multi-file books (if no embedded chapters)
  let chapters = book.chapters;
  if (chapters.length === 0 && book.tracks.length > 1) {
    let offset = 0;
    chapters = book.tracks.map((t) => {
      const ch: Chapter = { title: t.title, startTimeMs: offset * 1000 };
      offset += t.duration;
      return ch;
    });
  }

  // Clear A-B repeat and sleep timer from previous book
  cancelSleepTimer();

  audioStore.update((s) => ({
    ...s,
    currentBook: book,
    chapters,
    currentTime: 0,
    duration: book.duration || 0,
    error: null,
    abRepeat: null,
    currentChapterIndex: chapters.length > 0 ? 0 : -1,
    currentTrackIndex: 0,
    totalTracks,
    bookGainDb,
  }));

  // Auto-promote status
  markInProgressIfNew(book.filePath);

  // Load first track (or single file)
  const firstFile = getTrackFilePath(book, 0);
  const src = audioSrc(firstFile);
  audio.src = src;
  audio.playbackRate = get(audioStore).speed;

  checkAndPromptResume(
    book.filePath,
    (position, trackIndex) => {
      if (isMultiFile(book) && trackIndex > 0 && trackIndex < book.tracks.length) {
        // Resume on a different track
        const trackFile = getTrackFilePath(book, trackIndex);
        audio.src = audioSrc(trackFile);
        audio.playbackRate = get(audioStore).speed;
        audioStore.update((s) => ({ ...s, currentTrackIndex: trackIndex }));
        audio.addEventListener(
          "loadedmetadata",
          () => {
            audio.currentTime = position;
            safePlay(audio);
          },
          { once: true },
        );
      } else {
        audio.currentTime = position;
        safePlay(audio);
      }
      startAutoSaveForCurrent();
    },
    () => {
      audio.currentTime = 0;
      safePlay(audio);
      startAutoSaveForCurrent();
    },
  );
}

function startAutoSaveForCurrent(): void {
  startAutoSave(() => {
    const state = get(audioStore);
    return {
      filePath: state.currentBook?.filePath || "",
      currentTime: state.currentTime,
      duration: state.duration,
      trackIndex: state.currentTrackIndex,
    };
  });
}

export function togglePlay(): void {
  const audio = getAudioElement();
  if (audioContext?.state === "suspended") audioContext.resume();
  if (audio.paused) {
    safePlay(audio);
  } else {
    audio.pause();
  }
}

export function seek(time: number): void {
  const audio = getAudioElement();
  // Fall back to the store's duration when audio.duration is NaN — moov-at-end
  // M4Bs report NaN until the atom is parsed, so chapter jumps would otherwise
  // clamp to 0 before metadata loads.
  const fallback = get(audioStore).duration;
  const upper = Number.isFinite(audio.duration) && audio.duration > 0
    ? audio.duration
    : fallback;
  audio.currentTime = Math.max(0, Math.min(time, upper || 0));
}

export function skip(seconds: number): void {
  const audio = getAudioElement();
  seek(audio.currentTime + seconds);
}

export function setSpeed(speed: number): void {
  const audio = getAudioElement();
  audio.playbackRate = speed;
  audioStore.update((s) => ({ ...s, speed }));
}

export function setVolume(volume: number): void {
  const audio = getAudioElement();
  const clamped = Math.max(0, Math.min(1, volume));
  audio.volume = clamped;
  audio.muted = false;
  audioStore.update((s) => ({ ...s, volume: clamped, muted: false }));
}

export function toggleMute(): void {
  const audio = getAudioElement();
  const state = get(audioStore);
  const newMuted = !state.muted;
  audio.muted = newMuted;
  audioStore.update((s) => ({ ...s, muted: newMuted }));
}

/** Smooth ramp time constant (15ms) to avoid audible clicks/pops */
const RAMP_TC = 0.015;

export function setEq(band: "bass" | "mid" | "treble", gainDb: number): void {
  ensureAudioGraph();
  if (audioContext?.state === "suspended") audioContext.resume();
  const clamped = Math.max(-12, Math.min(12, gainDb));
  const idx = band === "bass" ? 0 : band === "mid" ? 1 : 2;
  if (eqNodes[idx] && audioContext) {
    eqNodes[idx].gain.setTargetAtTime(clamped, audioContext.currentTime, RAMP_TC);
  }
  const key = band === "bass" ? "eqBass" : band === "mid" ? "eqMid" : "eqTreble";
  audioStore.update((s) => ({ ...s, [key]: clamped }));
}

export function setBookGain(gainDb: number): void {
  ensureAudioGraph();
  if (audioContext?.state === "suspended") audioContext.resume();
  const clamped = Math.max(-12, Math.min(12, gainDb));
  if (gainNode && audioContext) {
    const linearGain = Math.pow(10, clamped / 20);
    gainNode.gain.setTargetAtTime(linearGain, audioContext.currentTime, RAMP_TC);
  }
  audioStore.update((s) => ({ ...s, bookGainDb: clamped }));
  const state = get(audioStore);
  if (state.currentBook) {
    setUserBookData(state.currentBook.filePath, { gainDb: clamped });
  }
}

export function seekToChapter(index: number): void {
  const state = get(audioStore);
  if (index >= 0 && index < state.chapters.length) {
    const book = state.currentBook;
    if (book && isMultiFile(book)) {
      // For multi-file books, chapters map to tracks
      if (index < book.tracks.length) {
        playTrack(book, index);
        return;
      }
    }
    // Single-file with embedded chapters
    seek(state.chapters[index].startTimeMs / 1000);
  }
}

/** Jump to a specific track in a multi-file book. */
export function goToTrack(trackIndex: number): void {
  const state = get(audioStore);
  if (state.currentBook && isMultiFile(state.currentBook)) {
    if (trackIndex >= 0 && trackIndex < state.currentBook.tracks.length) {
      playTrack(state.currentBook, trackIndex);
    }
  }
}

// ---- Sleep Timer (extracted to sleepTimerStore.ts) ----
export { setSleepTimer, setSleepEndOfChapter, cancelSleepTimer } from "./sleepTimerStore";
import { cancelSleepTimer } from "./sleepTimerStore";

// ---- A-B Repeat ----

export function setAbRepeatA(): void {
  audioStore.update((s) => ({
    ...s,
    abRepeat: s.abRepeat
      ? { a: s.currentTime, b: s.abRepeat.b }
      : { a: s.currentTime, b: s.currentTime },
  }));
}

export function setAbRepeatB(): void {
  audioStore.update((s) =>
    s.abRepeat
      ? { ...s, abRepeat: { a: s.abRepeat.a, b: s.currentTime } }
      : s,
  );
}

export function clearAbRepeat(): void {
  audioStore.update((s) => ({ ...s, abRepeat: null }));
}

// Save position on window close
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    const state = get(audioStore);
    if (state.currentBook && state.currentTime > 0) {
      // Fire-and-forget — the store plugin auto-saves synchronously
      savePosition(
        state.currentBook.filePath,
        state.currentTime,
        state.duration,
        state.currentTrackIndex,
      );
    }
    stopAutoSave();
    onPlaybackPaused();
  });
}
