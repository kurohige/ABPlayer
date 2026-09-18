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
  /** For single-file books: path to file. For multi-file: path to folder. For fileless: "fileless:<id>". */
  filePath: string;
  title: string;
  author: string;
  album: string;
  /** Total duration across all tracks. */
  duration: number;
  coverArt: string | null;
  chapters: Chapter[];
  /** Where the chapters came from; absent when there are none (or for books scanned before this existed). */
  chapterSource?: "embedded" | "sidecar";
  /** Multiple files in one folder → ordered tracks. Empty for single-file books. */
  tracks: TrackInfo[];
  /** True when this book has no local audio file (created via "Log a book"). */
  fileless?: boolean;
  /**
   * Set on a book made of files that do not simply share a subfolder:
   * "auto" when the scanner matched them by album or file name, "manual"
   * when the user combined them. Its filePath is a "group:…" key.
   */
  grouped?: "auto" | "manual";
}

/** Files the user combined into one book; survives rescans. */
export interface BookGroup {
  id: string;
  title: string;
  /** Track files in playing order. */
  trackPaths: string[];
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
  groups?: BookGroup[];
  /** Folder paths and auto-group keys the user split; the scanner leaves them as single files. */
  splitKeys?: string[];
}

// --- User Data (overrides, organization, preferences) ---

export type BookStatus = "not_started" | "in_progress" | "finished";

export type BookSource = "Audible" | "Library" | "Physical" | "Other" | null;

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
  // --- Extended metadata (tiers / detail page) ---
  narrator: string | null;
  description: string | null;
  notes: string | null;
  quotes: string[];
  tags: string[];
  yearRead: number | null;
  publishYear: number | null;
  source: BookSource;
  /** Per-book axis scores, keyed by axis label. 0-10 integers. */
  axes: Record<string, number>;
  /** Ordered axis labels for this book (null = inherit from default list). */
  axisLabels: string[] | null;
}

export interface Collection {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

// --- Tier Lists ---

export interface Tier {
  id: string;
  /** Short label rendered in the color cell / badge circle (e.g. "S"). */
  label: string;
  /** Longer sub-label under the letter (e.g. "GOAT"). Optional. */
  name: string | null;
  /** Hex color. */
  color: string;
  order: number;
}

export type TierScope = "all" | "finished" | "in_progress";

export interface TierList {
  id: string;
  name: string;
  description: string | null;
  scope: TierScope;
  createdAt: string;
  updatedAt: string;
  tiers: Tier[];
  /** bookFilePath -> tier.id */
  assignments: Record<string, string>;
  /** Axis labels suggested when a book is first ranked in this list. */
  defaultAxes: string[];
}

export type SortBy = "title" | "author" | "recent" | "status" | "series";
export type FilterStatus = "all" | BookStatus;

export type AppTheme = "light" | "dark";
export type AppView = "library" | "player" | "tiers";

export type FontScale = "compact" | "default" | "large";
export type FontFamily = "editorial" | "modern";

/** Global playback settings, remembered between sessions. */
export interface AudioSettings {
  /** Playback rate (0.5–3). */
  speed: number;
  /** 0–1. */
  volume: number;
  muted: boolean;
  /** EQ band gains in dB (-12..12). */
  eqBass: number;
  eqMid: number;
  eqTreble: number;
}

/** A named set of EQ band gains (dB). Built-ins live in utils/eqPresets.ts. */
export interface EqPreset {
  name: string;
  bass: number;
  mid: number;
  treble: number;
}

export interface UserPreferences {
  viewMode: "grid" | "list";
  sortBy: SortBy;
  filterStatus: FilterStatus;
  filterCollection: string | null;
  /** Currently selected tier filter (tier.id within the default list), or null. */
  filterTier: string | null;
  theme: AppTheme;
  colorTheme: string;
  miniPlayer: boolean;
  fontScale: FontScale;
  fontFamily: FontFamily;
  defaultTierListId: string | null;
  audio: AudioSettings;
  /** The user's own EQ presets; the built-ins are not stored. */
  eqPresets: EqPreset[];
  /** Force the reduced-motion path on regardless of the OS setting. */
  reduceMotion: boolean;
  /** Fold loose chapter files that share an album or file name into one book when scanning. */
  autoGroupFiles: boolean;
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
  tierLists?: TierList[];
  groups?: BookGroup[];
}
