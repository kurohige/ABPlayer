import { writable, get } from "svelte/store";
import type { StatsData, ListeningSession } from "../types";
import { getStore } from "./storeUtils";

const STORE_FILE = "statistics.json";

const DEFAULT_STATS: StatsData = {
  totalListeningTimeSecs: 0,
  sessionsLog: [],
  booksFinishedCount: 0,
  longestStreakDays: 0,
  currentStreakDays: 0,
  lastListenedDate: null,
};

export const statisticsStore = writable<StatsData>({ ...DEFAULT_STATS });

export async function loadStatistics(): Promise<void> {
  try {
    const s = await getStore(STORE_FILE);
    const data = await s.get<StatsData>("stats");
    if (data) {
      statisticsStore.set({ ...DEFAULT_STATS, ...data });
    }
  } catch (e) {
    console.warn("Failed to load statistics:", e);
  }
}

async function persist(): Promise<void> {
  try {
    const s = await getStore(STORE_FILE);
    await s.set("stats", get(statisticsStore));
  } catch (e) {
    console.warn("Failed to persist statistics:", e);
  }
}

function todayDateStr(): string {
  return new Date().toISOString().split("T")[0];
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.round(Math.abs(a - b) / (1000 * 60 * 60 * 24));
}

export async function logSession(
  bookFilePath: string,
  durationSecs: number,
): Promise<void> {
  const today = todayDateStr();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString();

  statisticsStore.update((s) => {
    const session: ListeningSession = {
      bookFilePath,
      startedAt: new Date().toISOString(),
      durationSecs,
    };

    // Prune old sessions
    const sessionsLog = [
      ...s.sessionsLog.filter((ss) => ss.startedAt > cutoffStr),
      session,
    ];

    // Update streak
    let { currentStreakDays, longestStreakDays, lastListenedDate } = s;
    if (!lastListenedDate || daysBetween(lastListenedDate, today) > 1) {
      currentStreakDays = 1;
    } else if (lastListenedDate !== today) {
      currentStreakDays += 1;
    }
    longestStreakDays = Math.max(longestStreakDays, currentStreakDays);

    return {
      ...s,
      totalListeningTimeSecs: s.totalListeningTimeSecs + durationSecs,
      sessionsLog,
      currentStreakDays,
      longestStreakDays,
      lastListenedDate: today,
    };
  });

  await persist();
}

export async function incrementBooksFinished(): Promise<void> {
  statisticsStore.update((s) => ({
    ...s,
    booksFinishedCount: s.booksFinishedCount + 1,
  }));
  await persist();
}

// --- Session tracker ---
let sessionStart: number | null = null;
let sessionBookPath: string | null = null;

export function onPlaybackStarted(bookFilePath: string): void {
  sessionStart = Date.now();
  sessionBookPath = bookFilePath;
}

export function onPlaybackPaused(): void {
  if (sessionStart && sessionBookPath) {
    const durationSecs = (Date.now() - sessionStart) / 1000;
    if (durationSecs > 5) {
      logSession(sessionBookPath, durationSecs);
    }
  }
  sessionStart = null;
  sessionBookPath = null;
}

// --- Derived helpers (computed from store) ---

export function getWeeklyTotal(stats: StatsData): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString();
  return stats.sessionsLog
    .filter((s) => s.startedAt > cutoffStr)
    .reduce((sum, s) => sum + s.durationSecs, 0);
}

export function getDailyAverage(stats: StatsData): number {
  return getWeeklyTotal(stats) / 7;
}

export function getGenreBreakdown(
  stats: StatsData,
  userBooks: Record<string, { genre: string | null }>,
): { genre: string; totalSecs: number }[] {
  const byGenre: Record<string, number> = {};
  for (const session of stats.sessionsLog) {
    const genre = userBooks[session.bookFilePath]?.genre || "Unknown";
    byGenre[genre] = (byGenre[genre] || 0) + session.durationSecs;
  }
  return Object.entries(byGenre)
    .map(([genre, totalSecs]) => ({ genre, totalSecs }))
    .sort((a, b) => b.totalSecs - a.totalSecs);
}
