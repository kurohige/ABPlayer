import { convertFileSrc } from "@tauri-apps/api/core";
import { invoke } from "@tauri-apps/api/core";
import type { BookMeta, Chapter } from "../types";

const SUPPORTED_EXTENSIONS = [".mp3", ".m4a", ".m4b", ".mp4", ".ogg"];
const STANDALONE_EXTENSIONS = [".m4b"];

export function isSupportedAudioFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isStandaloneAudiobook(filename: string): boolean {
  const lower = filename.toLowerCase();
  return STANDALONE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Build a BookMeta with just the filename — no parsing, no I/O. */
export function bookMetaFromPath(filePath: string): BookMeta {
  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  const titleFromFile = fileName.replace(/\.[^.]+$/, "");
  return {
    filePath,
    title: titleFromFile,
    author: "Unknown Author",
    album: "",
    duration: 0,
    coverArt: null,
    chapters: [],
    tracks: [],
  };
}

/** Get duration via a temporary <audio> element. Uses audiostream protocol for CORS safety. */
export function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const url = convertFileSrc(filePath, "audiostream");
    const audio = new Audio();
    // Whichever of the three fires first settles it; the others are then
    // no-ops, and the 8 s fallback no longer keeps a settled probe's element
    // alive during a scan.
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const settle = (dur: number) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      audio.removeAttribute("src");
      audio.load();
      resolve(dur);
    };
    audio.preload = "metadata";
    audio.addEventListener(
      "loadedmetadata",
      () => settle(isFinite(audio.duration) ? audio.duration : 0),
      { once: true },
    );
    audio.addEventListener("error", () => settle(0), { once: true });
    timer = setTimeout(() => settle(0), 8000);
    audio.src = url;
  });
}

/** Response shape from the Rust read_audio_meta command. */
interface RustAudioMeta {
  title: string | null;
  artist: string | null;
  album: string | null;
  duration_secs: number;
  cover_art: string | null;
  chapters: { title: string; start_time_ms: number }[];
  chapter_source: "embedded" | "sidecar" | "none";
}

/**
 * Extract metadata via the Rust backend: lofty for tags and duration, the
 * hand-written atom walker for MP4 chapters, the ID3v2 CHAP reader for MP3
 * chapters, and a .cue / .chapters.txt sidecar when a file has none of its
 * own. Falls back to an <audio> duration probe if Rust fails.
 */
export async function extractMetadata(filePath: string): Promise<BookMeta> {
  const fallback = bookMetaFromPath(filePath);

  try {
    const meta = await invoke<RustAudioMeta>("read_audio_meta", {
      filePath,
    });

    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    const titleFromFile = fileName.replace(/\.[^.]+$/, "");

    let duration = meta.duration_secs || 0;
    if (duration <= 0) {
      duration = await probeDuration(filePath);
    }

    const chapters: Chapter[] = meta.chapters.map((ch) => ({
      title: ch.title,
      startTimeMs: ch.start_time_ms,
    }));

    return {
      filePath,
      title: meta.title || titleFromFile,
      author: meta.artist || "Unknown Author",
      album: meta.album || "",
      duration,
      coverArt: meta.cover_art || null,
      chapters,
      ...(meta.chapter_source === "none" ? {} : { chapterSource: meta.chapter_source }),
      tracks: [],
    };
  } catch (e) {
    console.warn(`Rust metadata extraction failed for ${filePath}:`, e);
    // Fallback: at least get duration
    fallback.duration = await probeDuration(filePath);
    return fallback;
  }
}
