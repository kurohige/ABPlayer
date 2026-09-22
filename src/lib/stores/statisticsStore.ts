import { writable, get } from "svelte/store";
import type { Collection, StatsData, ListeningSession } from "../types";
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
      statisticsStore.set({ ...DEFAULT_STATS, ...data, secsByBook: data.secsByBook ?? secsFromSessions(data.sessionsLog ?? []) });
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

/** Per-book totals were not kept before 1.7; start them from what the session log still holds. */
export function secsFromSessions(sessions: ListeningSession[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const s of sessions) totals[s.bookFilePath] = (totals[s.bookFilePath] ?? 0) + s.durationSecs;
  return totals;
}

function todayDateStr(): string {
  return new Date().toISOString().split("T")[0];
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.round(Math.abs(a - b) / (1000 * 60 * 60 * 24));
}

async function logSession(
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
      secsByBook: {
        ...s.secsByBook,
        [bookFilePath]: (s.secsByBook?.[bookFilePath] ?? 0) + durationSecs,
      },
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

export interface CollectionTime {
  id: string;
  name: string;
  color: string;
  /** Books currently in the collection. */
  books: number;
  totalSecs: number;
  /** Of which in the last 7 days. */
  weekSecs: number;
}

/**
 * Listening time per collection, most listened first. A book in two
 * collections counts towards both, so the rows do not add up to the overall
 * total. Collections nobody has listened to yet are listed too, at zero.
 */
export function getCollectionBreakdown(
  stats: StatsData,
  userBooks: Record<string, { collections?: string[] }>,
  collections: Collection[],
): CollectionTime[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString();
  const weekByBook: Record<string, number> = {};
  for (const s of stats.sessionsLog) {
    if (s.startedAt > cutoffStr) {
      weekByBook[s.bookFilePath] = (weekByBook[s.bookFilePath] ?? 0) + s.durationSecs;
    }
  }
  const totalByBook = stats.secsByBook ?? secsFromSessions(stats.sessionsLog);

  return collections
    .map((c) => {
      const members = Object.entries(userBooks)
        .filter(([, ud]) => ud.collections?.includes(c.id))
        .map(([fp]) => fp);
      return {
        id: c.id,
        name: c.name,
        color: c.color,
        books: members.length,
        totalSecs: members.reduce((sum, fp) => sum + (totalByBook[fp] ?? 0), 0),
        weekSecs: members.reduce((sum, fp) => sum + (weekByBook[fp] ?? 0), 0),
      };
    })
    .sort((a, b) => b.totalSecs - a.totalSecs || a.name.localeCompare(b.name));
}
