<script lang="ts">
  /**
   * The always-on-top mini window (handoff 1g). It is a separate webview with
   * no access to the stores, so the main window pushes it a state payload and
   * it pushes back commands. The strip itself is the NowPlaying component;
   * the grip on the left and the strip's text are the drag regions.
   */
  import { onMount } from "svelte";
  import { listen, emit } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import NowPlaying from "./lib/components/NowPlaying.svelte";
  import { IconButton } from "./lib/components/ui";

  interface MiniState {
    playing: boolean;
    loading: boolean;
    currentTime: number;
    duration: number;
    title: string;
    author: string;
    coverArt: string | null;
    speed: number;
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
    error: null,
    isDark: true,
    primary: "#4db6ac",
  });

  function sendCommand(action: string) {
    emit("mini-player-command", { action });
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
    chapterLabel: state.speed !== 1 ? `${state.speed}×` : "",
    error: state.error,
  });
</script>

<div class="mp">
  <!-- The grip is the visible handle; "deep" makes the icon inside drag too -->
  <span class="mp-grip" data-tauri-drag-region="deep" title="Drag to move">
    <span class="material-symbols-outlined" aria-hidden="true">drag_indicator</span>
  </span>
  <NowPlaying
    state={npState}
    onplay={() => sendCommand("toggle-play")}
    onskip={(s) => sendCommand(s < 0 ? "skip-back" : "skip-forward")}
  />
  <span class="mp-close">
    <IconButton icon="close" label="Close the mini player" size="1.6rem" bare onclick={closeMini} />
  </span>
</div>

<style>
  .mp {
    position: relative;
    height: 100vh;
    display: flex;
    padding: 0;
    background: var(--color-bg);
    overflow: hidden;
  }

  /* One surface step up from the strip, brighter on hover, grab cursor:
     reads as the handle. */
  .mp-grip {
    flex-shrink: 0;
    width: 1.35rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-high);
    border-right: 1px solid var(--color-outline-variant);
    color: var(--color-outline);
    cursor: grab;
    user-select: none;
    transition:
      background var(--motion-fast) ease,
      color var(--motion-fast) ease;
  }

  .mp-grip:hover {
    background: var(--color-outline-variant);
    color: var(--color-text);
  }

  .mp-grip:active {
    cursor: grabbing;
  }

  .mp-grip .material-symbols-outlined {
    font-size: 1.05rem;
  }

  .mp :global(.np) {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: none;
    border-radius: 0;
  }

  .mp :global(.np-body) {
    padding-left: 0.62rem;
  }

  /* Floats over the strip's top-right corner */
  .mp-close {
    position: absolute;
    top: 0.28rem;
    right: 0.28rem;
    z-index: 2;
  }
</style>
