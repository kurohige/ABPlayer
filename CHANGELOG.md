# Changelog

## v1.0.1 (2026-04-12)

### Bug Fixes
- **Cover art broken on startup and view switch** — CSP only allowed `https://asset.localhost` but Tauri generated `http://asset.localhost` cover URLs; added both schemes to all CSP directives
- **Asset URL scheme mismatch** — stored cover URLs now normalized through `convertFileSrc` on load, preventing http/https mismatches between debug and release builds
- **Redundant library reload on view switch** — `loadLibraryFromStore()` was called every time the Library component mounted (including view switches), resetting the store; now loads once per session

### Security Hardening
- **Content Security Policy** — enabled restrictive CSP in tauri.conf.json (was `null`/disabled); allows self, Google Fonts, audiostream, asset protocols (both http and https); blocks unsafe-eval and unauthorized origins
- **Per-window capabilities** — split `default.json` into `main.json` (full permissions) and `mini-player.json` (events + window only); mini-player no longer has filesystem, dialog, or store access
- **Asset protocol scope** — broadened to `**` to support cover art from any path; `probeDuration` and `extractChaptersJs` switched to audiostream protocol
- **CORS headers** — audiostream protocol uses permissive CORS (`*`) required for `crossOrigin="anonymous"` audio elements across dev/production origins
- **Error message sanitization** — Rust `read_audio_meta` errors no longer leak full filesystem paths to the frontend
- **Import data validation** — `importLibrary` now validates JSON structure, version number, entry types, and collection references before processing
- **Input sanitization** — BookEditDialog enforces `maxlength` on all text inputs, caps strings at 500 chars, validates series order as finite positive integer
- **Replaced custom URL decoder** — hand-rolled `url_decode` in Rust replaced with `percent-encoding` crate

### Code Quality
- **Shared store utility** — extracted repeated `getStore()` singleton pattern from 5 store files into `storeUtils.ts`
- **Sleep timer extracted** — moved sleep timer logic from audioStore (528 lines) into `sleepTimerStore.ts`
- **Dead code removed** — deleted unused `BottomNav.svelte` (replaced by sidebar)
- **Memory leak fixed** — search debounce timer in LibraryToolbar now cleaned up on component unmount
- **Null safety** — removed unsafe `!` non-null assertions on `getContext("2d")` in PlayerView and userdataStore
- **Bounds checking** — chapter index access in Player and PlayerView now guarded against out-of-range

### Rust Backend
- **Allocation size limits** — chapter extraction capped at 16 MB per allocation; malformed files can no longer trigger OOM
- **Sample count cap** — `stts` sample expansion limited to 100K per entry
- **Logging** — added `log::warn` for metadata extraction failures (file open, metadata read)
- **Dependencies** — added `percent-encoding 2`, `log 0.4`

### Accessibility
- **Dialog ARIA roles** — added `role="dialog"` and `aria-modal="true"` to EqualizerPanel, BookEditDialog, CollectionManager, StatsPanel, ResumeDialog
- **EQ label associations** — added `for`/`id` pairs to all 4 equalizer sliders (Bass, Mid, Treble, Book Volume)
- **Escape key handling** — dialogs now close on Escape keypress (EqualizerPanel, BookEditDialog, CollectionManager, StatsPanel)

### Performance
- **Cover migration optimized** — fast `some()` check skips full iteration on startup when no base64 covers remain

## v1.0.0 (2026-04-12)

### Features
- **Volume control** — slider + mute button in player bar and full player view
- **Window title progress** — shows "Book Title — 45% | ABPlayer" during playback
- **Remove books/folders** — remove individual books with confirmation; manage scanned folders from dropdown
- **Library search** — real-time filter by title/author with Ctrl+F shortcut
- **Genre field** — manual genre entry per book with autocomplete suggestions
- **Bookmarks** — named position markers per book, add/remove/seek in player view
- **Series/grouping** — manual series assignment with order number, series badge on cards, sort by series
- **Recently played** — horizontal scroll row of last 8 played books at top of library
- **Batch operations** — multi-select books via toolbar, bulk remove/status/collection actions
- **3-band equalizer** — bass/mid/treble (-12 to +12 dB) with smooth ramp transitions
- **Per-book gain** — manual volume normalization (-12 to +12 dB), persisted per book
- **Waveform progress bar** — deterministic SVG waveform with clip-path fill, replaces flat seekbar
- **Listening statistics** — total time, streaks, books finished, daily average, genre breakdown, pace
- **Preset color themes** — 6 palettes (Teal, Gold, Indigo, Rose, Forest, Slate) in settings
- **Mini player window** — separate frameless always-on-top Tauri window with event bridge
- **Now playing bar** — persistent bar at bottom of library view with cover, title, play/pause
- **Chapter-scoped seeking** — seekbar scopes to current chapter for precise navigation in M4B files

### Audio
- Web Audio API integration via custom `audiostream://` protocol with CORS headers
- Signal chain: source -> 3-band EQ -> gain node -> destination
- Smooth parameter transitions (setTargetAtTime) to prevent audio pops
- AudioContext lifecycle management with state recovery

### Security & Reliability
- Path traversal prevention in audiostream protocol (canonicalize + validate)
- Range request validation (416 for invalid ranges)
- Cache-Control headers for immutable audio files
- Reliable position save on window close via Tauri onCloseRequested (replaces beforeunload)
- Division-by-zero guards in statistics panel

### UX Polish
- **Keyboard shortcuts** — Space (play/pause), arrows (skip/volume), M (mute)
- **Audio error handling** — user-friendly messages for missing files, unsupported formats, corruption
- **Sleep timer** — 15/30/45/60 min presets + end-of-chapter, live countdown display
- **Folder remove confirmation** — shows affected book count before removing
- **Mini-player theming** — follows main window's dark/light mode and color preset
- **Import library** — merge JSON export with collections, positions, and user data
- **Drag-and-drop** — drop folders from file explorer to add to library
- **Loading skeleton** — pulsing placeholder cards during library scan
- **About section** — app version, creator credit, Buy Me a Coffee link in settings
- **Window state persistence** — remembers size/position via tauri-plugin-window-state
- **Toast notifications** — brief popups on book switch and book finished
- **Draggable mini-player** — frameless window can be moved around screen

### Medium Priority Features
- **A-B repeat** — set loop points A and B, audio loops between them, clears on book change
- **Global shortcuts** — Ctrl+Shift+P (play/pause), Ctrl+Shift+M (mini player), work when unfocused
- **File watcher** — auto-detects new files in library folders, debounced rescan
- **Cover art disk storage** — migrates base64 covers to $APPDATA/covers/ files, reduces memory
- **Progressive rendering** — renders 40 books at a time, loads more on scroll via IntersectionObserver

### Code Quality
- Removed dead CSS (old seekbar styles) and unused imports
- Throttled mini-player event emission (1/sec for time, immediate for play state)
- Capped full-file responses to 4MB initial chunk (uses Range for remainder)
- Global shortcuts properly unregistered on app close
- A-B repeat and sleep timer auto-clear when switching books
- File watchers cleaned up on component unmount
- Cover migration uses filePath matching (not array index) for batch safety
- File watcher debounce extracted to named constant

### Performance Optimization
- `timeupdate` handler (fires 4x/sec): eliminated separate `get()` call, all logic in single `update()` callback
- `play`/`pause` handlers: read state from update callback instead of separate `get()` + `update()`
- Library enrichment: batches 5 books per store update instead of 1 (80% fewer reactive re-renders during scan)
- A-B repeat functions: single `update()` call instead of `get()` + `update()`
- `pickCoverArt`: wrapped in try/catch for graceful error handling
- Removed all `audioElement!` non-null assertions in favor of local `const audio` reference

### UI Overhaul
- **Left sidebar navigation** — replaced bottom tab bar with narrow icon sidebar (desktop standard like Spotify/VS Code)
- **Dynamic root font-size scaling** — `html { font-size: clamp(13px, 12.13px + 0.229vw, 18px) }`, all sizes in `rem`, entire UI scales smoothly with window resize
- **Dark mode readability** — increased text contrast (#e5e2e3 -> #f0eded), boosted muted text and outlines
- **Dark mode dialogs fixed** — BookEditDialog, CollectionManager had hardcoded white backgrounds, now use `var(--color-surface)`
- **BookCard overlays fixed** — edit/remove buttons used white backgrounds, now theme-aware
- **Now-playing bar** — restored at bottom of library with cover, title, progress underline, blurred background
- **Player cover image enlarged** — 12rem circular cover with progress ring
- **Compact tools strip** — speed/volume/bookmark/EQ/sleep merged into one clean row with dividers
- **Hamburger menu removed** — sidebar handles navigation
- **Circular progress rings** — on book cards (replaces flat progress bars)
- **Active book EQ indicator** — animated equalizer bars on currently playing card
- **Material 3 filter chips** — pill container with gradient active state
- **Glassmorphism player** — blurred cover art as subtle background, dominant color extraction
- **Shimmer skeleton** — sweeping gradient loader instead of opacity pulse
- **Micro-interactions** — buttons scale 96% on press
- **Right-click context menu** — Play/Edit/Remove on book cards
- **Double-click to play** — single click no longer triggers playback
- **Keyboard grid navigation** — arrow keys + Enter in library
- **Bottom sheet EQ** — slides up from bottom instead of centered modal
- **Smooth view transitions** — 200ms fade+slide on view switch
- **All px converted to rem** — buttons, icons, padding, sidebar, player controls all scale with window
