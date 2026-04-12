import { writable } from "svelte/store";
import type { SavedPosition } from "../types";
import { getStore } from "./storeUtils";

const STORE_FILE = "positions.json";
const AUTO_SAVE_INTERVAL = 10_000;

export const resumePrompt = writable<{
  visible: boolean;
  filePath: string;
  position: number;
  trackIndex: number;
  onResume: () => void;
  onRestart: () => void;
}>({
  visible: false,
  filePath: "",
  position: 0,
  trackIndex: 0,
  onResume: () => {},
  onRestart: () => {},
});

const emptyPrompt = {
  visible: false,
  filePath: "",
  position: 0,
  trackIndex: 0,
  onResume: () => {},
  onRestart: () => {},
};

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

export async function checkAndPromptResume(
  filePath: string,
  onResume: (position: number, trackIndex: number) => void,
  onRestart: () => void,
): Promise<void> {
  const saved = await getSavedPosition(filePath);
  if (saved && (saved.position > 10 || saved.trackIndex > 0)) {
    resumePrompt.set({
      visible: true,
      filePath,
      position: saved.position,
      trackIndex: saved.trackIndex,
      onResume: () => {
        resumePrompt.set(emptyPrompt);
        onResume(saved.position, saved.trackIndex);
      },
      onRestart: () => {
        resumePrompt.set(emptyPrompt);
        onRestart();
      },
    });
  } else {
    onRestart();
  }
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
