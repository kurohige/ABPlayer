<script lang="ts">
  import { onMount } from "svelte";
  import { listen, emit } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";

  interface MiniState {
    playing: boolean;
    loading: boolean;
    currentTime: number;
    duration: number;
    title: string;
    author: string;
    coverArt: string | null;
    speed: number;
    isDark: boolean;
    primary: string;
    gradientFrom: string;
    gradientTo: string;
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
    isDark: true,
    primary: "#d4a039",
    gradientFrom: "#c89430",
    gradientTo: "#d4a039",
  });

  let progress = $derived(
    state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0,
  );

  function formatTime(secs: number): string {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

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
</script>

<div
  class="mini"
  class:light={!state.isDark}
  data-tauri-drag-region
  style="--mp-primary: {state.primary}; --mp-gradient: linear-gradient(135deg, {state.gradientFrom}, {state.gradientTo});"
>
  <div class="mini-progress">
    <div class="mini-progress-fill" style:width="{progress}%"></div>
  </div>
  <div class="mini-body" data-tauri-drag-region>
    <div class="mini-cover">
      {#if state.coverArt}
        <img src={state.coverArt} alt="" />
      {:else}
        <span class="material-symbols-outlined cover-ph">auto_stories</span>
      {/if}
    </div>
    <div class="mini-info" data-tauri-drag-region>
      <span class="mini-title">{state.title || "No book loaded"}</span>
      <span class="mini-author">{state.author}</span>
      <span class="mini-time">{formatTime(state.currentTime)} / {formatTime(state.duration)}</span>
    </div>
    <div class="mini-controls">
      <button class="ctrl" onclick={() => sendCommand("skip-back")}>
        <span class="material-symbols-outlined">replay_30</span>
      </button>
      <button class="ctrl play" onclick={() => sendCommand("toggle-play")}>
        <span class="material-symbols-outlined" class:spinning={state.loading} style="font-variation-settings: 'FILL' 1;">
          {state.loading ? "progress_activity" : (state.playing ? "pause" : "play_arrow")}
        </span>
      </button>
      <button class="ctrl" onclick={() => sendCommand("skip-forward")}>
        <span class="material-symbols-outlined">forward_30</span>
      </button>
      <button class="ctrl close" onclick={closeMini}>
        <span class="material-symbols-outlined" style="font-size:16px;">close</span>
      </button>
    </div>
  </div>
</div>

<style>
  .mini {
    width: 320px;
    height: 88px;
    background: #1a1a1c;
    color: #e5e2e3;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .mini-progress {
    height: 2px;
    background: #353537;
  }

  .mini-progress-fill {
    height: 100%;
    background: var(--mp-primary, #d4a039);
    transition: width 0.3s linear;
  }

  .mini-body {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
  }

  .mini-cover {
    width: 56px;
    height: 56px;
    border-radius: 6px;
    overflow: hidden;
    background: #2a2a2c;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .mini-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-ph {
    font-size: 24px;
    color: #555;
  }

  .mini-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .mini-title {
    font-size: 12px;
    font-weight: 600;
    color: #e5e2e3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mini-author {
    font-size: 10px;
    color: #a8a5a3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mini-time {
    font-size: 9px;
    color: #757271;
    font-variant-numeric: tabular-nums;
    margin-top: 2px;
  }

  .mini-controls {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .ctrl {
    background: none;
    border: none;
    color: #a8a5a3;
    cursor: pointer;
    padding: 4px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
  }

  .ctrl:hover {
    color: #e5e2e3;
  }

  .ctrl .material-symbols-outlined {
    font-size: 20px;
  }

  .ctrl.play {
    background: var(--mp-gradient, #d4a039);
    color: #1a1a1c;
    width: 32px;
    height: 32px;
  }

  .ctrl.play:hover {
    opacity: 0.9;
  }

  .ctrl.play .material-symbols-outlined {
    font-size: 20px;
  }

  .spinning { animation: ab-spin 1s linear infinite; }
  @keyframes ab-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .ctrl.close {
    color: #757271;
  }

  .ctrl.close:hover {
    color: #ef9a9a;
  }

  /* Light theme overrides */
  .mini.light {
    background: #f5f4f0;
    color: #1b1c1a;
    box-shadow: 0 8px 32px rgba(27, 28, 26, 0.15);
  }

  .mini.light .mini-progress { background: #e3e2df; }
  .mini.light .mini-cover { background: #e9e8e4; }
  .mini.light .cover-ph { color: #bec9c9; }
  .mini.light .mini-title { color: #1b1c1a; }
  .mini.light .mini-author { color: #3e4949; }
  .mini.light .mini-time { color: #6e7979; }
  .mini.light .ctrl { color: #3e4949; }
  .mini.light .ctrl:hover { color: #1b1c1a; }
  .mini.light .ctrl.play { color: #ffffff; }
  .mini.light .ctrl.close { color: #6e7979; }
</style>
