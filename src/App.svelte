<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { emit, listen } from "@tauri-apps/api/event";
  import Library from "./lib/components/Library.svelte";
  import PlayerView from "./lib/components/PlayerView.svelte";
  import TiersView from "./lib/components/TiersView.svelte";
  import SettingsPanel from "./lib/components/SettingsPanel.svelte";
  import ResumeDialog from "./lib/components/ResumeDialog.svelte";
  import Toast from "./lib/components/Toast.svelte";
  import { showToast } from "./lib/stores/toastStore";
  import { audioStore, togglePlay, skip, setVolume, toggleMute } from "./lib/stores/audioStore";
  import { userdataStore, loadUserData, getDisplayTitle, getDisplayAuthor, getDisplayCover } from "./lib/stores/userdataStore";
  import { loadBookmarks } from "./lib/stores/bookmarkStore";
  import { loadStatistics } from "./lib/stores/statisticsStore";
  import { loadTierLists } from "./lib/stores/tierListStore";
  import { THEME_PRESETS } from "./lib/themes";
  import type { AppView } from "./lib/types";

  let activeView = $state<AppView>("library");
  let settingsOpen = $state(false);

  // Track which book triggered the last auto-nav, so we only switch once per new book
  let lastAutoNavBook = $state<string | null>(null);

  onMount(() => {
    loadUserData();
    loadBookmarks();
    loadStatistics();
    loadTierLists();

    window.addEventListener("keydown", (e) => {
      // Don't handle shortcuts when typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      switch (e.key) {
        case "Escape":
          if (activeView !== "library") activeView = "library";
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
    listen<{ action: string }>("mini-player-command", (event) => {
      const { action } = event.payload;
      if (action === "toggle-play") togglePlay();
      else if (action === "skip-forward") skip(30);
      else if (action === "skip-back") skip(-30);
    });
  });

  // Emit state to mini player — throttled to 1x/sec for time, immediate for play state
  let miniEmitTimer: ReturnType<typeof setTimeout> | null = null;
  let lastMiniEmitPlaying: boolean | null = null;

  $effect(() => {
    const book = $audioStore.currentBook;
    const playing = $audioStore.playing;
    const currentTime = $audioStore.currentTime;
    const duration = $audioStore.duration;
    const speed = $audioStore.speed;

    if (!book) return;

    const userData = $userdataStore.books[book.filePath];
    const prefs = $userdataStore.preferences;
    const preset = THEME_PRESETS.find((t) => t.id === prefs.colorTheme) || THEME_PRESETS[0];
    const themeColors = prefs.theme === "dark" ? preset.dark : preset.light;
    const payload = {
      playing,
      currentTime,
      duration,
      title: userData?.titleOverride || book.title,
      author: userData?.authorOverride || book.author,
      coverArt: userData?.coverArtOverride || book.coverArt,
      speed,
      isDark: prefs.theme === "dark",
      primary: themeColors.primary,
      gradientFrom: themeColors.gradientFrom,
      gradientTo: themeColors.gradientTo,
    };

    // Emit immediately for play/pause changes
    if (playing !== lastMiniEmitPlaying) {
      lastMiniEmitPlaying = playing;
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
      width: 320,
      height: 88,
      resizable: false,
      alwaysOnTop: true,
      decorations: false,
      skipTaskbar: true,
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
    root.setProperty("--gradient-primary", `linear-gradient(145deg, ${colors.gradientFrom} 0%, ${colors.gradientTo} 100%)`);
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

    {#if activeView !== "player" && $audioStore.currentBook}
      {@const book = $audioStore.currentBook}
      {@const ud = $userdataStore.books[book.filePath]}
      {@const cover = getDisplayCover(book, ud)}
      {@const title = getDisplayTitle(book, ud)}
      {@const npProgress = $audioStore.duration > 0 ? ($audioStore.currentTime / $audioStore.duration) * 100 : 0}
      <div class="now-playing-bar">
        {#if cover}
          <div class="np-blur-bg" style="background-image: url('{cover}');"></div>
        {/if}
        <div class="np-progress-line" style:width="{npProgress}%"></div>
        <button class="np-info" onclick={() => (activeView = "player")}>
          <div class="np-cover">
            {#if cover}
              <img src={cover} alt="" />
            {:else}
              <span class="material-symbols-outlined np-cover-ph">auto_stories</span>
            {/if}
          </div>
          <span class="np-title">{title}</span>
        </button>
        <button class="np-play" onclick={togglePlay}>
          <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">
            {$audioStore.playing ? "pause" : "play_arrow"}
          </span>
        </button>
      </div>
    {/if}
  </div>

  <SettingsPanel
    open={settingsOpen}
    theme={$userdataStore.preferences.theme || "dark"}
    colorTheme={$userdataStore.preferences.colorTheme || "teal"}
    fontScale={$userdataStore.preferences.fontScale || "default"}
    fontFamily={$userdataStore.preferences.fontFamily || "editorial"}
    onclose={() => (settingsOpen = false)}
  />

  <ResumeDialog />
  <Toast />
</main>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  /* ======= SCROLLBAR — thin & subtle ======= */
  :global(*::-webkit-scrollbar) {
    width: 4px;
    height: 4px;
  }
  :global(*::-webkit-scrollbar-track) {
    background: transparent;
  }
  :global(*::-webkit-scrollbar-thumb) {
    background: var(--color-outline-variant);
    border-radius: 2px;
  }
  :global(*::-webkit-scrollbar-thumb:hover) {
    background: var(--color-outline);
  }

  /* ======= DYNAMIC ROOT SCALING ======= */
  /* Single font-size on html scales ALL rem values proportionally */
  :global(html) {
    font-size: clamp(13px, 12.13px + 0.229vw, 18px);
  }

  /* ======= LIGHT THEME ======= */
  :global(:root) {
    --color-bg: #faf9f5;
    --color-surface: #f5f4f0;
    --color-surface-container: #efeeea;
    --color-surface-high: #e9e8e4;
    --color-surface-highest: #e3e2df;
    --color-surface-lowest: #ffffff;
    --color-surface-dim: #dbdad6;

    --color-primary: #00595c;
    --color-primary-container: #0d7377;
    --color-primary-fixed-dim: #81d4d8;
    --color-on-primary: #ffffff;
    --color-on-primary-container: #a2f5f9;

    --color-secondary: #466365;
    --color-secondary-container: #c9e9ea;
    --color-on-secondary-container: #4c696b;

    --color-text: #1b1c1a;
    --color-text-variant: #3e4949;
    --color-outline: #6e7979;
    --color-outline-variant: #bec9c9;

    --color-error: #ba1a1a;

    /* Spacing — all in rem, scales with root font-size */
    --spacing-xs: 0.2rem;
    --spacing-sm: 0.45rem;
    --spacing-md: 0.75rem;
    --spacing-lg: 1.15rem;
    --spacing-xl: 1.6rem;

    --font-headline: "Newsreader", serif;
    --font-body: "Manrope", sans-serif;
    --font-label: "Manrope", sans-serif;
    --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

    /* Font sizes — fixed rem ratios, scale via root */
    --font-size-xs: 0.72rem;
    --font-size-sm: 0.82rem;
    --font-size-md: 0.92rem;
    --font-size-lg: 1.1rem;
    --font-size-xl: 1.35rem;
    --font-size-display: 1.6rem;

    --radius-sm: 0.15rem;
    --radius-md: 0.3rem;
    --radius-lg: 0.55rem;
    --radius-xl: 0.85rem;

    --shadow-ambient: 0 8px 32px rgba(27, 28, 26, 0.04);
    --shadow-card: 0 2px 8px rgba(27, 28, 26, 0.03);

    --gradient-primary: linear-gradient(145deg, #00595c 0%, #0d7377 100%);
  }

  /* ======= FONT FAMILY: MODERN — Inter + Source Serif + JetBrains Mono ======= */
  :global([data-font-family="modern"]) {
    --font-headline: "Source Serif 4", "Source Serif Pro", serif;
    --font-body: "Inter", sans-serif;
    --font-label: "Inter", sans-serif;
    --font-mono: "JetBrains Mono", ui-monospace, monospace;
  }

  /* ======= FONT SCALE: COMPACT — shifts root down ======= */
  :global([data-font="compact"]) {
    font-size: clamp(11px, 10.13px + 0.229vw, 15px);
  }

  /* ======= FONT SCALE: LARGE — shifts root up ======= */
  :global([data-font="large"]) {
    font-size: clamp(15px, 14.13px + 0.229vw, 21px);
  }

  /* ======= DARK THEME ======= */
  :global([data-theme="dark"]) {
    --color-bg: #0f0f10;
    --color-surface: #1a1a1c;
    --color-surface-container: #212123;
    --color-surface-high: #2c2c2e;
    --color-surface-highest: #3a3a3c;
    --color-surface-lowest: #141416;
    --color-surface-dim: #111113;

    --color-primary: #d4a039;
    --color-primary-container: #b8872e;
    --color-primary-fixed-dim: #ffd485;
    --color-on-primary: #1a1a1c;
    --color-on-primary-container: #ffe8c0;

    --color-secondary: #9e9894;
    --color-secondary-container: #3a3835;
    --color-on-secondary-container: #d4ceca;

    --color-text: #f0eded;
    --color-text-variant: #bdb9b7;
    --color-outline: #8a8786;
    --color-outline-variant: #444241;

    --color-error: #ff6b6b;

    --shadow-ambient: 0 8px 32px rgba(0, 0, 0, 0.3);
    --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.2);

    --gradient-primary: linear-gradient(145deg, #c89430 0%, #d4a039 100%);
  }

  :global(body) {
    font-family: var(--font-body);
    background: var(--color-bg);
    color: var(--color-text);
    overflow: hidden;
    height: 100vh;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* Micro-interactions */
  :global(button:active:not(:disabled)) {
    transform: scale(0.96);
  }

  /* Gradient accents on active/primary elements */
  :global(.filter-chip.active),
  :global(.option-btn.active),
  :global(.pv-speed.active) {
    background: var(--gradient-primary) !important;
    color: var(--color-on-primary) !important;
  }

  :global(.material-symbols-outlined) {
    font-family: "Material Symbols Outlined";
    font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24;
    display: inline-block;
    line-height: 1;
    text-transform: none;
    letter-spacing: normal;
    white-space: nowrap;
    direction: ltr;
  }

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

  /* Smooth view transitions */
  .app-content > :global(*) {
    animation: view-in 0.2s ease-out;
  }

  @keyframes view-in {
    from { opacity: 0; transform: translateX(6px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .now-playing-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--color-surface);
    border-top: 1px solid var(--color-outline-variant);
    padding: 0.4rem var(--spacing-md);
    flex-shrink: 0;
    position: relative;
    overflow: hidden;
  }

  .np-blur-bg {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    filter: blur(30px) saturate(1.5);
    opacity: 0.06;
    pointer-events: none;
  }

  .np-progress-line {
    position: absolute;
    top: 0;
    left: 0;
    height: 2px;
    background: var(--color-primary);
    transition: width 0.3s linear;
    z-index: 1;
  }

  .np-info {
    display: flex;
    align-items: center;
    gap: 10px;
    background: none;
    border: none;
    color: var(--color-text);
    cursor: pointer;
    padding: 2px;
    border-radius: var(--radius-md);
    min-width: 0;
    flex: 1;
    transition: background 0.15s;
    position: relative;
    z-index: 2;
  }

  .np-info:hover {
    background: var(--color-surface-high);
  }

  .np-cover {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--color-surface-high);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .np-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .np-cover-ph {
    font-size: 20px;
    color: var(--color-outline-variant);
  }

  .np-title {
    font-family: var(--font-headline);
    font-size: var(--font-size-sm);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .np-play {
    width: 2.2rem;
    height: 2.2rem;
    background: var(--gradient-primary);
    color: var(--color-on-primary);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: box-shadow 0.2s;
    position: relative;
    z-index: 2;
  }

  .np-play:hover {
    box-shadow: 0 0 12px color-mix(in srgb, var(--color-primary) 35%, transparent);
  }

  .np-play .material-symbols-outlined {
    font-size: 1.3rem;
  }
</style>
