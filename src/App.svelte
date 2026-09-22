<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { LogicalSize } from "@tauri-apps/api/dpi";
  import { emit, listen } from "@tauri-apps/api/event";
  import Library from "./lib/components/Library.svelte";
  import PlayerView from "./lib/components/PlayerView.svelte";
  import TiersView from "./lib/components/TiersView.svelte";
  import SettingsPanel from "./lib/components/SettingsPanel.svelte";
  import Toast from "./lib/components/Toast.svelte";
  import ShortcutsSheet from "./lib/components/ShortcutsSheet.svelte";
  import { showToast } from "./lib/stores/toastStore";
  import { initMediaSession } from "./lib/stores/mediaSession";
  import { audioStore, togglePlay, skip, seek, setVolume, toggleMute, applyAudioSettings } from "./lib/stores/audioStore";
  import { userdataStore, loadUserData, getDisplayTitle } from "./lib/stores/userdataStore";
  import { loadBookmarks } from "./lib/stores/bookmarkStore";
  import { loadStatistics } from "./lib/stores/statisticsStore";
  import { loadTierLists } from "./lib/stores/tierListStore";
  import { THEME_PRESETS } from "./lib/themes";
  import type { AppView } from "./lib/types";

  let activeView = $state<AppView>("library");
  let settingsOpen = $state(false);
  let shortcutsOpen = $state(false);

  // Track which book triggered the last auto-nav, so we only switch once per new book
  let lastAutoNavBook = $state<string | null>(null);

  onMount(() => {
    // Restore remembered speed / volume / mute / EQ once preferences are in
    loadUserData().then(() => applyAudioSettings(get(userdataStore).preferences.audio));
    loadBookmarks();
    loadStatistics();
    loadTierLists();
    // Media keys and the system media overlay follow the audio store from here on
    initMediaSession();

    window.addEventListener("keydown", (e) => {
      // Don't handle shortcuts when typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      switch (e.key) {
        case "Escape":
          // Whatever is open — a menu, a dialog, the settings sheet — gets the
          // key first and marks it handled. Those listeners were added after
          // this one, so decide once they have all run. A task, not a
          // microtask: the browser runs microtasks between event listeners.
          setTimeout(() => {
            if (e.defaultPrevented) return;
            if (shortcutsOpen) shortcutsOpen = false;
            else if (activeView !== "library") activeView = "library";
          }, 0);
          break;
        case "?":
          e.preventDefault();
          shortcutsOpen = !shortcutsOpen;
          break;
        case " ":
          e.preventDefault();
          if ($audioStore.currentBook) togglePlay();
          break;
        case "ArrowLeft":
          if ($audioStore.currentBook) skip(-30);
          break;
        case "ArrowRight":
          if ($audioStore.currentBook) skip(30);
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume(Math.min(1, $audioStore.volume + 0.05));
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume(Math.max(0, $audioStore.volume - 0.05));
          break;
        case "m":
        case "M":
          toggleMute();
          break;
      }
    });

    // Register global shortcuts (work even when app is not focused)
    import("@tauri-apps/plugin-global-shortcut").then(({ register, unregisterAll }) => {
      register("CommandOrControl+Shift+P", (e) => {
        if (e.state === "Pressed" && $audioStore.currentBook) togglePlay();
      }).catch((e) => console.warn("Failed to register Ctrl+Shift+P:", e));
      register("CommandOrControl+Shift+M", (e) => {
        if (e.state === "Pressed") openMiniPlayer();
      }).catch((e) => console.warn("Failed to register Ctrl+Shift+M:", e));

      // Unregister all on window close
      window.addEventListener("beforeunload", () => {
        unregisterAll().catch(() => {});
      });
    });

    // Listen for commands from mini player
    listen<{ action: string; time?: number }>("mini-player-command", (event) => {
      const { action, time } = event.payload;
      if (action === "toggle-play") togglePlay();
      else if (action === "skip-forward") skip(30);
      else if (action === "skip-back") skip(-30);
      else if (action === "seek" && typeof time === "number" && Number.isFinite(time)) seek(time);
    });
  });

  // Emit state to mini player — throttled to 1x/sec for time, immediate for play/loading state
  let miniEmitTimer: ReturnType<typeof setTimeout> | null = null;
  let lastMiniEmitPlaying: boolean | null = null;
  let lastMiniEmitLoading: boolean | null = null;
  let lastMiniEmitError: string | null = null;

  $effect(() => {
    const book = $audioStore.currentBook;
    const playing = $audioStore.playing;
    const loading = $audioStore.loading;
    const currentTime = $audioStore.currentTime;
    const duration = $audioStore.duration;
    const speed = $audioStore.speed;
    const error = $audioStore.error;
    const chapters = $audioStore.chapters;
    const chapterIndex = $audioStore.currentChapterIndex;
    const trackIndex = $audioStore.currentTrackIndex;
    const totalTracks = $audioStore.totalTracks;

    if (!book) return;

    const userData = $userdataStore.books[book.filePath];
    const prefs = $userdataStore.preferences;
    const preset = THEME_PRESETS.find((t) => t.id === prefs.colorTheme) || THEME_PRESETS[0];
    const themeColors = prefs.theme === "dark" ? preset.dark : preset.light;
    const payload = {
      playing,
      loading,
      currentTime,
      duration,
      title: userData?.titleOverride || book.title,
      author: userData?.authorOverride || book.author,
      coverArt: userData?.coverArtOverride || book.coverArt,
      speed,
      // Opens the mini player's subtitle line: where you are in a book made of
      // several files, else the chapter of the one file.
      chapter:
        totalTracks > 1
          ? `Track ${trackIndex + 1}/${totalTracks}`
          : chapters.length > 0 && chapterIndex >= 0
            ? `Ch ${chapterIndex + 1}`
            : "",
      error,
      isDark: prefs.theme === "dark",
      primary: themeColors.primary,
    };

    // Emit immediately for play/pause or loading changes — the spinner needs
    // to appear in the mini-player the instant the user clicks play, not
    // up to a second later when the throttled timer fires.
    if (
      playing !== lastMiniEmitPlaying ||
      loading !== lastMiniEmitLoading ||
      error !== lastMiniEmitError
    ) {
      lastMiniEmitPlaying = playing;
      lastMiniEmitLoading = loading;
      lastMiniEmitError = error;
      emit("mini-player-state", payload);
      return;
    }

    // Throttle time updates to 1/sec
    if (!miniEmitTimer) {
      miniEmitTimer = setTimeout(() => {
        miniEmitTimer = null;
        emit("mini-player-state", payload);
      }, 1000);
    }
  });

  /** The mini player's frame size (handoff 1g); the window never resizes. */
  const MINI_W = 360;
  const MINI_H = 104;

  async function openMiniPlayer() {
    // Check if mini player already exists
    const existing = await WebviewWindow.getByLabel("mini-player");
    if (existing) {
      await existing.setFocus();
      return;
    }

    const mini = new WebviewWindow("mini-player", {
      url: "/mini-player.html",
      title: "ABPlayer Mini",
      width: MINI_W,
      height: MINI_H,
      resizable: false,
      alwaysOnTop: true,
      decorations: false,
      // The strip has rounded corners; without this they would be filled in
      transparent: true,
      skipTaskbar: true,
    });

    mini.once("tauri://created", () => {
      // The window-state plugin restores the size this window had last time,
      // overriding the one above — which for anyone who used 1.6 is the old
      // 320×88. The layout is fixed, so put it back. Position is left alone:
      // where the user parked the widget is worth remembering.
      mini.setSize(new LogicalSize(MINI_W, MINI_H)).catch(() => {});
    });

    mini.once("tauri://error", (e) => {
      console.error("Mini player creation error:", e);
    });
  }

  // Auto-switch to player only when a NEW book is loaded (not when returning from library)
  $effect(() => {
    const book = $audioStore.currentBook;
    if (book && book.filePath !== lastAutoNavBook) {
      lastAutoNavBook = book.filePath;
      activeView = "player";
      const ud = $userdataStore.books[book.filePath];
      showToast(ud?.titleOverride || book.title, "play_circle");
    }
  });

  // Toast when a book is finished
  let lastBookStatus = $state<string | null>(null);
  $effect(() => {
    const book = $audioStore.currentBook;
    if (!book) return;
    const ud = $userdataStore.books[book.filePath];
    const status = ud?.status || "not_started";
    if (status === "finished" && lastBookStatus !== "finished") {
      showToast("Book finished!", "check_circle");
    }
    lastBookStatus = status;
  });

  // Apply theme + font scale + color theme
  $effect(() => {
    const prefs = $userdataStore.preferences;
    document.documentElement.setAttribute("data-theme", prefs.theme || "dark");
    // Reduced motion: the preference forces it on; otherwise follow the OS
    const osReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.setAttribute(
      "data-reduce-motion",
      prefs.reduceMotion || osReduce ? "on" : "off",
    );
    document.documentElement.setAttribute("data-font", prefs.fontScale || "default");
    document.documentElement.setAttribute("data-font-family", prefs.fontFamily || "editorial");

    // Apply color theme preset
    const preset = THEME_PRESETS.find((t) => t.id === prefs.colorTheme) || THEME_PRESETS[0];
    const colors = prefs.theme === "dark" ? preset.dark : preset.light;
    const root = document.documentElement.style;
    root.setProperty("--color-primary", colors.primary);
    root.setProperty("--color-primary-container", colors.primaryContainer);
    root.setProperty("--color-primary-fixed-dim", colors.primaryFixedDim);
    root.setProperty("--color-on-primary", colors.onPrimary);
    root.setProperty("--color-on-primary-container", colors.onPrimaryContainer);
  });

  // Update window title with book progress
  let lastTitlePct = $state(-1);
  $effect(() => {
    const book = $audioStore.currentBook;
    if (book && $audioStore.duration > 0) {
      const pct = Math.round(($audioStore.currentTime / $audioStore.duration) * 100);
      if (pct !== lastTitlePct) {
        lastTitlePct = pct;
        const userData = $userdataStore.books[book.filePath];
        const name = getDisplayTitle(book, userData);
        getCurrentWindow().setTitle(`${name} \u2014 ${pct}% | ABPlayer`);
      }
    } else if (lastTitlePct !== -1) {
      lastTitlePct = -1;
      getCurrentWindow().setTitle("ABPlayer");
    }
  });
</script>

<main class="app">
  <!-- Left sidebar navigation (desktop standard) -->
  <nav class="sidebar">
    <button class="sidebar-btn" class:active={activeView === "library"} onclick={() => (activeView = "library")} title="Library">
      <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' {activeView === 'library' ? 1 : 0};">library_books</span>
    </button>
    <button class="sidebar-btn" class:active={activeView === "player"} onclick={() => (activeView = "player")} title="Now Playing" disabled={!$audioStore.currentBook}>
      <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' {activeView === 'player' ? 1 : 0};">headphones</span>
    </button>
    <button class="sidebar-btn" class:active={activeView === "tiers"} onclick={() => (activeView = "tiers")} title="Tiers">
      <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' {activeView === 'tiers' ? 1 : 0};">format_list_numbered</span>
    </button>
    <div class="sidebar-spacer"></div>
    <button class="sidebar-btn" onclick={() => (settingsOpen = true)} title="Settings">
      <span class="material-symbols-outlined">settings</span>
    </button>
  </nav>

  <div class="app-main">
    <div class="app-content">
      {#if activeView === "library"}
        <Library
          onnavtoplayer={() => (activeView = "player")}
        />
      {:else if activeView === "tiers"}
        <TiersView />
      {:else}
        <PlayerView onback={() => (activeView = "library")} onminiplayer={openMiniPlayer} />
      {/if}
    </div>

    <!-- No bottom play bar (handoff 1a): the library's continue card is the
         docked player, and the sidebar's headphones opens the full one. -->
  </div>

  <SettingsPanel
    open={settingsOpen}
    theme={$userdataStore.preferences.theme || "dark"}
    colorTheme={$userdataStore.preferences.colorTheme || "teal"}
    fontScale={$userdataStore.preferences.fontScale || "default"}
    fontFamily={$userdataStore.preferences.fontFamily || "editorial"}
    reduceMotion={$userdataStore.preferences.reduceMotion}
    autoGroupFiles={$userdataStore.preferences.autoGroupFiles !== false}
    onclose={() => (settingsOpen = false)}
  />

  {#if shortcutsOpen}
    <ShortcutsSheet onclose={() => (shortcutsOpen = false)} />
  {/if}

  <Toast />
</main>

<style>
  .app {
    display: flex;
    height: 100vh;
  }

  /* Left sidebar navigation */
  .sidebar {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 3.5rem;
    padding: 0.75rem 0;
    gap: 0.25rem;
    background: var(--color-surface);
    border-right: 1px solid var(--color-outline-variant);
    flex-shrink: 0;
  }

  .sidebar-btn {
    width: 2.5rem;
    height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--color-text-variant);
    cursor: pointer;
    border-radius: var(--radius-lg);
    transition: color 0.15s, background 0.15s;
  }

  .sidebar-btn:hover {
    background: var(--color-surface-high);
    color: var(--color-text);
  }

  .sidebar-btn.active {
    color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  }

  .sidebar-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .sidebar-btn .material-symbols-outlined {
    font-size: 1.4rem;
  }

  .sidebar-spacer {
    flex: 1;
  }

  .app-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .app-content {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
  }

  /* Every view fills the content area and may shrink below its content: a
     flex item's default min-width is its min-content width, and the library
     header's non-wrapping controls would otherwise hold the whole column at
     ~600px, with the card and grid laid out past the window's edge (handoff:
     "the header clips, the search field shrinks").
     Entrance is a fade only: a transform here would move the cover the
     flight is measuring its landing spot against (utils/coverFlight.ts). */
  .app-content > :global(*) {
    flex: 1;
    min-width: 0;
    animation: ab-fade var(--motion-overlay) var(--ease-out) both;
  }

</style>
