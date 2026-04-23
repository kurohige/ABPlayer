<script lang="ts">
  import { audioStore, togglePlay, skip, setSpeed, seek, setVolume, toggleMute } from "../stores/audioStore";
  import { userdataStore, getDisplayTitle, getDisplayAuthor, getDisplayCover } from "../stores/userdataStore";
  import WaveformBar from "./WaveformBar.svelte";
  import { formatTimeShort } from "../utils/format";

  interface Props {
    mini?: boolean;
    onexpand?: () => void;
  }

  let { mini = false, onexpand }: Props = $props();

  const SPEEDS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];

  let seekbarEl: HTMLDivElement = $state(null!);
  let book = $derived($audioStore.currentBook);

  let isMultiFile = $derived(book ? book.tracks.length > 1 : false);

  let hasChapterScope = $derived(
    !isMultiFile &&
    $audioStore.chapters.length > 0 &&
    $audioStore.currentChapterIndex >= 0 &&
    $audioStore.currentChapterIndex < $audioStore.chapters.length,
  );

  let chapterStart = $derived(
    hasChapterScope
      ? $audioStore.chapters[$audioStore.currentChapterIndex].startTimeMs / 1000
      : 0,
  );

  let chapterEnd = $derived(
    hasChapterScope
      ? ($audioStore.currentChapterIndex + 1 < $audioStore.chapters.length
          ? $audioStore.chapters[$audioStore.currentChapterIndex + 1].startTimeMs / 1000
          : $audioStore.duration)
      : $audioStore.duration,
  );

  let chapterDuration = $derived(chapterEnd - chapterStart);

  let progress = $derived(
    hasChapterScope && chapterDuration > 0
      ? (($audioStore.currentTime - chapterStart) / chapterDuration) * 100
      : $audioStore.duration > 0
        ? ($audioStore.currentTime / $audioStore.duration) * 100
        : 0,
  );

  let displayCurrentTime = $derived(
    hasChapterScope ? $audioStore.currentTime - chapterStart : $audioStore.currentTime,
  );

  let displayDuration = $derived(
    hasChapterScope ? chapterDuration : $audioStore.duration,
  );

  function handleSeek(e: MouseEvent) {
    if (!seekbarEl) return;
    const rect = seekbarEl.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (hasChapterScope) {
      seek(chapterStart + pct * chapterDuration);
    } else {
      seek(pct * $audioStore.duration);
    }
  }

  function cycleSpeed() {
    const idx = SPEEDS.indexOf($audioStore.speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setSpeed(next);
  }

  function handleToggle() {
    if (onexpand) onexpand();
  }

  let userData = $derived(book ? $userdataStore.books[book.filePath] : undefined);
  let title = $derived(book ? getDisplayTitle(book, userData) : "");
  let author = $derived(book ? getDisplayAuthor(book, userData) : "");
  let cover = $derived(book ? getDisplayCover(book, userData) : null);

  let volumeIcon = $derived(
    $audioStore.muted || $audioStore.volume === 0
      ? "volume_off"
      : $audioStore.volume < 0.5
        ? "volume_down"
        : "volume_up",
  );

  function handleVolumeInput(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    setVolume(val);
  }
</script>

{#if mini}
  <!-- MINI PLAYER -->
  <div class="mini-player">
    <div class="mini-progress">
      <div class="mini-progress-fill" style:width="{progress}%"></div>
    </div>
    <div class="mini-content">
      <div class="mini-cover">
        {#if cover}
          <img src={cover} alt="" />
        {:else}
          <span class="material-symbols-outlined mini-cover-icon">auto_stories</span>
        {/if}
      </div>
      <span class="mini-title">{title}</span>
      <button class="mini-btn speed-pill" onclick={cycleSpeed}>
        {$audioStore.speed}x
      </button>
      <button class="mini-btn" onclick={togglePlay}>
        <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">
          {$audioStore.playing ? "pause" : "play_arrow"}
        </span>
      </button>
      <button class="mini-btn" onclick={toggleMute} title={$audioStore.muted ? "Unmute" : "Mute"}>
        <span class="material-symbols-outlined">{volumeIcon}</span>
      </button>
      <button class="mini-btn" onclick={handleToggle} title="Expand">
        <span class="material-symbols-outlined">open_in_full</span>
      </button>
    </div>
  </div>
{:else}
  <!-- FULL PLAYER BAR -->
  <div class="player">
    <div class="now-playing">
      <div class="cover-wrap">
        {#if cover}
          <img class="bar-cover" src={cover} alt="" />
        {:else}
          <div class="bar-cover-ph">
            <span class="material-symbols-outlined">auto_stories</span>
          </div>
        {/if}
      </div>
      <div class="track-info">
        <span class="track-title">{title}</span>
        <span class="track-author">{author}</span>
      </div>
    </div>

    <div class="controls">
      <button class="ctrl-btn" onclick={() => skip(-30)} title="Back 30s">
        <span class="material-symbols-outlined">replay_30</span>
      </button>
      <button class="ctrl-btn play-btn" onclick={togglePlay}>
        <span class="material-symbols-outlined">
          {$audioStore.playing ? "pause" : "play_arrow"}
        </span>
      </button>
      <button class="ctrl-btn" onclick={() => skip(30)} title="Forward 30s">
        <span class="material-symbols-outlined">forward_30</span>
      </button>
    </div>

    <div class="seekbar-area" bind:this={seekbarEl}>
      <span class="time">{formatTimeShort(displayCurrentTime)}</span>
      <WaveformBar
        {progress}
        seed={hasChapterScope
          ? `${book?.filePath}-ch${$audioStore.currentChapterIndex}`
          : book?.filePath || ""}
        height={24}
        barCount={50}
        onclick={handleSeek}
      />
      <span class="time">{formatTimeShort(displayDuration)}</span>
    </div>

    <button class="speed-pill" class:active={$audioStore.speed !== 1} onclick={cycleSpeed}>
      {$audioStore.speed}x
    </button>

    <div class="volume-area">
      <button class="ctrl-btn" onclick={toggleMute} title={$audioStore.muted ? "Unmute" : "Mute"}>
        <span class="material-symbols-outlined">{volumeIcon}</span>
      </button>
      <input
        type="range"
        class="volume-slider"
        min="0"
        max="1"
        step="0.01"
        value={$audioStore.muted ? 0 : $audioStore.volume}
        oninput={handleVolumeInput}
      />
    </div>

    <button class="ctrl-btn collapse-btn" onclick={handleToggle} title="Collapse">
      <span class="material-symbols-outlined">close_fullscreen</span>
    </button>
  </div>
{/if}

<style>
  /* === MINI PLAYER === */
  .mini-player {
    background: var(--color-surface);
    position: relative;
  }

  .mini-progress {
    height: 2px;
    background: var(--color-surface-highest);
  }

  .mini-progress-fill {
    height: 100%;
    background: var(--color-primary);
    transition: width 0.1s linear;
  }

  .mini-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem var(--spacing-md);
    height: 2.75rem;
  }

  .mini-cover {
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--color-surface-high);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mini-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .mini-cover-icon {
    font-size: 1rem;
    color: var(--color-outline-variant);
  }

  .mini-title {
    flex: 1;
    font-family: var(--font-headline);
    font-size: var(--font-size-sm);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-text);
  }

  .mini-btn {
    background: none;
    border: none;
    color: var(--color-text-variant);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
  }

  .mini-btn:hover {
    color: var(--color-primary);
  }

  .mini-btn .material-symbols-outlined {
    font-size: 1.25rem;
  }

  .mini-btn.speed-pill {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    padding: 2px 6px;
    background: var(--color-surface-high);
    border-radius: var(--radius-xl);
    color: var(--color-text-variant);
  }

  /* === FULL PLAYER BAR === */
  .player {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: 0 var(--spacing-md);
    height: 4rem;
    background: var(--color-surface);
  }

  .now-playing {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 10rem;
    max-width: 14rem;
  }

  .cover-wrap {
    flex-shrink: 0;
  }

  .bar-cover {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--radius-md);
    object-fit: cover;
  }

  .bar-cover-ph {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--radius-md);
    background: var(--color-surface-high);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-outline-variant);
  }

  .bar-cover-ph .material-symbols-outlined {
    font-size: 1.25rem;
  }

  .track-info {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    gap: 1px;
  }

  .track-title {
    font-family: var(--font-headline);
    font-size: var(--font-size-sm);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .track-author {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .ctrl-btn {
    background: none;
    border: none;
    color: var(--color-text-variant);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
  }

  .ctrl-btn:hover {
    color: var(--color-primary);
  }

  .ctrl-btn .material-symbols-outlined {
    font-size: 1.25rem;
  }

  .play-btn {
    width: 2.2rem;
    height: 2.2rem;
    background: var(--gradient-primary);
    color: var(--color-on-primary);
    border-radius: 50%;
  }

  .play-btn:hover {
    box-shadow: 0 0 12px color-mix(in srgb, var(--color-primary) 35%, transparent);
  }

  .play-btn .material-symbols-outlined {
    font-size: 1.4rem;
    font-variation-settings: "FILL" 1;
  }

  .seekbar-area {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .time {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-outline);
    min-width: 2.4rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .speed-pill {
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text-variant);
    padding: 3px 8px;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    cursor: pointer;
    min-width: 2.2rem;
    transition: background 0.15s, color 0.15s;
  }

  .speed-pill:hover {
    background: var(--color-surface-highest);
  }

  .speed-pill.active {
    background: var(--color-primary);
    color: var(--color-on-primary);
  }

  .collapse-btn .material-symbols-outlined {
    font-size: 1rem;
  }

  /* === VOLUME === */
  .volume-area {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 5rem;
  }

  .volume-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 4rem;
    height: 3px;
    background: var(--color-surface-highest);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-primary);
    cursor: pointer;
    border: none;
  }

  .volume-slider::-webkit-slider-runnable-track {
    height: 3px;
    border-radius: 2px;
  }
</style>
