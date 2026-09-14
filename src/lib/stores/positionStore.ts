import type { SavedPosition } from "../types";
import { getStore } from "./storeUtils";

const STORE_FILE = "positions.json";
const AUTO_SAVE_INTERVAL = 10_000;

export async function savePosition(
  filePath: string,
  position: number,
  duration: number,
  trackIndex: number = 0,
): Promise<void> {
  const s = await getStore(STORE_FILE);
  const entry: SavedPosition = {
    position,
    duration,
    lastPlayed: new Date().toISOString(),
    trackIndex,
  };
  await s.set(filePath, entry);
}

export async function getSavedPosition(
  filePath: string,
): Promise<SavedPosition | null> {
  const s = await getStore(STORE_FILE);
  const entry = await s.get<SavedPosition>(filePath);
  if (!entry) return null;
  // Backcompat: old entries may lack trackIndex
  if (entry.trackIndex === undefined) {
    return { ...entry, trackIndex: 0 };
  }
  return entry;
}

export async function removePosition(filePath: string): Promise<void> {
  const s = await getStore(STORE_FILE);
  await s.delete(filePath);
}

/**
 * Where playback should start for a book: the saved spot, or the beginning.
 * Positions under 10 seconds are treated as the beginning — they are almost
 * always a mis-tap rather than real progress.
 */
export async function getResumePoint(
  filePath: string,
): Promise<{ position: number; trackIndex: number }> {
  const saved = await getSavedPosition(filePath);
  if (saved && (saved.position > 10 || saved.trackIndex > 0)) {
    return { position: saved.position, trackIndex: saved.trackIndex };
  }
  return { position: 0, trackIndex: 0 };
}

let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoSave(
  getState: () => {
    filePath: string;
    currentTime: number;
    duration: number;
    trackIndex: number;
  },
): void {
  stopAutoSave();
  autoSaveTimer = setInterval(async () => {
    const { filePath, currentTime, duration, trackIndex } = getState();
    if (filePath && currentTime > 0) {
      await savePosition(filePath, currentTime, duration, trackIndex);
    }
  }, AUTO_SAVE_INTERVAL);
}

export function stopAutoSave(): void {
  if (autoSaveTimer !== null) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}
