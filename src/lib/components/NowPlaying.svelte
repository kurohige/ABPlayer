<script lang="ts">
  /**
   * The mini-player strip (handoff 1g): 320×88, a 2px accent progress line
   * along the top, cover, title, "Ch 10 · Author", mono times, transport.
   *
   * The mini window is a separate webview with no access to the stores, so
   * everything comes in through `state` and every control reports back
   * through a callback. The library has no bar of its own by design (handoff
   * 1a): its continue card is the docked player.
   */
  import { formatTime } from "../utils/format";
  import { Cover, IconButton, PlayButton } from "./ui";

  export interface ExternalState {
    playing: boolean;
    loading: boolean;
    currentTime: number;
    duration: number;
    title: string;
    author: string;
    coverArt: string | null;
    chapterLabel?: string;
    /** Replaces the subtitle while set. */
    error?: string | null;
  }

  interface Props {
    state: ExternalState;
    onplay: () => void;
    onskip: (seconds: number) => void;
  }

  let { state, onplay, onskip }: Props = $props();

  let pct = $derived(
    state.duration > 0
      ? Math.min(100, Math.max(0, (state.currentTime / state.duration) * 100))
      : 0,
  );

  let subtitle = $derived([state.chapterLabel, state.author].filter(Boolean).join(" · "));
</script>

<div class="np">
  <span class="np-progress" style="width: {pct}%;"></span>

  <div class="np-body">
    <Cover src={state.coverArt} alt="" size="3.6rem" />

    <!-- The text and time are drag regions ("deep" covers the spans), so the
         window can be moved from anywhere that is not a control -->
    <div class="np-text" data-tauri-drag-region="deep">
      <span class="np-title" title={state.title}>{state.title}</span>
      {#if state.error}
        <span class="np-sub np-error" role="alert">{state.error}</span>
      {:else if subtitle}
        <span class="np-sub">{subtitle}</span>
      {/if}
    </div>

    <span class="np-time mono" data-tauri-drag-region="deep">
      {formatTime(state.currentTime)} / {formatTime(state.duration)}
    </span>

    <div class="np-controls">
      <IconButton icon="replay_30" label="Back 30 seconds" size="2rem" bare onclick={() => onskip(-30)} />
      <PlayButton playing={state.playing} loading={state.loading} size="2.4rem" onclick={onplay} />
      <IconButton icon="forward_30" label="Forward 30 seconds" size="2rem" bare onclick={() => onskip(30)} />
    </div>
  </div>
</div>

<style>
  .np {
    position: relative;
    flex-shrink: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  /* 2px accent line along the top edge — the one accent in this component */
  .np-progress {
    position: absolute;
    top: 0;
    left: 0;
    height: 2px;
    background: var(--color-primary);
    transition: width var(--motion-progress) ease-out;
  }

  .np-body {
    display: flex;
    align-items: center;
    gap: 0.83rem;
    height: 6.1rem;
    padding: 0 0.97rem;
    min-width: 0;
  }

  .np-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.14rem;
  }

  .np-title {
    font-family: var(--font-headline);
    font-size: 0.92rem;
    font-weight: 500;
    line-height: 1.2;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .np-sub {
    font-family: var(--font-label);
    font-size: 0.72rem;
    color: var(--color-text-variant);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .np-error {
    color: var(--color-error);
  }

  .np-time {
    flex-shrink: 0;
    font-size: 0.73rem;
    color: var(--color-outline);
  }

  .np-controls {
    display: flex;
    align-items: center;
    gap: 0.42rem;
    flex-shrink: 0;
  }
</style>
