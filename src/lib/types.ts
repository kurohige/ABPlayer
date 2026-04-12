export interface Chapter {
  title: string;
  startTimeMs: number;
}

export interface TrackInfo {
  filePath: string;
  title: string;
  duration: number;
  order: number;
}

export interface BookMeta {
  /** For single-file books: path to file. For multi-file: path to folder. */
  filePath: string;
  title: string;
  author: string;
  album: string;
  /** Total duration across all tracks. */
  duration: number;
  coverArt: string | null;
  chapters: Chapter[];
  /** Multiple files in one folder → ordered tracks. Empty for single-file books. */
  tracks: TrackInfo[];
}

export interface Bookmark {
  id: string;
  bookFilePath: string;
  name: string;
  position: number;
  trackIndex: number;
  createdAt: string;
}

export interface SavedPosition {
  position: number;
  duration: number;
  lastPlayed: string;
  /** Index of the track being played (0 for single-file books). */
  trackIndex: number;
}

export interface ListeningSession {
  bookFilePath: string;
  startedAt: string;
  durationSecs: number;
}

export interface StatsData {
  totalListeningTimeSecs: number;
  sessionsLog: ListeningSession[];
  booksFinishedCount: number;
  longestStreakDays: number;
  currentStreakDays: number;
  lastListenedDate: string | null;
}

export interface LibraryIndex {
  folders: string[];
  books: BookMeta[];
  lastScan: string;
}

// --- User Data (overrides, organization, preferences) ---

export type BookStatus = "not_started" | "in_progress" | "finished";

export interface UserBookData {
  titleOverride: string | null;
  authorOverride: string | null;
  coverArtOverride: string | null;
  collections: string[]; // collection IDs
  status: BookStatus;
  genre: string | null;
  series: string | null;
  seriesOrder: number | null;
  gainDb: number | null;
  dateAdded: string;
  dateFinished: string | null;
}

export interface Collection {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export type SortBy = "title" | "author" | "recent" | "status" | "series";
export type FilterStatus = "all" | BookStatus;

export type AppTheme = "light" | "dark";
export type AppView = "library" | "player";

export type FontScale = "compact" | "default" | "large";

export interface UserPreferences {
  viewMode: "grid" | "list";
  sortBy: SortBy;
  filterStatus: FilterStatus;
  filterCollection: string | null;
  theme: AppTheme;
  colorTheme: string;
  miniPlayer: boolean;
  fontScale: FontScale;
}

export interface UserDataStore {
  books: Record<string, UserBookData>;
  collections: Collection[];
  preferences: UserPreferences;
}

export interface ExportData {
  version: number;
  exportedAt: string;
  books: Record<
    string,
    BookMeta & { userData: UserBookData; position: SavedPosition | null }
  >;
  collections: Collection[];
  preferences: UserPreferences;
}
