/**
 * Rules for folding chapter-per-file audiobooks into one book.
 *
 * A subfolder of audio files has always been one book. These rules cover the
 * other common layout: chapter files sitting loose in a scanned folder, often
 * next to other books' chapters. Files are grouped by album tag when they
 * have one, else by what is left of the file name once numbering is removed.
 */
import { naturalCompare } from "./sort";

/** Prefix of the `filePath` a grouped (virtual) book is stored under. */
export const GROUP_PREFIX = "group:";
const AUTO_PREFIX = "group:auto:";

export function isGroupPath(filePath: string): boolean {
  return filePath.startsWith(GROUP_PREFIX);
}

export function manualGroupPath(id: string): string {
  return `${GROUP_PREFIX}${id}`;
}

/** Stable across rescans: the same folder and label give the same book. */
export function autoGroupPath(dir: string, label: string): string {
  return `${AUTO_PREFIX}${dir}::${label.toLowerCase()}`;
}

export interface LooseFile {
  path: string;
  /** File name without directory or extension. */
  name: string;
  /** Album tag when already known (from a previous scan), else "". */
  album: string;
}

export interface LooseGroup {
  /** What the files share: the album, or the file-name stem. "" when they share only numbering. */
  label: string;
  /** Whether the label is an album tag or a file-name stem. */
  source: "album" | "name";
  /** Naturally sorted by file name. */
  files: LooseFile[];
}

const NUMBERING_WORDS = /\b(chapter|chap|ch|part|pt|track|disc|disk|cd|section|episode|ep)\b/gi;

/**
 * What is left of a file name without its numbering: "My Book - 03" and
 * "My Book 12" both give "my book"; "Chapter 7" and "04" give "".
 */
export function fileStem(name: string): string {
  return name
    .replace(/[\s._\-–—()[\]#,]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(NUMBERING_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True when a name carries a number — a lone "Introduction" is not a chapter file. */
function isNumbered(name: string): boolean {
  return /\d/.test(name);
}

/**
 * Split the loose files of ONE folder into books. Files that share an album
 * (2+) become a group; of the rest, numbered files that share a stem (2+)
 * become a group, the empty stem ("Chapter 1", "02") included. Everything
 * else stays single.
 */
export function groupLooseFiles(files: LooseFile[]): { groups: LooseGroup[]; singles: LooseFile[] } {
  const byAlbum = new Map<string, LooseFile[]>();
  const untagged: LooseFile[] = [];
  for (const f of files) {
    const key = f.album.trim().toLowerCase();
    if (!key) untagged.push(f);
    else byAlbum.set(key, [...(byAlbum.get(key) ?? []), f]);
  }

  const groups: LooseGroup[] = [];
  const singles: LooseFile[] = [];

  for (const members of byAlbum.values()) {
    if (members.length >= 2) groups.push({ label: members[0].album.trim(), source: "album", files: members });
    else singles.push(...members);
  }

  const byStem = new Map<string, LooseFile[]>();
  for (const f of untagged) {
    if (!isNumbered(f.name)) {
      singles.push(f);
      continue;
    }
    const stem = fileStem(f.name);
    byStem.set(stem, [...(byStem.get(stem) ?? []), f]);
  }
  for (const [stem, members] of byStem) {
    if (members.length >= 2) groups.push({ label: stem, source: "name", files: members });
    else singles.push(...members);
  }

  for (const g of groups) g.files.sort((a, b) => naturalCompare(a.name, b.name));
  return { groups, singles };
}

/** A stem is lower-cased for matching; title-case it for display. */
export function titleFromLabel(label: string): string {
  return label.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

const IMAGE_EXT = /\.(jpe?g|png)$/i;
const COVER_NAMES = ["cover", "folder", "front", "album", "albumart"];

/**
 * The image in a book's folder to use as its cover: a conventionally named
 * one (cover/folder/front…) first, else the folder's only image. Several
 * unnamed images are ambiguous, so none is picked.
 */
export function pickFolderCover(fileNames: string[]): string | null {
  const images = fileNames.filter((n) => IMAGE_EXT.test(n));
  if (images.length === 0) return null;
  const base = (n: string) => n.replace(/\.[^.]+$/, "").toLowerCase();
  for (const wanted of COVER_NAMES) {
    const hit = images.find((n) => base(n) === wanted);
    if (hit) return hit;
  }
  const loose = images.find((n) => COVER_NAMES.some((w) => base(n).includes(w)));
  if (loose) return loose;
  return images.length === 1 ? images[0] : null;
}
