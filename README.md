# ABPlayer

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/jhidalgo_dev)

A desktop audiobook player built with [Tauri v2](https://v2.tauri.app/) and [Svelte 5](https://svelte.dev/). Lightweight, fast, and fully offline.

<p align="center">
  <img src="docs/ABPlayer_Logo.png" alt="ABPlayer Logo" width="128" />
</p>

## Features

- **Playback** — MP3, M4A, M4B, MP4, OGG with chapter navigation, speed control (0.75x-3x), and resume prompts
- **Library** — Folder scanning, metadata extraction, cover art, search, sort/filter by status, genre, series, and collections
- **Audio processing** — 3-band equalizer, per-book volume gain, Web Audio API signal chain
- **Organization** — Bookmarks, collections with color tags, series grouping, batch operations
- **Extras** — Sleep timer, A-B repeat, waveform seekbar, listening statistics, mini-player window, 6 color themes
- **Keyboard shortcuts** — Space (play/pause), arrows (skip/volume), M (mute), Ctrl+F (search), Ctrl+Shift+P (global play/pause)

## Downloads

See the [Releases](../../releases) page for:
- **Portable** — Single `.exe`, no installation required
- **Installer** — Windows NSIS installer

---

## Architecture

### Overview

ABPlayer is a Tauri v2 desktop application with a Svelte 5 frontend and a Rust backend. All data stays local — no network calls, no accounts, no telemetry.

```
┌──────────────────────────────────────────────────────┐
│  Svelte 5 Frontend (WebView)                         │
│                                                      │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │ Library  │  │ Player   │  │ Mini-Player Window │  │
│  │  View    │  │  View    │  │  (separate WebView)│  │
│  └────┬─────┘  └────┬─────┘  └────────┬───────────┘  │
│       │              │                 │              │
│  ┌────┴──────────────┴─────────────────┴───────────┐ │
│  │           Svelte Stores (reactive state)        │ │
│  │  audioStore · libraryStore · positionStore      │ │
│  │  userdataStore · bookmarkStore · statisticsStore │ │
│  └────────────────────┬────────────────────────────┘ │
│                       │                              │
│          ┌────────────┴────────────┐                 │
│          │  @tauri-apps/plugin-store │                │
│          │  (JSON key-value on disk) │                │
│          └────────────┬────────────┘                 │
├───────────────────────┼──────────────────────────────┤
│  Rust Backend         │                              │
│                       │                              │
│  ┌────────────────────┴────────────────────────────┐ │
│  │  Tauri Commands (IPC)                           │ │
│  │  read_audio_meta · audiostream:// protocol      │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Audio Pipeline

Audio playback uses a custom `audiostream://` protocol registered in Rust, which serves local audio files with proper CORS headers. This is necessary because the Web Audio API's `createMediaElementSource` requires CORS-compliant responses — the default Tauri asset protocol does not provide these.

```
audiostream://localhost/{encoded-file-path}
    │
    ▼
Rust handler
    ├── URL-decodes the file path (percent-encoding crate)
    ├── Canonicalizes the path (prevents directory traversal)
    ├── Reads the file with Range request support (HTTP 206)
    ├── Sets CORS headers (Access-Control-Allow-Origin: *)
    ├── Sets Content-Type based on file extension
    └── Returns audio bytes with Cache-Control: immutable
```

On the frontend, the signal chain is:

```
HTMLAudioElement (src = audiostream://...)
    │
    ▼
MediaElementAudioSourceNode
    │
    ▼
BiquadFilterNode (lowshelf, 250 Hz)  ← Bass EQ
    │
    ▼
BiquadFilterNode (peaking, 1000 Hz)  ← Mid EQ
    │
    ▼
BiquadFilterNode (highshelf, 4000 Hz) ← Treble EQ
    │
    ▼
GainNode (per-book volume, -12 to +12 dB)
    │
    ▼
AudioContext.destination
```

All EQ parameter changes use `setTargetAtTime` for smooth transitions that prevent audio pops.

### Metadata Extraction

Metadata is extracted through a two-layer approach:

**Primary — Rust `lofty` crate** (called via Tauri IPC command `read_audio_meta`):
- Reads the file directly from disk (no WebView memory overhead)
- Extracts: title, artist, album, duration, cover art (as base64 data URL)
- Handles MP3 (ID3v2), M4A/M4B/MP4 (iTunes atoms), OGG (Vorbis comments)
- Cover art priority: `CoverFront` picture type first, then first available picture

**MP4/M4B Chapter Extraction** (custom Rust parser):
- Parses the MP4 `moov` atom tree manually (not via lofty — lofty doesn't expose chapters)
- Tries QuickTime chapters first (`tref` → `chap` track → `stco`/`co64` + `stsz` + `stts`)
- Falls back to Nero chapters (`udta` → `chpl` atom)
- Text samples decoded with UTF-8/UTF-16/Latin-1 detection
- All allocations capped at 16 MB to prevent OOM from malformed files

**Fallback — JS `music-metadata`** (frontend, first 2 MB):
- Used when Rust extraction returns no chapters
- Fetches the first 2 MB via the audiostream protocol
- Parses ID3v2 chapter frames (common in MP3 audiobooks)

**Duration fallback**: If the Rust crate returns 0 duration, a temporary `<audio>` element probes the file via the audiostream protocol to get the browser's duration reading.

### Library Indexing

The library is a flat list of `BookMeta` objects stored in `library.json` via Tauri's plugin-store.

**Scanning flow:**

1. User adds a folder → `readDir` recursively finds audio files (`.mp3`, `.m4a`, `.m4b`, `.mp4`, `.ogg`)
2. **Grouping** — Files in the same directory are grouped into a single multi-track book. Standalone formats (`.m4b`) are always treated as single-file books.
3. **Phase 1 (instant)** — Books are created with just file paths and folder-derived titles. The library renders immediately with placeholder data.
4. **Phase 2 (background enrichment)** — For each book, `extractMetadata` is called on the first track. Title, author, album, cover art, and duration are populated. Updates are batched (5 books per store update) to minimize reactive re-renders.
5. **Cover migration** — Base64 cover art from metadata is saved to `$APPDATA/covers/` as JPEG files. The library store is updated with asset-protocol URLs. This runs once; subsequent loads skip migration.
6. **Persistence** — The enriched library (with asset URLs, not base64) is saved to `library.json`.

**File watching**: After the initial scan, a recursive file watcher monitors all library folders. New or changed files trigger a debounced rescan (2-second delay after the last change event).

### Position & State Persistence

All app state is persisted via `@tauri-apps/plugin-store`, which writes JSON files to the OS app data directory (`%APPDATA%/com.abplayer.app/` on Windows).

| Store file | Contents |
|---|---|
| `library.json` | Book metadata, folder list, last scan timestamp |
| `positions.json` | Per-book playback position, track index, duration, last played timestamp |
| `bookmarks.json` | Named position markers per book (label, time, track index) |
| `statistics.json` | Listening time per day, books finished count, streaks |
| `userdata.json` | Per-book overrides (title, author, cover, genre, series, status, collections), user preferences (theme, sort, view mode), collection definitions |

**Position saving** follows a belt-and-suspenders approach:
- Auto-save every 10 seconds during playback via `setInterval`
- Immediate save on pause
- Save on window close via Tauri's `onCloseRequested` event (more reliable than the browser's `beforeunload`)

**Resume logic**: When opening a book, if a saved position exists and is past 10 seconds (or on a track beyond the first), a resume prompt is shown. Positions below 10 seconds are treated as "not started" to avoid prompting for accidental plays.

### Security Model

- **Content Security Policy** — Restrictive CSP blocks `unsafe-eval`, `object` embeds, and unauthorized origins. Only `self`, Google Fonts, and the custom protocols (`audiostream://`, `asset://`) are allowed.
- **Per-window capabilities** — The main window has full Tauri permissions. The mini-player window only has event emission and window management (no filesystem, dialog, or store access).
- **Path traversal prevention** — The audiostream protocol handler canonicalizes all file paths before serving, preventing `../` directory traversal attacks.
- **Allocation limits** — MP4 chapter parsing caps all allocations at 16 MB and sample expansion at 100K entries, preventing OOM from malformed files.
- **Error sanitization** — Rust errors return generic messages to the frontend; full paths are only logged server-side.
- **Import validation** — Library import validates JSON structure, schema version, entry types, and collection references before processing.

### Project Structure

```
src/                              # Svelte 5 frontend
  App.svelte                      # Root layout: sidebar + library/player views
  MiniPlayer.svelte               # Separate mini-player window
  lib/
    components/                   # UI components (BookCard, Player, Library, etc.)
    stores/                       # Reactive stores
      audioStore.ts               # Playback state, Web Audio API, track management
      libraryStore.ts             # Book scanning, indexing, folder management
      positionStore.ts            # Position save/load, auto-save, resume prompt
      userdataStore.ts            # User overrides, collections, preferences
      bookmarkStore.ts            # Named position markers
      statisticsStore.ts          # Listening time tracking
      sleepTimerStore.ts          # Sleep timer logic
      storeUtils.ts               # Shared plugin-store cache
    utils/
      metadata.ts                 # Metadata extraction (Rust IPC + JS fallback)
      coverStorage.ts             # Base64 → disk migration, asset URL resolution
      format.ts                   # Time formatting, progress calculation
      sort.ts                     # Natural sort, library sort/filter
    types.ts                      # TypeScript type definitions
    themes.ts                     # 6 color theme presets
src-tauri/                        # Rust backend
  src/lib.rs                      # Tauri commands, audiostream protocol, MP4 parser
  capabilities/
    main.json                     # Full permissions (main window)
    mini-player.json              # Minimal permissions (mini-player)
  tauri.conf.json                 # App config, CSP, bundle settings
```

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)

### Development

```bash
npm install
npm run tauri dev
```

### Production Build

```bash
npm run tauri build
```

Outputs:
- `src-tauri/target/release/abplayer.exe` (portable)
- `src-tauri/target/release/bundle/nsis/ABPlayer_*_x64-setup.exe` (installer)

## Support

Created by **jhidalgo_dev**

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/jhidalgo_dev)

---

All rights reserved. This source code is provided for viewing purposes. See the repository for download links.
