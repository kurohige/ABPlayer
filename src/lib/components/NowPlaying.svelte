<script lang="ts">
  /**
   * The mini-player strip, redesigned to `docs/Audiobook app design
   * improvements/miniplayer.CSS` (1g, 360×104): a 3px accent rail along the
   * top, 60px cover, Newsreader title, Manrope "Ch 10 · Author", mono
   * elapsed / total, then replay_30 · play · forward_30.
   *
   * The design file's own tokens (--abmp-*) are mapped onto the app's colour
   * variables rather than hardcoded, so the window follows whichever colour
   * theme the main window sends it. Its px values are used as written: the
   * mini window pins its root font-size to 16px (see MiniPlayer.svelte), so
   * 1rem is 16px here and the layout lands on the design's pixel grid.
   *
   * The mini window is a separate webview with no access to the stores, so
   * everything comes in through `state` and every control reports back
   * through a callback. The library has no bar of its own by design (handoff
   * 1a): its continue card is the docked player.
   */
  import { formatTime, formatTimeShort, parseTime } from "../utils/format";
  import { focusOnMount } from "../utils/focusOnMount";
  import { Cover, IconButton, PlayButton } from "./ui";

  export interface ExternalState {
    playing: boolean;
    loading: boolean;
    currentTime: number;
    duration: number;
    title: string;
    author: string;
    coverArt: string | null;
    /** "Ch 10", "Track 2/14" — first thing on the subtitle line. */
    chapterLabel?: string;
    /** Shown after the author; only sent when playback is not at 1×. */
    speedLabel?: string;
    /** Replaces the subtitle while set. */
    error?: string | null;
  }

  interface Props {
    state: ExternalState;
    onplay: () => void;
    onskip: (seconds: number) => void;
    /** With this set, the elapsed time can be clicked and typed over to jump there. */
    onseek?: (seconds: number) => void;
  }

  // Held as `np`: a local called `state` would shadow the $state rune used below
  let { state: np, onplay, onskip, onseek }: Props = $props();

  // Typing a time: the draft is local, so the once-a-second state updates do not overwrite it
  let editing = $state(false);
  let draft = $state("");
  let invalid = $state(false);

  function startEdit() {
    draft = formatTimeShort(np.currentTime);
    invalid = false;
    editing = true;
  }

  function commitEdit() {
    const secs = parseTime(draft);
    if (secs === null) {
      invalid = true;
      return;
    }
    editing = false;
    onseek?.(np.duration > 0 ? Math.min(secs, np.duration) : secs);
  }

  function handleEditKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      editing = false;
    }
  }

  let pct = $derived(
    np.duration > 0
      ? Math.min(100, Math.max(0, (np.currentTime / np.duration) * 100))
      : 0,
  );

  let subtitle = $derived(
    [np.chapterLabel, np.author, np.speedLabel].filter(Boolean).join(" · "),
  );
  let canType = $derived(!!onseek && np.duration > 0);
</script>

<!-- Everything that is not a control is a drag region: the window has no
     decorations, so the frame itself is the title bar. -->
<div class="np" data-tauri-drag-region>
  <div class="np-rail" data-tauri-drag-region="deep">
    <div class="np-rail-fill" style="width: {pct}%;"></div>
  </div>

  <div class="np-body" data-tauri-drag-region>
    <span class="np-cover" class:art={!!np.coverArt} data-tauri-drag-region="deep">
      <Cover src={np.coverArt} alt="" size="3.75rem" />
    </span>

    <div class="np-meta" data-tauri-drag-region>
      <span class="np-title" title={np.title} data-tauri-drag-region>{np.title}</span>

      {#if np.error}
        <span class="np-sub np-error" role="alert" data-tauri-drag-region>{np.error}</span>
      {:else if subtitle}
        <span class="np-sub" title={subtitle} data-tauri-drag-region>{subtitle}</span>
      {/if}

      {#if editing}
        <input
          class="np-time-input mono"
          class:invalid
          type="text"
          aria-label="Jump to time"
          placeholder="h:mm:ss"
          bind:value={draft}
          use:focusOnMount
          onfocus={(e) => e.currentTarget.select()}
          oninput={() => (invalid = false)}
          onkeydown={handleEditKey}
          onblur={() => (editing = false)}
        />
      {:else}
        <span class="np-time mono" data-tauri-drag-region>
          {#if canType}
            <!-- A control, so not part of the drag region; the rest of the line still drags -->
            <button
              class="np-now"
              data-press="none"
              onclick={startEdit}
              title="Click to type a time, such as 1:23:45, 23:45 or 1h 23m"
              aria-label="Jump to a time, now at {formatTime(np.currentTime)}"
            >{formatTimeShort(np.currentTime)}</button>
          {:else}
            <span data-tauri-drag-region>{formatTimeShort(np.currentTime)}</span>
          {/if}
          <span class="np-sep" data-tauri-drag-region>/</span>
          <span data-tauri-drag-region>{formatTimeShort(np.duration)}</span>
        </span>
      {/if}
    </div>

    <div class="np-controls">
      <IconButton icon="replay_30" label="Back 30 seconds" size="2rem" onclick={() => onskip(-30)} />
      <PlayButton playing={np.playing} loading={np.loading} size="2.625rem" onclick={onplay} />
      <IconButton icon="forward_30" label="Forward 30 seconds" size="2rem" onclick={() => onskip(30)} />
    </div>
  </div>
</div>

<style>
  .np {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
    background: var(--color-bg);
    border: 1px solid var(--color-outline-variant);
    /* The window itself is transparent, so this radius is the widget's outline */
    border-radius: 0.75rem;
  }

  /* Progress rail — 3px, accent fill. Deliberately not transitioned: the time
     arrives once a second, and easing it leaves the bar trailing the clock. */
  .np-rail {
    flex-shrink: 0;
    height: 3px;
    background: var(--color-outline-variant);
  }

  .np-rail-fill {
    height: 100%;
    background: var(--color-primary);
  }

  .np-body {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0 0.875rem;
  }

  .np-cover {
    position: relative;
    flex-shrink: 0;
    display: block;
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  /* Spine cue (handoff treatment 2a): a gutter shadow and a hairline down the
     left edge, so real art reads as a book. Never over the placeholder. */
  .np-cover.art::before,
  .np-cover.art::after {
    content: "";
    position: absolute;
    z-index: 1;
    pointer-events: none;
  }

  .np-cover.art::before {
    inset: 0;
    background: linear-gradient(
      90deg,
      rgba(0, 0, 0, 0.62) 0,
      rgba(0, 0, 0, 0.3) 9%,
      rgba(0, 0, 0, 0) 16%
    );
  }

  .np-cover.art::after {
    left: 13%;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(255, 255, 255, 0.2);
  }

  /* The book mark is the empty state, at the design's 36-in-60 proportion */
  .np-cover :global(.ab-cover-ph) {
    font-size: 2.1rem;
  }

  .np-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .np-title,
  .np-sub {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .np-title {
    font: 600 1rem/1.15 var(--font-headline);
    color: var(--color-text);
  }

  .np-sub {
    font: 500 0.75rem/1.2 var(--font-label);
    color: var(--color-text-variant);
  }

  .np-error {
    color: var(--color-error);
  }

  .np-time {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.6875rem;
    line-height: 1;
    color: var(--color-outline);
    font-variant-numeric: tabular-nums;
  }

  .np-sep {
    opacity: 0.5;
  }

  .np-now {
    padding: 0;
    background: none;
    border: none;
    border-bottom: 1px dotted var(--color-outline-variant);
    color: inherit;
    font: inherit;
    cursor: text;
  }

  .np-now:hover,
  .np-now:focus-visible {
    color: var(--color-text);
    border-bottom-color: var(--color-outline);
    outline: none;
  }

  .np-time-input {
    width: 100%;
    max-width: 7rem;
    padding: 0.1rem 0.25rem;
    background: var(--color-surface-high);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-size: 0.6875rem;
    line-height: 1.2;
    outline: none;
  }

  .np-time-input.invalid {
    border-color: var(--color-error);
  }

  .np-controls {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-shrink: 0;
  }
</style>
