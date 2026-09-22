<script lang="ts">
  /**
   * The always-on-top mini window (handoff 1g, 360×104). It is a separate
   * webview with no access to the stores, so the main window pushes it a
   * state payload and it pushes back commands. The strip itself is the
   * NowPlaying component, which is also the window's title bar: everything in
   * it that is not a control is a drag region.
   *
   * The window is created transparent (App.svelte), so the strip's rounded
   * corners are the real outline of the widget rather than a radius painted
   * over an opaque square.
   */
  import { onMount } from "svelte";
  import { listen, emit } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import NowPlaying from "./lib/components/NowPlaying.svelte";

  interface MiniState {
    playing: boolean;
    loading: boolean;
    currentTime: number;
    duration: number;
    title: string;
    author: string;
    coverArt: string | null;
    speed: number;
    /** "Ch 10" / "Track 2/14", already formatted by the main window. */
    chapter: string;
    /** The main window's playback error, if any — shown here since the
     *  click that caused it happened here. */
    error: string | null;
    isDark: boolean;
    primary: string;
  }

  let state = $state<MiniState>({
    playing: false,
    loading: false,
    currentTime: 0,
    duration: 0,
    title: "",
    author: "",
    coverArt: null,
    speed: 1,
    chapter: "",
    error: null,
    isDark: true,
    primary: "#4db6ac",
  });

  function sendCommand(action: string, time?: number) {
    emit("mini-player-command", { action, time });
  }

  async function closeMini() {
    await getCurrentWindow().close();
  }

  onMount(() => {
    const unlisten = listen<MiniState>("mini-player-state", (event) => {
      state = event.payload;
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  });

  // The window has its own root, so the theme attribute is set here rather
  // than by App.svelte's preference effect.
  $effect(() => {
    document.documentElement.setAttribute("data-theme", state.isDark ? "dark" : "light");
    document.documentElement.style.setProperty("--color-primary", state.primary);
  });

  let npState = $derived({
    playing: state.playing,
    loading: state.loading,
    currentTime: state.currentTime,
    duration: state.duration,
    title: state.title || "No book loaded",
    author: state.author,
    coverArt: state.coverArt,
    chapterLabel: state.chapter,
    speedLabel: state.speed !== 1 ? `${state.speed}×` : "",
    error: state.error,
  });
</script>

<div class="mp">
  <NowPlaying
    state={npState}
    onplay={() => sendCommand("toggle-play")}
    onskip={(s) => sendCommand(s < 0 ? "skip-back" : "skip-forward")}
    onseek={(t) => sendCommand("seek", t)}
  />
  <button class="mp-close" onclick={closeMini} aria-label="Close the mini player" title="Close">
    <span class="material-symbols-outlined" aria-hidden="true">close</span>
  </button>
</div>

<style>
  /* The window is fixed at 360×104 and never resizes, so the root font-size
     is pinned instead of following app.css's viewport clamp: 1rem is 16px
     here, which is the grid the mini-player design is drawn on. `html:root`
     outranks app.css's `html` whatever order the stylesheets land in. */
  :global(html:root) {
    font-size: 16px;
  }

  .mp {
    position: relative;
    width: 100vw;
    height: 100vh;
    /* Transparent window: only the strip's rounded frame is painted */
    background: transparent;
    overflow: hidden;
  }

  /* No decorations, so this is the only way to close the window from itself.
     Quiet until the pointer is over the strip. */
  .mp-close {
    position: absolute;
    top: 0.3rem;
    right: 0.3rem;
    z-index: 2;
    display: flex;
    padding: 0.1rem;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--color-outline);
    cursor: pointer;
    opacity: 0.35;
    transition:
      opacity var(--motion-fast) ease,
      color var(--motion-fast) ease;
  }

  .mp:hover .mp-close {
    opacity: 1;
  }

  .mp-close:hover {
    color: var(--color-text);
  }

  .mp-close:focus-visible {
    opacity: 1;
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  .mp-close .material-symbols-outlined {
    font-size: 0.95rem;
  }
</style>
