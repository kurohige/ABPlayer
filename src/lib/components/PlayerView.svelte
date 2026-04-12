<script lang="ts">
  import { audioStore, togglePlay, skip, setSpeed, seek, seekToChapter, goToTrack, setVolume, toggleMute, setSleepTimer, setSleepEndOfChapter, cancelSleepTimer, setAbRepeatA, setAbRepeatB, clearAbRepeat } from "../stores/audioStore";
  import { userdataStore, getDisplayTitle, getDisplayAuthor, getDisplayCover } from "../stores/userdataStore";
  import { bookmarkStore, addBookmark, removeBookmark } from "../stores/bookmarkStore";
  import EqualizerPanel from "./EqualizerPanel.svelte";
  import WaveformBar from "./WaveformBar.svelte";
  import { formatTimeShort } from "../utils/format";

  interface Props {
    onback?: () => void;
    onminiplayer?: () => void;
  }

  let { onback, onminiplayer }: Props = $props();

  let showEq = $state(false);
  let showSleepMenu = $state(false);
  let dominantColor = $state<string | null>(null);

  // Extract dominant color from cover art for glassmorphism tint
  $effect(() => {
    const src = cover;
    if (!src) { dominantColor = null; return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = new OffscreenCanvas(1, 1);
        const ctx = canvas.getContext("2d");
        if (!ctx) { dominantColor = null; return; }
        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        dominantColor = `${r}, ${g}, ${b}`;
      } catch {
        dominantColor = null;
      }
    };
    img.onerror = () => { dominantColor = null; };
    img.src = src;
  });

  function formatTimer(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  const SPEEDS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];

  let seekbarEl: HTMLDivElement = $state(null!);

  let book = $derived($audioStore.currentBook);
  let isMultiFile = $derived(book ? book.tracks.length > 1 : false);

  // Chapter-scoped seeking: when a single-file book has chapters,
  // the seekbar covers the current chapter only for precise navigation.
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

  let userData = $derived(book ? $userdataStore.books[book.filePath] : undefined);
  let title = $derived(book ? getDisplayTitle(book, userData) : "");
  let author = $derived(book ? getDisplayAuthor(book, userData) : "");
  let cover = $derived(book ? getDisplayCover(book, userData) : null);
  let trackLabel = $derived(
    isMultiFile
      ? `Track ${$audioStore.currentTrackIndex + 1} of ${$audioStore.totalTracks}`
      : $audioStore.chapters.length > 0 && $audioStore.currentChapterIndex >= 0
        ? `Chapter ${$audioStore.currentChapterIndex + 1} of ${$audioStore.chapters.length}`
        : null,
  );

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

  let bookmarks = $derived(
    book ? ($bookmarkStore[book.filePath] || []) : [],
  );

  async function handleAddBookmark() {
    if (!book) return;
    const count = bookmarks.length;
    await addBookmark(
      book.filePath,
      `Bookmark ${count + 1}`,
      $audioStore.currentTime,
      $audioStore.currentTrackIndex,
    );
  }

  function seekToBookmark(position: number, trackIndex: number) {
    if (!book) return;
    if (book.tracks.length > 1 && trackIndex !== $audioStore.currentTrackIndex) {
      goToTrack(trackIndex);
      // After track loads, seek to position
      const audio = document.querySelector("audio");
      if (audio) {
        audio.addEventListener("loadedmetadata", () => {
          seek(position);
        }, { once: true });
      }
    } else {
      seek(position);
    }
  }
</script>

<div class="player-view">
  {#if book}
    {#if cover}
      <div class="pv-glass-bg" style="background-image: url('{cover}');{dominantColor ? ` --dominant: ${dominantColor};` : ''}"></div>
    {/if}
    <div class="pv-header">
      {#if onback}
        <button class="pv-back" onclick={onback}>
          <span class="material-symbols-outlined">arrow_back</span>
          <span>Library</span>
        </button>
      {/if}
      {#if onminiplayer}
        <button class="pv-back" onclick={onminiplayer} title="Mini Player" style="margin-left: auto;">
          <span class="material-symbols-outlined">picture_in_picture_alt</span>
        </button>
      {/if}
    </div>
    <div class="pv-cover-wrap">
      <svg class="pv-cover-ring" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="48" fill="none" stroke="var(--color-surface-highest)" stroke-width="1.5" />
        <circle cx="50" cy="50" r="48" fill="none" stroke="var(--color-primary)" stroke-width="2"
          stroke-dasharray="{48 * 2 * Math.PI}"
          stroke-dashoffset="{48 * 2 * Math.PI * (1 - (hasChapterScope ? progress : ($audioStore.duration > 0 ? $audioStore.currentTime / $audioStore.duration * 100 : 0)) / 100)}"
          transform="rotate(-90 50 50)"
          stroke-linecap="round"
          opacity="0.8"
        />
      </svg>
      <div class="pv-cover">
        {#if cover}
          <img src={cover} alt={title} />
        {:else}
          <div class="pv-cover-placeholder">
            <span class="material-symbols-outlined">auto_stories</span>
          </div>
        {/if}
      </div>
    </div>

    <div class="pv-info">
      <h2 class="pv-title">{title}</h2>
      <p class="pv-author">{author}</p>
      {#if $audioStore.error}
        <p class="pv-error">
          <span class="material-symbols-outlined" style="font-size:0.85rem;">error</span>
          {$audioStore.error}
        </p>
      {:else if trackLabel}
        <p class="pv-chapter">{trackLabel}</p>
      {/if}
    </div>

    <div class="pv-seekbar-area" bind:this={seekbarEl}>
      <WaveformBar
        {progress}
        seed={hasChapterScope
          ? `${book?.filePath}-ch${$audioStore.currentChapterIndex}`
          : book?.filePath || ""}
        height={36}
        barCount={70}
        onclick={handleSeek}
      />
      <div class="pv-times">
        <span>{formatTimeShort(displayCurrentTime)}</span>
        <span>{formatTimeShort(displayDuration)}</span>
      </div>
    </div>

    <div class="pv-controls">
      <button class="pv-ctrl" onclick={() => skip(-30)}>
        <span class="material-symbols-outlined">replay_30</span>
      </button>
      <button class="pv-play" onclick={togglePlay}>
        <span class="material-symbols-outlined">
          {$audioStore.playing ? "pause" : "play_arrow"}
        </span>
      </button>
      <button class="pv-ctrl" onclick={() => skip(30)}>
        <span class="material-symbols-outlined">forward_30</span>
      </button>
    </div>

    <!-- Controls strip: speed, volume, and tools in one clean row -->
    <div class="pv-tools-row">
      <button class="tool-pill" onclick={cycleSpeed} title="Playback speed (click to cycle)">
        {$audioStore.speed}x
      </button>

      <div class="tool-divider"></div>

      <button class="pv-ctrl pv-vol-btn" onclick={toggleMute} title={$audioStore.muted ? "Unmute" : "Mute"}>
        <span class="material-symbols-outlined">{volumeIcon}</span>
      </button>
      <input
        type="range"
        class="pv-volume-slider"
        min="0"
        max="1"
        step="0.01"
        value={$audioStore.muted ? 0 : $audioStore.volume}
        oninput={handleVolumeInput}
      />

      <div class="tool-divider"></div>

      <button class="pv-ctrl" onclick={handleAddBookmark} title="Add bookmark">
        <span class="material-symbols-outlined">bookmark_add</span>
      </button>
      <button class="pv-ctrl" onclick={() => (showEq = true)} title="Equalizer">
        <span class="material-symbols-outlined">equalizer</span>
      </button>
      {#if $audioStore.abRepeat}
        <button class="pv-ctrl ab-active" onclick={clearAbRepeat} title="Clear A-B loop">
          <span class="material-symbols-outlined">repeat_one</span>
        </button>
      {:else}
        <button class="pv-ctrl" onclick={setAbRepeatA} title="Set loop point A">
          <span class="ab-label">A</span>
        </button>
      {/if}
      {#if $audioStore.abRepeat && $audioStore.abRepeat.a === $audioStore.abRepeat.b}
        <button class="pv-ctrl ab-active" onclick={setAbRepeatB} title="Set loop point B">
          <span class="ab-label">B</span>
        </button>
      {/if}
      <div class="sleep-wrap">
        <button
          class="pv-ctrl"
          class:sleep-active={$audioStore.sleepTimerMode !== "off"}
          onclick={() => { showSleepMenu = !showSleepMenu; }}
          title="Sleep timer"
        >
          <span class="material-symbols-outlined">bedtime</span>
        </button>
        {#if $audioStore.sleepTimerMode === "minutes" && $audioStore.sleepTimerRemaining}
          <span class="sleep-countdown">{formatTimer($audioStore.sleepTimerRemaining)}</span>
        {:else if $audioStore.sleepTimerMode === "end-of-chapter"}
          <span class="sleep-countdown">EoC</span>
        {/if}
        {#if showSleepMenu}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="sleep-menu" onclick={() => { showSleepMenu = false; }}>
            {#if $audioStore.sleepTimerMode !== "off"}
              <button class="sleep-item active" onclick={cancelSleepTimer}>Cancel Timer</button>
            {/if}
            <button class="sleep-item" onclick={() => setSleepTimer(15)}>15 minutes</button>
            <button class="sleep-item" onclick={() => setSleepTimer(30)}>30 minutes</button>
            <button class="sleep-item" onclick={() => setSleepTimer(45)}>45 minutes</button>
            <button class="sleep-item" onclick={() => setSleepTimer(60)}>60 minutes</button>
            <button class="sleep-item" onclick={setSleepEndOfChapter}>End of chapter</button>
          </div>
        {/if}
      </div>
    </div>

    {#if isMultiFile && book}
      <div class="pv-chapters">
        <h3>Tracks</h3>
        <ul>
          {#each book.tracks as track, i (i)}
            <li>
              <button
                class="pv-chapter-item"
                class:active={i === $audioStore.currentTrackIndex}
                onclick={() => goToTrack(i)}
              >
                <span class="ch-num">{i + 1}</span>
                <span class="ch-title">{track.title}</span>
                {#if track.duration > 0}
                  <span class="ch-time">{formatTimeShort(track.duration)}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {:else if $audioStore.chapters.length > 0}
      <div class="pv-chapters">
        <h3>Chapters</h3>
        <ul>
          {#each $audioStore.chapters as chapter, i (i)}
            <li>
              <button
                class="pv-chapter-item"
                class:active={i === $audioStore.currentChapterIndex}
                onclick={() => seekToChapter(i)}
              >
                <span class="ch-title">{chapter.title}</span>
                <span class="ch-time">{formatTimeShort(chapter.startTimeMs / 1000)}</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if bookmarks.length > 0}
      <div class="pv-chapters">
        <h3>Bookmarks</h3>
        <ul>
          {#each bookmarks as bm (bm.id)}
            <li class="bm-li">
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="pv-chapter-item"
                onclick={() => seekToBookmark(bm.position, bm.trackIndex)}
              >
                <span class="material-symbols-outlined bm-icon">bookmark</span>
                <span class="ch-title">{bm.name}</span>
                <span class="ch-time">{formatTimeShort(bm.position)}</span>
                <button
                  class="bm-remove"
                  onclick={(e: MouseEvent) => { e.stopPropagation(); removeBookmark(book!.filePath, bm.id); }}
                  title="Remove bookmark"
                >
                  <span class="material-symbols-outlined" style="font-size:0.85rem;">close</span>
                </button>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {:else}
    <div class="pv-empty">
      <span class="material-symbols-outlined">headphones</span>
      <p>Select an audiobook to start listening</p>
    </div>
  {/if}
</div>

{#if showEq}
  <EqualizerPanel onclose={() => (showEq = false)} />
{/if}

<style>
  .player-view {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--spacing-lg) var(--spacing-xl);
    gap: var(--spacing-md);
    background: var(--color-bg);
    position: relative;
  }

  .pv-glass-bg {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    filter: blur(60px) saturate(1.8);
    opacity: 0.12;
    pointer-events: none;
    z-index: 0;
  }

  .player-view > :not(.pv-glass-bg) {
    position: relative;
    z-index: 1;
  }

  .pv-header {
    width: 100%;
    display: flex;
    align-items: center;
  }

  .pv-back {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: none;
    border: none;
    color: var(--color-text-variant);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-lg);
    transition: color 0.15s, background 0.15s;
  }

  .pv-back:hover {
    color: var(--color-text);
    background: var(--color-surface-high);
  }

  .pv-back .material-symbols-outlined {
    font-size: 1.15rem;
  }

  .pv-cover-wrap {
    position: relative;
    width: 12rem;
    height: 12rem;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: var(--spacing-sm);
    flex-shrink: 0;
  }

  .pv-cover-ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transition: stroke-dashoffset 0.3s linear;
  }

  .pv-cover {
    width: 85%;
    height: 85%;
    border-radius: 50%;
    overflow: hidden;
    box-shadow: var(--shadow-ambient);
  }

  .pv-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .pv-cover-placeholder {
    width: 100%;
    height: 100%;
    background: var(--color-surface-high);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-outline-variant);
  }

  .pv-cover-placeholder .material-symbols-outlined {
    font-size: 4rem;
    font-variation-settings: "FILL" 0, "wght" 200;
  }

  .pv-info {
    text-align: center;
  }

  .pv-title {
    font-family: var(--font-headline);
    font-size: var(--font-size-xl);
    font-weight: 500;
    color: var(--color-text);
    margin-bottom: 0.15rem;
  }

  .pv-author {
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    color: var(--color-text-variant);
  }

  .pv-error {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-error);
    margin-top: 0.25rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .pv-chapter {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-outline);
    margin-top: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  .pv-seekbar-area {
    width: 100%;
    max-width: min(85%, 22rem);
  }

  .pv-times {
    display: flex;
    justify-content: space-between;
    margin-top: 0.25rem;
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-outline);
    font-variant-numeric: tabular-nums;
  }

  .pv-controls {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .pv-ctrl {
    background: none;
    border: none;
    color: var(--color-text-variant);
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 50%;
    transition: color 0.15s;
  }

  .pv-ctrl:hover {
    color: var(--color-primary);
  }

  .pv-ctrl .material-symbols-outlined {
    font-size: 1.75rem;
  }

  .pv-play {
    width: 3.2rem;
    height: 3.2rem;
    background: var(--gradient-primary);
    color: var(--color-on-primary);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: box-shadow 0.2s;
  }

  .pv-play:hover {
    box-shadow: 0 0 20px color-mix(in srgb, var(--color-primary) 40%, transparent);
  }

  .pv-play .material-symbols-outlined {
    font-size: 2rem;
    font-variation-settings: "FILL" 1;
  }


  .pv-tools-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-surface);
    border-radius: var(--radius-xl);
    width: fit-content;
  }

  .tool-pill {
    background: var(--color-surface-high);
    border: none;
    color: var(--color-primary);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 700;
    padding: 0.25rem 0.6rem;
    border-radius: var(--radius-xl);
    cursor: pointer;
    min-width: 2.4rem;
    text-align: center;
    transition: background 0.15s;
  }

  .tool-pill:hover {
    background: var(--color-surface-highest);
  }

  .tool-divider {
    width: 0.06rem;
    height: 1.1rem;
    background: var(--color-outline-variant);
    opacity: 0.5;
    flex-shrink: 0;
  }

  .pv-volume-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 4.5rem;
    height: 3px;
    background: var(--color-surface-highest);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .pv-vol-btn .material-symbols-outlined {
    font-size: 1.25rem;
  }

  .pv-volume-slider {
    -webkit-appearance: none;
    appearance: none;
    flex: 1;
    height: 3px;
    background: var(--color-surface-highest);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .pv-volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--color-primary);
    cursor: pointer;
    border: none;
  }

  .pv-volume-slider::-webkit-slider-runnable-track {
    height: 3px;
    border-radius: 2px;
  }

  .pv-chapters {
    width: 100%;
    max-width: min(85%, 22rem);
    margin-top: var(--spacing-sm);
  }

  .pv-chapters h3 {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-variant);
    margin-bottom: var(--spacing-sm);
  }

  .pv-chapters ul {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 180px;
    overflow-y: auto;
  }

  .pv-chapter-item {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 8px;
    border: none;
    background: none;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    cursor: pointer;
    border-radius: var(--radius-md);
    text-align: left;
    gap: var(--spacing-sm);
    transition: background 0.1s;
  }

  .pv-chapter-item:hover {
    background: var(--color-surface);
  }

  .pv-chapter-item.active .ch-title {
    color: var(--color-primary);
    font-weight: 600;
  }

  .ch-num {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-outline);
    min-width: 18px;
    text-align: right;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .ch-title {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ch-time {
    font-family: var(--font-label);
    color: var(--color-outline);
    font-variant-numeric: tabular-nums;
    font-size: var(--font-size-xs);
  }

  .ab-active {
    color: var(--color-primary) !important;
  }

  .ab-label {
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: inherit;
  }

  .sleep-wrap {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .sleep-active {
    color: var(--color-primary) !important;
  }

  .sleep-countdown {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-primary);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .sleep-menu {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 4px;
    background: var(--color-surface-lowest);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-ambient);
    padding: 4px;
    z-index: 20;
    min-width: 140px;
  }

  .sleep-item {
    display: block;
    width: 100%;
    background: none;
    border: none;
    color: var(--color-text-variant);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    padding: 6px 12px;
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .sleep-item:hover {
    background: var(--color-surface-container);
  }

  .sleep-item.active {
    color: var(--color-primary);
    font-weight: 600;
  }

  .bm-li .pv-chapter-item {
    cursor: pointer;
  }

  .bm-icon {
    font-size: 1rem;
    color: var(--color-primary);
    flex-shrink: 0;
  }

  .bm-remove {
    background: none;
    border: none;
    color: var(--color-outline);
    cursor: pointer;
    padding: 2px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .pv-chapter-item:hover .bm-remove {
    opacity: 1;
  }

  .bm-remove:hover {
    color: var(--color-error);
  }

  .pv-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    color: var(--color-outline);
  }

  .pv-empty .material-symbols-outlined {
    font-size: 3rem;
    font-variation-settings: "FILL" 0, "wght" 200;
  }

  .pv-empty p {
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
  }
</style>
