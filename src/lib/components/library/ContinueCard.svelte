<script lang="ts">
  /**
   * The Library's lead card (handoff 1a): resume in one click, with the
   * listening preferences right there rather than buried in the player.
   *
   * Reads the audio stores directly. The book shown may not be the loaded one
   * — the saved position drives the bar until it is, and pressing play loads
   * it at that position.
   */
  import type { BookMeta, UserBookData } from "../../types";
  import {
    audioStore,
    loadBook,
    togglePlay,
    restartBook,
    skip,
    seek,
    setVolume,
    toggleMute,
    setSleepTimer,
    setSleepEndOfChapter,
    cancelSleepTimer,
  } from "../../stores/audioStore";
  import { addBookmark } from "../../stores/bookmarkStore";
  import { showToast } from "../../stores/toastStore";
  import { getDisplayTitle, getDisplayAuthor, getDisplayCover } from "../../stores/userdataStore";
  import { formatTime, formatTimeShort } from "../../utils/format";
  import { formatSpeed } from "../../utils/speed";
  import { watchBelow } from "../../utils/measure";
  import {
    Cover,
    EqBands,
    Equalizer,
    Frame,
    IconButton,
    Panel,
    Pill,
    PlayButton,
    SpeedMenu,
  } from "../ui";

  interface Props {
    book: BookMeta;
    userData?: UserBookData | undefined;
    /** Saved progress, used while this book is not the loaded one. */
    saved?: { position: number; duration: number } | undefined;
    /** Open the full player view. */
    onopen: () => void;
  }

  let { book, userData, saved, onopen }: Props = $props();

  /**
   * Compact tier: under 34rem of card the transport drops to the vocabulary's
   * 42px "compact" play button, the cover to 5rem and the title a step down,
   * so the docked card stays short in a narrow window or at Large scale. The
   * sizes are props, hence measured rather than a container query.
   */
  const COMPACT_REM = 34;
  let compact = $state(false);


  const SLEEP_OPTIONS = [15, 30, 45, 60];

  let panel = $state<"sleep" | "eq" | "speed" | null>(null);
  let scrubbing = $state(false);
  let trackEl = $state<HTMLDivElement | null>(null);

  let isCurrent = $derived($audioStore.currentBook?.filePath === book.filePath);
  let title = $derived(getDisplayTitle(book, userData));
  let author = $derived(getDisplayAuthor(book, userData));
  let cover = $derived(getDisplayCover(book, userData));

  // While another book is loaded, the card still shows this one's saved spot.
  let elapsed = $derived(isCurrent ? $audioStore.currentTime : (saved?.position ?? 0));
  let total = $derived(
    isCurrent && $audioStore.duration > 0 ? $audioStore.duration : (saved?.duration ?? book.duration),
  );
  let pct = $derived(total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0);

  let chapters = $derived(isCurrent ? $audioStore.chapters : []);
  let chapterIndex = $derived(isCurrent ? $audioStore.currentChapterIndex : -1);
  let chapterLeft = $derived.by(() => {
    if (!isCurrent || chapterIndex < 0 || chapterIndex >= chapters.length) return null;
    const next = chapters[chapterIndex + 1];
    const end = next ? next.startTimeMs / 1000 : total;
    return Math.max(0, end - $audioStore.currentTime);
  });

  let metaLine = $derived.by(() => {
    const parts: string[] = [];
    if (chapters.length > 0 && chapterIndex >= 0) {
      parts.push(`Ch ${chapterIndex + 1} of ${chapters.length}`);
    }
    if (chapterLeft !== null) parts.push(`${formatTimeShort(chapterLeft)} left in chapter`);
    else if (total > elapsed) parts.push(`${formatTimeShort(total - elapsed)} left`);
    return parts.join(" · ");
  });

  let speedLabel = $derived(formatSpeed($audioStore.speed));
  let volumeLabel = $derived(`${Math.round(($audioStore.muted ? 0 : $audioStore.volume) * 100)}`);
  let sleepLabel = $derived.by(() => {
    if ($audioStore.sleepTimerMode === "end-of-chapter") return "Chapter";
    if ($audioStore.sleepTimerRemaining !== null) {
      return `${Math.ceil($audioStore.sleepTimerRemaining / 60)}m`;
    }
    return "Off";
  });
  let sleepOn = $derived($audioStore.sleepTimerMode !== "off");
  let eqLabel = $derived.by(() => {
    const bands: Array<[string, number]> = [
      ["Bass", $audioStore.eqBass],
      ["Mid", $audioStore.eqMid],
      ["Treble", $audioStore.eqTreble],
    ];
    const loudest = bands.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
    if (loudest[1] === 0) return "Flat";
    return `${loudest[0]} ${loudest[1] > 0 ? "+" : ""}${loudest[1]}`;
  });
  let eqOn = $derived(
    $audioStore.eqBass !== 0 || $audioStore.eqMid !== 0 || $audioStore.eqTreble !== 0,
  );

  function handlePlay() {
    if (isCurrent) togglePlay();
    else loadBook(book);
  }

  function seekFromPointer(clientX: number) {
    if (!trackEl || total <= 0) return;
    const r = trackEl.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    if (isCurrent) seek(ratio * total);
  }

  function onTrackPointerDown(e: PointerEvent) {
    if (!isCurrent) return;
    scrubbing = true;
    trackEl?.setPointerCapture(e.pointerId);
    seekFromPointer(e.clientX);
  }

  function onTrackPointerMove(e: PointerEvent) {
    if (scrubbing) seekFromPointer(e.clientX);
  }

  function onTrackPointerUp(e: PointerEvent) {
    if (!scrubbing) return;
    scrubbing = false;
    trackEl?.releasePointerCapture(e.pointerId);
  }

  function onTrackKey(e: KeyboardEvent) {
    if (!isCurrent) return;
    const step = e.shiftKey ? 60 : 15;
    if (e.key === "ArrowRight") skip(step);
    else if (e.key === "ArrowLeft") skip(-step);
    else return;
    e.preventDefault();
  }

  async function handleBookmark() {
    if (!isCurrent) return;
    await addBookmark(
      book.filePath,
      formatTime($audioStore.currentTime),
      $audioStore.currentTime,
      $audioStore.currentTrackIndex,
    );
    showToast("Bookmark added", "bookmark_added");
  }

  function pickSleep(minutes: number | "chapter" | null) {
    if (minutes === null) cancelSleepTimer();
    else if (minutes === "chapter") setSleepEndOfChapter();
    else setSleepTimer(minutes);
    panel = null;
  }
</script>

<Frame class="cc" pad="1.1rem">
  <div
    class="cc-body"
    class:compact
    use:watchBelow={{ rem: COMPACT_REM, onchange: (b) => (compact = b) }}
  >
    <button class="cc-cover-btn ab-lift" onclick={onopen} aria-label="Open {title} in the player">
      <Cover src={cover} alt={title} size="100%" logged={book.fileless === true} />
    </button>

    <div class="cc-main">
      <div class="cc-kicker">
        <span class="cc-kicker-label">Continue</span>
        {#if isCurrent && $audioStore.playing}
          <Equalizer height="0.62rem" />
        {/if}
      </div>

      <div class="cc-title-row">
        <button class="cc-title" onclick={onopen} title={title}>{title}</button>
        <div class="cc-transport">
          <IconButton
            icon="replay_30"
            label="Back 30 seconds"
            size={compact ? "2rem" : "2.2rem"}
            disabled={!isCurrent}
            onclick={() => skip(-30)}
          />
          <PlayButton
            playing={isCurrent && $audioStore.playing}
            loading={isCurrent && $audioStore.loading}
            size={compact ? "2.9rem" : "3.6rem"}
            onclick={handlePlay}
          />
          <IconButton
            icon="forward_30"
            label="Forward 30 seconds"
            size={compact ? "2rem" : "2.2rem"}
            disabled={!isCurrent}
            onclick={() => skip(30)}
          />
        </div>
      </div>

      <div class="cc-byline">
        <p class="cc-author">{author}</p>
        {#if isCurrent && elapsed > 10}
          <button class="cc-restart" onclick={restartBook}>Start over</button>
        {/if}
      </div>

      <div class="cc-spacer"></div>

      <div class="cc-meta">
        <span class="cc-meta-left mono">{metaLine}</span>
        <span class="cc-meta-right mono">{Math.round(pct)}%</span>
      </div>

      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="cc-track"
        class:live={isCurrent}
        bind:this={trackEl}
        role="slider"
        tabindex={isCurrent ? 0 : -1}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        onpointerdown={onTrackPointerDown}
        onpointermove={onTrackPointerMove}
        onpointerup={onTrackPointerUp}
        onpointercancel={onTrackPointerUp}
        onkeydown={onTrackKey}
      >
        <span class="cc-fill" class:scrubbing style="width: {pct}%;"></span>
      </div>

      <div class="cc-times">
        <span class="mono">{formatTime(elapsed)}</span>
        <span class="mono">{formatTime(total)}</span>
      </div>

      <div class="cc-prefs">
        <div class="cc-panel-anchor">
          <Pill
            icon="speed"
            value={speedLabel}
            height="2.1rem"
            title="Playback speed"
            ariaHasPopup
            ariaExpanded={panel === "speed"}
            onclick={() => (panel = panel === "speed" ? null : "speed")}
          />
          {#if panel === "speed"}
            <SpeedMenu
              origin="bottom left"
              style="bottom: 2.5rem; left: 0;"
              onclose={() => (panel = null)}
            />
          {/if}
        </div>

        <div class="cc-volume">
          <button
            class="cc-volume-icon"
            onclick={toggleMute}
            aria-label={$audioStore.muted ? "Unmute" : "Mute"}
            title={$audioStore.muted ? "Unmute" : "Mute"}
          >
            <span class="material-symbols-outlined" aria-hidden="true">
              {$audioStore.muted ? "volume_off" : "volume_up"}
            </span>
          </button>
          <input
            class="cc-volume-slider"
            type="range"
            min="0"
            max="1"
            step="0.01"
            aria-label="Volume"
            value={$audioStore.muted ? 0 : $audioStore.volume}
            oninput={(e) => setVolume(Number((e.currentTarget as HTMLInputElement).value))}
          />
          <span class="cc-volume-value mono">{volumeLabel}</span>
        </div>

        <div class="cc-panel-anchor">
          <Pill
            icon="bedtime"
            value={sleepLabel}
            height="2.1rem"
            selected={sleepOn}
            title="Sleep timer"
            ariaHasPopup
            ariaExpanded={panel === "sleep"}
            onclick={() => (panel = panel === "sleep" ? null : "sleep")}
          />
          {#if panel === "sleep"}
            <Panel
              label="Sleep timer"
              origin="bottom left"
              width="11.7rem"
              style="bottom: 2.5rem; left: 0;"
              onclose={() => (panel = null)}
            >
              {#each SLEEP_OPTIONS as minutes, i (minutes)}
                <button
                  class="cc-menu-item"
                  style="animation-delay: calc(var(--motion-stagger) * {i});"
                  onclick={() => pickSleep(minutes)}
                >
                  <span>{minutes} minutes</span>
                </button>
              {/each}
              <button
                class="cc-menu-item"
                style="animation-delay: calc(var(--motion-stagger) * {SLEEP_OPTIONS.length});"
                onclick={() => pickSleep("chapter")}
              >
                <span>End of chapter</span>
              </button>
              {#if sleepOn}
                <button class="cc-menu-item danger" onclick={() => pickSleep(null)}>
                  <span>Turn off</span>
                </button>
              {/if}
            </Panel>
          {/if}
        </div>

        <div class="cc-panel-anchor">
          <Pill
            icon="equalizer"
            value={eqLabel}
            height="2.1rem"
            selected={eqOn}
            title="Equalizer"
            ariaHasPopup
            ariaExpanded={panel === "eq"}
            onclick={() => (panel = panel === "eq" ? null : "eq")}
          />
          {#if panel === "eq"}
            <Panel
              label="Equalizer"
              origin="bottom left"
              width="14.7rem"
              pad="0.97rem"
              style="bottom: 2.5rem; left: 0;"
              onclose={() => (panel = null)}
            >
              <EqBands />
            </Panel>
          {/if}
        </div>

        <IconButton
          icon="bookmark_add"
          label="Add bookmark"
          size="2.1rem"
          disabled={!isCurrent}
          onclick={handleBookmark}
        />
      </div>
    </div>
  </div>
</Frame>

<style>
  .cc-body {
    display: flex;
    gap: 1.1rem;
    min-width: 0;
  }

  /* Handoff: clamp(92px, 17%, 132px), square, top-aligned — proportional to
     the card, never stretched by the row */
  .cc-cover-btn {
    width: clamp(6.4rem, 17%, 9.2rem);
    aspect-ratio: 1;
    flex-shrink: 0;
    align-self: flex-start;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: transform var(--motion-lift) var(--ease-out);
  }

  .cc-cover-btn:hover {
    transform: translateY(-4px);
  }

  .cc-body.compact .cc-cover-btn {
    width: 5rem;
  }

  .cc-body.compact .cc-title {
    font-size: 1.35rem;
  }

  .cc-body.compact .cc-title-row {
    gap: 0.42rem 0.83rem;
  }

  .cc-cover-btn:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
  }

  .cc-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  /* Every text row holds its height; only the spacer absorbs slack, so the
     card never compresses the meta line into the progress bar. */
  .cc-kicker,
  .cc-title-row,
  .cc-byline,
  .cc-meta,
  .cc-track,
  .cc-times,
  .cc-prefs {
    flex-shrink: 0;
  }

  .cc-spacer {
    flex: 1;
    min-height: 0.55rem;
  }

  .cc-kicker {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    margin-bottom: 0.42rem;
  }

  .cc-kicker-label {
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.66rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-outline);
  }

  /* The transport drops under the title once the title has under 12rem */
  .cc-title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.55rem 1.1rem;
    min-width: 0;
  }

  .cc-title {
    flex: 1 1 12rem;
    min-width: 0;
    padding: 0;
    background: none;
    border: none;
    text-align: left;
    color: var(--color-text);
    font-family: var(--font-headline);
    font-weight: 600;
    font-size: 1.74rem;
    line-height: 1.15;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cc-transport {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    flex-shrink: 0;
  }

  .cc-byline {
    display: flex;
    align-items: baseline;
    gap: 0.7rem;
    min-width: 0;
    flex-shrink: 0;
  }

  .cc-restart {
    flex-shrink: 0;
    padding: 0;
    background: none;
    border: none;
    color: var(--color-text-variant);
    font-family: var(--font-label);
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
  }

  .cc-restart:hover {
    color: var(--color-text);
    text-decoration: underline;
  }

  .cc-author {
    flex: 1;
    min-width: 0;
    margin: 0.28rem 0 0;
    font-family: var(--font-body);
    font-size: 0.83rem;
    color: var(--color-text-variant);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cc-meta {
    display: flex;
    align-items: baseline;
    gap: 0.7rem;
    font-size: 0.73rem;
    color: var(--color-text-variant);
    white-space: nowrap;
  }

  .cc-meta-left {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cc-meta-right {
    flex-shrink: 0;
  }

  .cc-track {
    position: relative;
    height: 4px;
    margin-top: 0.42rem;
    border-radius: 2px;
    background: var(--color-outline-variant);
    overflow: hidden;
  }

  .cc-track.live {
    cursor: pointer;
  }

  .cc-track:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
  }

  .cc-fill {
    display: block;
    height: 100%;
    background: var(--color-primary);
    transition: width var(--motion-progress) ease-out;
  }

  /* No transition while dragging — the bar must track the pointer exactly. */
  .cc-fill.scrubbing {
    transition: none;
  }

  .cc-times {
    display: flex;
    justify-content: space-between;
    margin-top: 0.3rem;
    font-size: 0.73rem;
    color: var(--color-outline);
  }

  .cc-prefs {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-wrap: wrap;
    margin-top: 0.83rem;
  }

  .cc-panel-anchor {
    position: relative;
  }

  .cc-volume {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    height: 2.1rem;
    padding: 0 0.7rem;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-md);
  }

  .cc-volume-icon {
    display: flex;
    padding: 0;
    background: none;
    border: none;
    color: var(--color-text-variant);
    cursor: pointer;
  }

  .cc-volume-icon .material-symbols-outlined {
    font-size: 1.05rem;
  }

  .cc-volume-slider {
    width: 3.75rem;
    accent-color: var(--color-primary);
  }

  .cc-volume-value {
    min-width: 1.5rem;
    font-size: 0.73rem;
    font-weight: 700;
    text-align: right;
  }

  .cc-menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 2.1rem;
    padding: 0 0.7rem;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: 0.76rem;
    font-weight: 600;
    cursor: pointer;
    animation: ab-rise var(--motion-rise) var(--ease-out) both;
  }

  .cc-menu-item:hover {
    background: var(--color-surface-high);
  }

  .cc-menu-item.danger {
    color: var(--color-error);
  }
</style>
