<script lang="ts">
  /**
   * Player, left column (handoff 1c): cover, title, waveform, transport and
   * the "how you're listening" tile grid. The listening controls are
   * first-class here rather than hidden behind a sheet.
   *
   * Also the landing point for the cover flight started by a library tile.
   */
  import { onMount } from "svelte";
  import { open as openExternal } from "@tauri-apps/plugin-shell";
  import type { BookMeta, UserBookData } from "../../types";
  import {
    audioStore,
    togglePlay,
    skip,
    seek,
    setVolume,
    toggleMute,
    setAbRepeatA,
    setAbRepeatB,
    clearAbRepeat,
    setSleepTimer,
    setSleepEndOfChapter,
    cancelSleepTimer,
  } from "../../stores/audioStore";
  import { bookmarkStore, addBookmark } from "../../stores/bookmarkStore";
  import { slowLoad } from "../../stores/slowLoad";
  import { showToast } from "../../stores/toastStore";
  import { formatTime, formatTimeShort } from "../../utils/format";
  import { claimFlight, runFlight } from "../../utils/coverFlight";
  import { formatSpeed } from "../../utils/speed";
  import { watchBelow } from "../../utils/measure";
  import WaveformBar from "../WaveformBar.svelte";
  import { ControlTile, Cover, EqBands, Panel, SectionLabel, SpeedMenu } from "../ui";
  import { PlayButton, IconButton } from "../ui";

  interface Props {
    book: BookMeta;
    userData?: UserBookData | undefined;
    title: string;
    author: string;
    cover: string | null;
  }

  let { book, userData, title, author, cover }: Props = $props();

  const SLEEP_OPTIONS = [15, 30, 45, 60];
  const SEEK_STEP_S = 5;

  let panel = $state<"eq" | "sleep" | "speed" | null>(null);
  let coverEl = $state<HTMLElement | null>(null);

  /**
   * Short column: under 44rem of height the transport, waveform, tiles and
   * gaps step down one size so the whole column — cover included — fits
   * without scrolling. The cover itself is sized by CSS from the slack that
   * is left (see .ps-cover); this only covers the sizes that are props.
   */
  const SHORT_REM = 44;
  let short = $state(false);

  /** The real cover stays hidden while the ghost is still on its way. */
  let flying = $state(false);

  let isFileless = $derived(book.fileless === true);
  let isMultiFile = $derived(book.tracks.length > 1);

  // ---- chapter scoping: the waveform seeks within the current chapter ----
  let chapters = $derived($audioStore.chapters);
  let chapterIndex = $derived($audioStore.currentChapterIndex);
  let chapterStart = $derived(
    chapters.length > 0 && chapterIndex >= 0 ? chapters[chapterIndex].startTimeMs / 1000 : 0,
  );
  let chapterEnd = $derived.by(() => {
    if (chapters.length === 0 || chapterIndex < 0) return $audioStore.duration;
    const next = chapters[chapterIndex + 1];
    return next ? next.startTimeMs / 1000 : $audioStore.duration;
  });
  let chapterElapsed = $derived(Math.max(0, $audioStore.currentTime - chapterStart));
  let chapterLeft = $derived(Math.max(0, chapterEnd - $audioStore.currentTime));
  let chapterProgress = $derived.by(() => {
    const span = chapterEnd - chapterStart;
    if (span <= 0) return 0;
    return Math.min(100, Math.max(0, (chapterElapsed / span) * 100));
  });

  let chapterLabel = $derived.by(() => {
    if (isMultiFile) {
      return `Track ${$audioStore.currentTrackIndex + 1} of ${$audioStore.totalTracks}`;
    }
    if (chapters.length > 0 && chapterIndex >= 0) {
      return `Ch ${chapterIndex + 1} of ${chapters.length}`;
    }
    return "";
  });

  let bookmarkCount = $derived(($bookmarkStore[book.filePath] || []).length);

  let speedLabel = $derived(formatSpeed($audioStore.speed));
  let volumeValue = $derived(Math.round(($audioStore.muted ? 0 : $audioStore.volume) * 100));
  let gainLabel = $derived(
    $audioStore.bookGainDb !== 0
      ? `Volume · gain ${$audioStore.bookGainDb > 0 ? "+" : ""}${$audioStore.bookGainDb} dB`
      : "Volume",
  );
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

  let abLabel = $derived.by(() => {
    const ab = $audioStore.abRepeat;
    if (!ab) return "Off";
    return ab.b > ab.a ? "A–B" : "A";
  });
  let abOn = $derived($audioStore.abRepeat !== null);

  let sleepLabel = $derived.by(() => {
    if ($audioStore.sleepTimerMode === "end-of-chapter") return "Chapter";
    if ($audioStore.sleepTimerRemaining !== null) {
      return formatTimeShort($audioStore.sleepTimerRemaining);
    }
    return "Off";
  });
  let sleepOn = $derived($audioStore.sleepTimerMode !== "off");

  // The cover flies in from the library tile that opened this view.
  onMount(() => {
    const flight = claimFlight(book.filePath);
    if (!flight) return;
    flying = true;
    void runFlight(flight, coverEl).finally(() => (flying = false));
  });

  function handleSeek(e: MouseEvent) {
    const target = e.currentTarget as HTMLElement;
    const r = target.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    seek(chapterStart + ratio * (chapterEnd - chapterStart));
  }

  function handleSeekKey(e: KeyboardEvent) {
    if (e.key === "ArrowRight") skip(SEEK_STEP_S);
    else if (e.key === "ArrowLeft") skip(-SEEK_STEP_S);
    else return;
    e.preventDefault();
  }

  function cycleAb() {
    const ab = $audioStore.abRepeat;
    if (!ab) setAbRepeatA();
    else if (ab.b <= ab.a) setAbRepeatB();
    else clearAbRepeat();
  }

  async function handleAddBookmark() {
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

  async function openInSource() {
    if (!userData?.source) return;
    const query = encodeURIComponent(`${title} ${author}`);
    let url = "";
    switch (userData.source) {
      case "Audible":
        url = `https://www.audible.com/search?keywords=${query}`;
        break;
      case "Library":
        url = `https://www.worldcat.org/search?q=${query}`;
        break;
      default:
        return;
    }
    try {
      await openExternal(url);
    } catch (e) {
      console.error("Failed to open external URL:", e);
    }
  }
</script>

<div
  class="ps"
  class:short
  use:watchBelow={{ rem: SHORT_REM, axis: "height", onchange: (b) => (short = b) }}
>
  <div class="ps-cover">
    <div class="ps-cover-box" class:flying bind:this={coverEl}>
      <Cover src={cover} alt={title} size="100%" logged={isFileless} />
    </div>
  </div>

  <div class="ps-head">
    <h1 class="ps-title" title={title}>{title}</h1>
    <p class="ps-author">{author}</p>
    {#if chapterLabel}
      <p class="ps-chapter mono">{chapterLabel}</p>
    {/if}
  </div>

  {#if isFileless}
    <div class="ps-fileless">
      <span class="material-symbols-outlined" aria-hidden="true">note_stack</span>
      <div class="ps-fileless-text">
        <span class="ps-fileless-title">Metadata only</span>
        {#if userData?.source === "Audible" || userData?.source === "Library"}
          <button class="ps-fileless-open" onclick={openInSource}>
            Open in {userData.source}
            <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
          </button>
        {:else}
          <span class="ps-fileless-sub">No local audio file</span>
        {/if}
      </div>
    </div>
  {:else}
    <div class="ps-wave">
      <WaveformBar
        progress={chapterProgress}
        barCount={64}
        seed={book.filePath + chapterIndex}
        height={short ? 30 : 42}
        onclick={handleSeek}
        onkeydown={handleSeekKey}
        ariaLabel="Seek within this chapter"
      />
      <div class="ps-wave-times">
        <span class="mono">{formatTime(chapterElapsed)}</span>
        <span class="mono">−{formatTimeShort(chapterLeft)}</span>
      </div>
    </div>

    <div class="ps-transport">
      <IconButton
        icon="replay_30"
        label="Back 30 seconds"
        size={short ? "2.1rem" : "2.5rem"}
        onclick={() => skip(-30)}
      />
      <PlayButton
        playing={$audioStore.playing}
        loading={$audioStore.loading}
        size={short ? "3.4rem" : "4.4rem"}
        onclick={togglePlay}
      />
      <IconButton
        icon="forward_30"
        label="Forward 30 seconds"
        size={short ? "2.1rem" : "2.5rem"}
        onclick={() => skip(30)}
      />
    </div>

    {#if $slowLoad}
      <p class="ps-preparing" role="status">
        Preparing the file. Large audiobooks read their chapter index from the
        end of the file before playback can start.
      </p>
    {/if}

    <SectionLabel label="How you're listening" />

    <div class="ps-tiles">
      <div class="ps-anchor">
        <ControlTile
          icon="speed"
          value={speedLabel}
          label="Speed"
          active={$audioStore.speed !== 1}
          ariaHasPopup
          ariaExpanded={panel === "speed"}
          onclick={() => (panel = panel === "speed" ? null : "speed")}
        />
        {#if panel === "speed"}
          <SpeedMenu
            origin="bottom left"
            style="bottom: 4.8rem; left: 0;"
            onclose={() => (panel = null)}
          />
        {/if}
      </div>

      <ControlTile icon={$audioStore.muted ? "volume_off" : "volume_up"} value={String(volumeValue)} label={gainLabel} onclick={toggleMute}>
        {#snippet control()}
          <input
            class="ps-vol"
            type="range"
            min="0"
            max="1"
            step="0.01"
            aria-label="Volume"
            value={$audioStore.muted ? 0 : $audioStore.volume}
            onclick={(e) => e.stopPropagation()}
            oninput={(e) => setVolume(Number((e.currentTarget as HTMLInputElement).value))}
          />
        {/snippet}
      </ControlTile>

      <div class="ps-anchor">
        <ControlTile
          icon="equalizer"
          value={eqLabel}
          label="Equalizer"
          active={eqOn}
          ariaHasPopup
          ariaExpanded={panel === "eq"}
          onclick={() => (panel = panel === "eq" ? null : "eq")}
        />
        {#if panel === "eq"}
          <Panel
            label="Equalizer"
            origin="bottom center"
            width="14.7rem"
            pad="0.97rem"
            style="bottom: 4.8rem; left: 50%; transform: translateX(-50%);"
            onclose={() => (panel = null)}
          >
            <EqBands />
          </Panel>
        {/if}
      </div>

      <ControlTile icon="repeat" value={abLabel} label="Loop" active={abOn} onclick={cycleAb} />

      <div class="ps-anchor">
        <ControlTile
          icon="bedtime"
          value={sleepLabel}
          label="Sleep"
          active={sleepOn}
          ariaHasPopup
          ariaExpanded={panel === "sleep"}
          onclick={() => (panel = panel === "sleep" ? null : "sleep")}
        />
        {#if panel === "sleep"}
          <Panel
            label="Sleep timer"
            origin="bottom right"
            width="11.7rem"
            style="bottom: 4.8rem; right: 0;"
            onclose={() => (panel = null)}
          >
            {#each SLEEP_OPTIONS as minutes, i (minutes)}
              <button
                class="ps-menu-item"
                style="animation-delay: calc(var(--motion-stagger) * {i});"
                onclick={() => pickSleep(minutes)}
              >
                {minutes} minutes
              </button>
            {/each}
            <button
              class="ps-menu-item"
              style="animation-delay: calc(var(--motion-stagger) * {SLEEP_OPTIONS.length});"
              onclick={() => pickSleep("chapter")}
            >
              End of chapter
            </button>
            {#if sleepOn}
              <button class="ps-menu-item danger" onclick={() => pickSleep(null)}>Turn off</button>
            {/if}
          </Panel>
        {/if}
      </div>

      <ControlTile
        icon="bookmark_add"
        value={String(bookmarkCount)}
        label="Marks"
        onclick={handleAddBookmark}
      />
    </div>
  {/if}
</div>

<style>
  /* The column takes a share of the player, between a floor the tile grid
     needs and the handoff's 452px; the cover and title scale with it (this
     is the query container for the cqi values above). */
  .ps {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    width: clamp(21rem, 40%, 31.4rem);
    flex-shrink: 0;
    padding: 1.5rem 1.65rem;
    overflow-y: auto;
    border-right: 1px solid var(--color-outline-variant);
    container-type: inline-size;
  }

  /* Stacked under PlayerView's breakpoint: full width, the column scrolls */
  @container player (max-width: 46rem) {
    .ps {
      width: auto;
      overflow: visible;
      border-right: none;
      border-bottom: 1px solid var(--color-outline-variant);
    }

    /* The column is as tall as its content here, so there is no slack to
       size the cover from; give it a height instead */
    .ps-cover {
      flex: none;
      height: 15.8rem;
    }
  }

  /* Short column (see measureStage): one size down across the board */
  .ps.short {
    gap: 0.55rem;
    padding: 0.97rem 1.65rem;
  }

  .ps.short .ps-title {
    font-size: 1.35rem;
  }

  .ps.short .ps-tiles :global(.ab-tile) {
    height: 3.5rem;
  }

  /* The cover takes whatever height the rest of the column leaves, down to
     a floor, and is a size container so the box below can read that slack
     (cqh) and stay square within it. The wrapper's basis is 0, so its size
     never depends on the cover — no layout feedback. */
  .ps-cover {
    flex: 1 1 0;
    min-height: 5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    container-type: size;
  }

  .ps-cover-box {
    width: min(100cqw, 100cqh, 15.8rem);
    aspect-ratio: 1;
  }

  .ps-cover-box.flying {
    visibility: hidden;
  }

  .ps-head {
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
    min-width: 0;
  }

  /* Two lines at most; the full title is in the tooltip and the crumb */
  .ps-title {
    margin: 0;
    font-family: var(--font-headline);
    font-weight: 600;
    font-size: clamp(1.25rem, 8cqi, 1.8rem);
    line-height: 1.15;
    color: var(--color-text);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  .ps-author {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.83rem;
    color: var(--color-text-variant);
  }

  .ps-chapter {
    margin: 0.14rem 0 0;
    font-size: 0.73rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-outline);
    white-space: nowrap;
  }

  .ps-wave {
    display: flex;
    flex-direction: column;
    gap: 0.42rem;
  }

  .ps-wave-times {
    display: flex;
    justify-content: space-between;
    font-size: 0.73rem;
    color: var(--color-outline);
  }

  .ps-transport {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.1rem;
  }

  .ps-preparing {
    margin: -0.55rem 0 0;
    font-family: var(--font-body);
    font-size: 0.72rem;
    line-height: 1.4;
    text-align: center;
    color: var(--color-text-variant);
  }

  .ps-tiles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.55rem;
  }

  .ps-anchor {
    position: relative;
    min-width: 0;
    display: flex;
  }

  .ps-anchor > :global(.ab-tile) {
    width: 100%;
  }

  .ps-vol {
    width: 100%;
    max-width: 4.5rem;
    accent-color: var(--color-primary);
  }

  .ps-menu-item {
    display: flex;
    align-items: center;
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
    text-align: left;
    cursor: pointer;
    animation: ab-rise var(--motion-rise) var(--ease-out) both;
  }

  .ps-menu-item:hover {
    background: var(--color-surface-high);
  }

  .ps-menu-item.danger {
    color: var(--color-error);
  }

  .ps-fileless {
    display: flex;
    align-items: center;
    gap: 0.83rem;
    padding: 0.97rem;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-lg);
  }

  .ps-fileless > .material-symbols-outlined {
    font-size: 1.6rem;
    color: var(--color-outline);
  }

  .ps-fileless-text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .ps-fileless-title {
    font-family: var(--font-label);
    font-size: 0.83rem;
    font-weight: 700;
  }

  .ps-fileless-sub {
    font-family: var(--font-body);
    font-size: 0.73rem;
    color: var(--color-text-variant);
  }

  .ps-fileless-open {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    padding: 0;
    background: none;
    border: none;
    color: var(--color-primary);
    font-family: var(--font-label);
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;
  }

  .ps-fileless-open .material-symbols-outlined {
    font-size: 0.9rem;
  }
</style>
