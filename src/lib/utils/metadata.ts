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
    const cleanup = () => {
      audio.removeAttribute("src");
      audio.load();
    };
    audio.preload = "metadata";
    audio.addEventListener(
      "loadedmetadata",
      () => {
        const dur = isFinite(audio.duration) ? audio.duration : 0;
        cleanup();
        resolve(dur);
      },
      { once: true },
    );
    audio.addEventListener("error", () => { cleanup(); resolve(0); }, { once: true });
    setTimeout(() => { cleanup(); resolve(0); }, 8000);
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
}

/**
 * Extract metadata via the Rust backend (lofty crate).
 * This handles MP4/M4B/MP3/OGG etc. natively by reading the actual file
 * on disk — no partial buffer hacks, no WebView memory issues.
 *
 * Falls back to <audio> duration probe + JS chapter extraction if Rust fails.
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

    // Chapters from Rust (if available) or try JS fallback
    let chapters: Chapter[] = meta.chapters.map((ch) => ({
      title: ch.title,
      startTimeMs: ch.start_time_ms,
    }));

    // If no chapters from Rust, try JS-based chapter extraction from head chunk
    if (chapters.length === 0) {
      chapters = await extractChaptersJs(filePath);
    }

    return {
      filePath,
      title: meta.title || titleFromFile,
      author: meta.artist || "Unknown Author",
      album: meta.album || "",
      duration,
      coverArt: meta.cover_art || null,
      chapters,
      tracks: [],
    };
  } catch (e) {
    console.warn(`Rust metadata extraction failed for ${filePath}:`, e);
    // Fallback: at least get duration
    fallback.duration = await probeDuration(filePath);
    return fallback;
  }
}

/**
 * Try to extract chapters using music-metadata JS library (first 2MB).
 * This works for MP3 ID3v2 chapters and sometimes MP4 chapter atoms.
 */
async function extractChaptersJs(filePath: string): Promise<Chapter[]> {
  try {
    const { parseBuffer } = await import("music-metadata");
    const url = convertFileSrc(filePath, "audiostream");
    const CHUNK = 2 * 1024 * 1024;
    const response = await fetch(url, {
      headers: { Range: `bytes=0-${CHUNK - 1}` },
    });
    const buf = await response.arrayBuffer();
    const metadata = await parseBuffer(new Uint8Array(buf));

    // chapters exists at runtime but isn't in the published IAudioMetadata type
    const rawChapters = (metadata as unknown as { chapters?: { tags?: { title?: string }; startTime?: number }[] }).chapters;
    const chapters: Chapter[] = [];
    if (rawChapters && rawChapters.length > 0) {
      for (const ch of rawChapters) {
        chapters.push({
          title: ch.tags?.title || `Chapter ${chapters.length + 1}`,
          startTimeMs: (ch.startTime || 0) * 1000,
        });
      }
    }
    return chapters;
  } catch {
    return [];
  }
}
