import { mkdir, writeFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";
import { appDataDir } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";

const COVERS_DIR = "covers";
let appDataPath: string | null = null;

async function ensureCoversDir(): Promise<void> {
  const dirExists = await exists(COVERS_DIR, { baseDir: BaseDirectory.AppData });
  if (!dirExists) {
    await mkdir(COVERS_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
  }
}

async function getAppDataPath(): Promise<string> {
  if (!appDataPath) {
    appDataPath = await appDataDir();
  }
  return appDataPath;
}

/** Generate a short hash from a string for filename use */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Save cover art to disk. Returns an asset-protocol URL for the saved file.
 * If the cover is already a non-base64 reference, returns it as-is.
 */
export async function saveCoverToDisk(
  bookFilePath: string,
  base64DataUrl: string,
): Promise<string> {
  // Skip if not a data URL
  if (!base64DataUrl.startsWith("data:")) {
    return base64DataUrl;
  }

  await ensureCoversDir();

  // Extract binary data from data URL
  const [header, b64] = base64DataUrl.split(",");
  const mime = header.match(/data:(.+?);/)?.[1] || "image/jpeg";
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const filename = `${hashString(bookFilePath)}.${ext}`;

  const binaryStr = atob(b64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  await writeFile(`${COVERS_DIR}/${filename}`, bytes, {
    baseDir: BaseDirectory.AppData,
  });

  // Return asset-protocol URL so it works directly in <img src>
  const dataDir = await getAppDataPath();
  const sep = dataDir.includes("\\") ? "\\" : "/";
  const fullPath = `${dataDir}${sep}${COVERS_DIR}${sep}${filename}`;
  return convertFileSrc(fullPath);
}

/**
 * Check if a cover reference is a base64 data URL (needs migration to disk).
 */
export function isBase64Cover(coverRef: string | null): boolean {
  return !!coverRef && coverRef.startsWith("data:");
}

/** Storage key for a user-picked cover override — distinct from the book key so
 *  the override never overwrites the cover extracted from the file. */
export function overrideCoverKey(bookFilePath: string): string {
  return `${bookFilePath}#override`;
}

/**
 * Re-generate an asset URL through the current runtime's convertFileSrc.
 * Handles http:// vs https:// scheme differences between debug/release builds.
 */
export function normalizeAssetUrl(url: string | null): string | null {
  if (!url) return url;
  const match = url.match(/^https?:\/\/asset\.localhost\/(.+)/);
  if (match) {
    return convertFileSrc(decodeURIComponent(match[1]));
  }
  return url;
}
