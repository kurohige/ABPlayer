<script lang="ts">
  import { audioStore, togglePlay, skip, setSpeed, setVolume, seek, seekToChapter, goToTrack, toggleMute, setSleepTimer, setSleepEndOfChapter, cancelSleepTimer, setAbRepeatA, setAbRepeatB, clearAbRepeat } from "../stores/audioStore";
  import { userdataStore, setUserBookData, getDisplayTitle, getDisplayAuthor, getDisplayCover } from "../stores/userdataStore";
  import { bookmarkStore, addBookmark, removeBookmark } from "../stores/bookmarkStore";
  import { tierListsStore, defaultTierList, getBookTier } from "../stores/tierListStore";
  import EqualizerPanel from "./EqualizerPanel.svelte";
  import WaveformBar from "./WaveformBar.svelte";
  import BookRankingCard from "./BookRankingCard.svelte";
  import BookEditDialog from "./BookEditDialog.svelte";
  import { formatTimeShort } from "../utils/format";
  import { focusOnMount } from "../utils/focusOnMount";
  import { open as openExternal } from "@tauri-apps/plugin-shell";
  import { onMount } from "svelte";

  interface Props {
    onback?: () => void;
    onminiplayer?: () => void;
  }

  let { onback, onminiplayer }: Props = $props();

  // Close popovers when clicking outside them
  onMount(() => {
    function onClickAway(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (showMoreMenu && !target.closest(".pv-more-wrap") && !target.closest(".sleep-wrap")) {
        showMoreMenu = false;
      }
      if (showSleepMenu && !target.closest(".sleep-wrap")) {
        showSleepMenu = false;
      }
    }
    window.addEventListener("click", onClickAway);
    return () => window.removeEventListener("click", onClickAway);
  });

  let showEq = $state(false);
  let showSleepMenu = $state(false);
  let showMoreMenu = $state(false);
  let dominantColor = $state<string | null>(null);

  function handleVolumeInput(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    setVolume(val);
  }

  const SPEEDS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];

  let seekbarEl: HTMLDivElement = $state(null!);
  let tabBodyEl: HTMLDivElement = $state(null!);

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

  let overallProgressPercent = $derived(
    $audioStore.duration > 0 ? ($audioStore.currentTime / $audioStore.duration) * 100 : 0,
  );

  let displayCurrentTime = $derived(
    hasChapterScope ? $audioStore.currentTime - chapterStart : $audioStore.currentTime,
  );

  let displayDuration = $derived(
    hasChapterScope ? chapterDuration : $audioStore.duration,
  );

  let userData = $derived(book ? $userdataStore.books[book.filePath] : undefined);
  let title = $derived(book ? getDisplayTitle(book, userData) : "");
  let author = $derived(book ? getDisplayAuthor(book, userData) : "");
  let cover = $derived(book ? getDisplayCover(book, userData) : null);
  let isFileless = $derived(book?.fileless === true);

  // Chapter / track counts & labels
  let totalChapters = $derived(
    isMultiFile ? $audioStore.totalTracks : $audioStore.chapters.length,
  );
  let currentChapterIdx = $derived(
    isMultiFile ? $audioStore.currentTrackIndex : $audioStore.currentChapterIndex,
  );
  let chapterOfTotalLabel = $derived(
    totalChapters > 0 && currentChapterIdx >= 0
      ? `${isMultiFile ? "Tr" : "Ch"} ${currentChapterIdx + 1} of ${totalChapters}`
      : null,
  );
  let compactChapterLabel = $derived(
    totalChapters > 0 && currentChapterIdx >= 0
      ? `${isMultiFile ? "Tr" : "Ch"} ${currentChapterIdx + 1}`
      : null,
  );

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

  let editingBook = $state(false);
  let editingNotes = $state(false);
  let notesDraft = $state("");
  let newQuoteInput = $state("");

  type PlayerTab = "chapters" | "details" | "rating";
  let activeTab = $state<PlayerTab>("chapters");

  // Scroll-morph state: hero collapses once the tab body scrolls past the threshold.
  let collapsed = $state(false);
  const COLLAPSE_THRESHOLD = 8;

  function handleTabScroll() {
    if (!tabBodyEl) return;
    const next = tabBodyEl.scrollTop > COLLAPSE_THRESHOLD;
    if (next !== collapsed) collapsed = next;
  }

  // Reset scroll + collapsed state when switching tabs
  function switchTab(next: PlayerTab) {
    activeTab = next;
    if (tabBodyEl) tabBodyEl.scrollTop = 0;
    collapsed = false;
  }

  function startNotesEdit() {
    notesDraft = userData?.notes ?? "";
    editingNotes = true;
  }

  async function commitNotes() {
    if (!book) return;
    editingNotes = false;
    const v = notesDraft.trim();
    if (v !== (userData?.notes ?? "")) {
      await setUserBookData(book.filePath, { notes: v || null });
    }
  }

  async function addQuote() {
    if (!book) return;
    const q = newQuoteInput.trim();
    if (!q) return;
    const quotes = [...(userData?.quotes ?? []), q];
    await setUserBookData(book.filePath, { quotes });
    newQuoteInput = "";
  }

  async function removeQuote(i: number) {
    if (!book || !userData) return;
    const quotes = userData.quotes.filter((_, idx) => idx !== i);
    await setUserBookData(book.filePath, { quotes });
  }

  async function openInSource() {
    if (!book || !userData?.source) return;
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

  let volumeIcon = $derived(
    $audioStore.muted || $audioStore.volume === 0
      ? "volume_off"
      : $audioStore.volume < 0.5
        ? "volume_down"
        : "volume_up",
  );

  let bookmarks = $derived(
    book ? ($bookmarkStore[book.filePath] || []) : [],
  );

  let hasChapterContent = $derived(
    !isFileless && (isMultiFile || $audioStore.chapters.length > 0 || bookmarks.length > 0),
  );

  // Fileless books skip the chapters tab (route through switchTab so
  // collapsed + scrollTop also reset consistently)
  $effect(() => {
    if (isFileless && activeTab === "chapters") switchTab("details");
  });

  // Tier info for the Rating tab badge
  let currentTier = $derived(
    book && $defaultTierList ? getBookTier($defaultTierList, book.filePath) : null,
  );
  let otherListsCount = $derived.by(() => {
    if (!book) return 0;
    const defId = $userdataStore.preferences.defaultTierListId;
    let n = 0;
    for (const list of $tierListsStore.lists) {
      if (list.id !== defId && list.assignments[book.filePath]) n++;
    }
    return n;
  });

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

  function formatDateAdded(iso: string | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
</script>

<div class="player-view" class:collapsed>
  {#if book}
    {#if cover}
      <div class="pv-glass-bg" style="background-image: url('{cover}');{dominantColor ? ` --dominant: ${dominantColor};` : ''}"></div>
    {/if}

    <!-- Shared utility controls snippet: inline in expanded hero, inside popover when collapsed -->
    {#snippet utilityControls(inMenu: boolean)}
      <button class="pv-speed" onclick={cycleSpeed} title="Playback speed">
        {$audioStore.speed}×
      </button>

      <div class="pv-volume-group" class:stacked={inMenu}>
        <button class="pv-util-icon" onclick={toggleMute} title={$audioStore.muted ? "Unmute" : "Mute"}>
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
          aria-label="Volume"
        />
      </div>

      <button class="pv-util-icon" onclick={handleAddBookmark} title="Add bookmark">
        <span class="material-symbols-outlined">bookmark_add</span>
      </button>
      <button class="pv-util-icon" onclick={() => { showEq = true; showMoreMenu = false; }} title="Equalizer">
        <span class="material-symbols-outlined">equalizer</span>
      </button>

      {#if $audioStore.abRepeat}
        <button class="pv-util-icon active" onclick={clearAbRepeat} title="Clear A-B loop">
          <span class="material-symbols-outlined">repeat_one</span>
        </button>
      {:else}
        <button class="pv-util-icon" onclick={setAbRepeatA} title="Set A point">
          <span class="ab-label">A</span>
        </button>
      {/if}
      {#if $audioStore.abRepeat && $audioStore.abRepeat.a === $audioStore.abRepeat.b}
        <button class="pv-util-icon active" onclick={setAbRepeatB} title="Set B point">
          <span class="ab-label">B</span>
        </button>
      {/if}

      <div class="sleep-wrap">
        <button
          class="pv-util-icon"
          class:active={$audioStore.sleepTimerMode !== "off"}
          onclick={() => { showSleepMenu = !showSleepMenu; }}
          title="Sleep timer"
          aria-expanded={showSleepMenu}
        >
          <span class="material-symbols-outlined">bedtime</span>
        </button>
        {#if $audioStore.sleepTimerMode === "minutes" && $audioStore.sleepTimerRemaining}
          <span class="sleep-countdown">{formatTimer($audioStore.sleepTimerRemaining)}</span>
        {:else if $audioStore.sleepTimerMode === "end-of-chapter"}
          <span class="sleep-countdown">EoC</span>
        {/if}
        {#if showSleepMenu}
          <div class="sleep-menu" role="menu">
            {#if $audioStore.sleepTimerMode !== "off"}
              <button class="sleep-item active" role="menuitem" onclick={() => { cancelSleepTimer(); showSleepMenu = false; showMoreMenu = false; }}>Cancel timer</button>
            {/if}
            <button class="sleep-item" role="menuitem" onclick={() => { setSleepTimer(15); showSleepMenu = false; showMoreMenu = false; }}>15 minutes</button>
            <button class="sleep-item" role="menuitem" onclick={() => { setSleepTimer(30); showSleepMenu = false; showMoreMenu = false; }}>30 minutes</button>
            <button class="sleep-item" role="menuitem" onclick={() => { setSleepTimer(45); showSleepMenu = false; showMoreMenu = false; }}>45 minutes</button>
            <button class="sleep-item" role="menuitem" onclick={() => { setSleepTimer(60); showSleepMenu = false; showMoreMenu = false; }}>60 minutes</button>
            <button class="sleep-item" role="menuitem" onclick={() => { setSleepEndOfChapter(); showSleepMenu = false; showMoreMenu = false; }}>End of chapter</button>
          </div>
        {/if}
      </div>
    {/snippet}

    <!-- BackBar -->
    <div class="pv-backbar">
      {#if onback}
        <button class="pv-back-btn" onclick={onback} title="Back to library">
          <span class="material-symbols-outlined">arrow_back</span>
          <span class="pv-back-label">Library</span>
        </button>
      {/if}
      <span class="pv-backbar-sep">/</span>
      <span class="pv-backbar-title">{title}</span>
      <span class="pv-backbar-progress">{Math.round(overallProgressPercent)}%</span>
      {#if onminiplayer}
        <button class="pv-mini-btn" onclick={onminiplayer} title="Mini player">
          <span class="material-symbols-outlined">picture_in_picture_alt</span>
        </button>
      {/if}
    </div>

    <!-- Hero (morphs between expanded and collapsed) -->
    <div class="pv-hero" class:collapsed>
      <div class="pv-cover" class:collapsed>
        {#if cover}
          <img src={cover} alt={title} />
        {:else}
          <div class="pv-cover-placeholder">
            <span class="material-symbols-outlined">auto_stories</span>
          </div>
        {/if}
      </div>

      <div class="pv-title-block">
        {#if collapsed}
          <div class="pv-title-row">
            <span class="pv-title-small">{title}</span>
            {#if compactChapterLabel}
              <span class="pv-ch-compact">{compactChapterLabel}</span>
            {/if}
          </div>
        {:else}
          <h2 class="pv-title-big">{title}</h2>
          <div class="pv-author-row">
            <span class="pv-author">{author}</span>
            {#if chapterOfTotalLabel}
              <span class="pv-ch-of-total">{chapterOfTotalLabel}</span>
            {/if}
          </div>
        {/if}

        {#if !isFileless}
          <div class="pv-progress-row">
            <span class="pv-time mono">{formatTimeShort(displayCurrentTime)}</span>
            {#if collapsed}
              <div
                class="pv-progress-line"
                bind:this={seekbarEl}
                onclick={handleSeek}
                onkeydown={(e: KeyboardEvent) => {
                  if (e.key === "ArrowLeft") skip(-5);
                  else if (e.key === "ArrowRight") skip(5);
                }}
                role="slider"
                tabindex="0"
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
              >
                <div class="pv-progress-fill" style:width="{progress}%"></div>
              </div>
            {:else}
              <div class="pv-waveform-wrap" bind:this={seekbarEl}>
                <WaveformBar
                  {progress}
                  seed={hasChapterScope
                    ? `${book?.filePath}-ch${$audioStore.currentChapterIndex}`
                    : book?.filePath || ""}
                  height={28}
                  barCount={64}
                  onclick={handleSeek}
                />
              </div>
            {/if}
            <span class="pv-time mono right">{formatTimeShort(displayDuration)}</span>
          </div>
        {/if}
      </div>

      {#if !isFileless}
        <div class="pv-transport" class:collapsed>
          <button class="pv-ctrl" onclick={() => skip(-30)} title="Back 30 seconds">
            <span class="material-symbols-outlined">replay_30</span>
          </button>
          <button class="pv-play" class:collapsed onclick={togglePlay} title={$audioStore.playing ? "Pause" : "Play"}>
            <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">
              {$audioStore.playing ? "pause" : "play_arrow"}
            </span>
          </button>
          <button class="pv-ctrl" onclick={() => skip(30)} title="Forward 30 seconds">
            <span class="material-symbols-outlined">forward_30</span>
          </button>
        </div>

        {#if !collapsed}
          <div class="pv-hero-divider"></div>

          <div class="pv-util-bar">
            {@render utilityControls(false)}
          </div>
        {:else}
          <!-- Collapsed hero: utility controls moved into a popover -->
          <div class="pv-more-wrap">
            <button
              class="pv-util-icon"
              class:active={showMoreMenu || $audioStore.sleepTimerMode !== "off" || $audioStore.abRepeat !== null}
              onclick={() => (showMoreMenu = !showMoreMenu)}
              title="More controls"
              aria-label="More controls"
              aria-expanded={showMoreMenu}
            >
              <span class="material-symbols-outlined">more_vert</span>
            </button>
            {#if showMoreMenu}
              <div class="pv-more-menu" role="menu">
                {@render utilityControls(true)}
              </div>
            {/if}
          </div>
        {/if}
      {:else}
        <!-- Fileless: replace transport area with source CTA -->
        <div class="pv-fileless-cta">
          <span class="material-symbols-outlined">note_stack</span>
          <div class="pv-fileless-text">
            <div class="pv-fileless-title">Metadata only</div>
            {#if userData?.source === "Audible" || userData?.source === "Library"}
              <button class="pv-fileless-open" onclick={openInSource}>
                Open in {userData.source}
                <span class="material-symbols-outlined">open_in_new</span>
              </button>
            {:else}
              <span class="pv-fileless-sub">No local audio file</span>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    {#if $audioStore.error}
      <div class="pv-error-bar">
        <span class="material-symbols-outlined">error</span>
        {$audioStore.error}
      </div>
    {/if}

    <!-- Tabs header -->
    <div class="pv-tabs" role="tablist">
      {#if hasChapterContent}
        <button
          class="pv-tab"
          class:active={activeTab === "chapters"}
          onclick={() => switchTab("chapters")}
          role="tab"
          aria-selected={activeTab === "chapters"}
        >
          <span class="material-symbols-outlined">list</span>
          <span>{isMultiFile ? "Tracks" : "Chapters"}</span>
          {#if totalChapters > 0}
            <span class="pv-tab-count mono">{totalChapters}</span>
          {/if}
        </button>
      {/if}
      <button
        class="pv-tab"
        class:active={activeTab === "details"}
        onclick={() => switchTab("details")}
        role="tab"
        aria-selected={activeTab === "details"}
      >
        <span class="material-symbols-outlined">info</span>
        <span>Details</span>
      </button>
      <button
        class="pv-tab"
        class:active={activeTab === "rating"}
        onclick={() => switchTab("rating")}
        role="tab"
        aria-selected={activeTab === "rating"}
      >
        <span class="material-symbols-outlined">star_rate</span>
        <span>Rating</span>
        {#if activeTab === "rating" && currentTier}
          <span class="pv-tab-badge" style:background={currentTier.color}>{currentTier.label}</span>
        {/if}
      </button>
      <div class="pv-tabs-spacer"></div>
      <button class="pv-util-icon small" onclick={() => (editingBook = true)} title="Edit book">
        <span class="material-symbols-outlined">edit</span>
      </button>
    </div>

    <!-- Tab body — scroll listener drives hero collapse -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="pv-tab-body" bind:this={tabBodyEl} onscroll={handleTabScroll} role="tabpanel">
      {#if activeTab === "chapters"}
        <div class="pv-chapters-pane">
          {#if isMultiFile && book}
            <ul class="pv-chapter-list">
              {#each book.tracks as track, i (i)}
                {@const played = i < $audioStore.currentTrackIndex}
                {@const active = i === $audioStore.currentTrackIndex}
                <li>
                  <button
                    class="pv-chapter-row"
                    class:played
                    class:active
                    onclick={() => goToTrack(i)}
                  >
                    <span class="pv-chapter-marker mono">
                      {played ? "✓" : active ? "▸" : String(i + 1).padStart(2, "0")}
                    </span>
                    <span class="pv-chapter-title">{track.title}</span>
                    {#if track.duration > 0}
                      <span class="pv-chapter-time mono">{formatTimeShort(track.duration)}</span>
                    {/if}
                  </button>
                </li>
              {/each}
            </ul>
          {:else if $audioStore.chapters.length > 0}
            <ul class="pv-chapter-list">
              {#each $audioStore.chapters as chapter, i (i)}
                {@const played = i < $audioStore.currentChapterIndex}
                {@const active = i === $audioStore.currentChapterIndex}
                <li>
                  <button
                    class="pv-chapter-row"
                    class:played
                    class:active
                    onclick={() => seekToChapter(i)}
                  >
                    <span class="pv-chapter-marker mono">
                      {played ? "✓" : active ? "▸" : String(i + 1).padStart(2, "0")}
                    </span>
                    <span class="pv-chapter-title">{chapter.title}</span>
                    <span class="pv-chapter-time mono">{formatTimeShort(chapter.startTimeMs / 1000)}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}

          {#if bookmarks.length > 0}
            <h3 class="pv-section-heading">Bookmarks</h3>
            <ul class="pv-chapter-list">
              {#each bookmarks as bm (bm.id)}
                <li class="pv-chapter-row-wrap">
                  <button
                    class="pv-chapter-row"
                    onclick={() => seekToBookmark(bm.position, bm.trackIndex)}
                  >
                    <span class="material-symbols-outlined pv-chapter-marker">bookmark</span>
                    <span class="pv-chapter-title">{bm.name}</span>
                    <span class="pv-chapter-time mono">{formatTimeShort(bm.position)}</span>
                  </button>
                  <button
                    class="pv-chapter-remove"
                    onclick={() => removeBookmark(book!.filePath, bm.id)}
                    title="Remove bookmark"
                    aria-label="Remove bookmark"
                  >
                    <span class="material-symbols-outlined">close</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {:else if activeTab === "details" && userData}
        <div class="pv-details-pane">
          <div class="pv-details-grid">
            <section>
              <span class="pv-section-label">About</span>
              {#if userData.description}
                <p class="pv-about-text">{userData.description}</p>
              {:else}
                <p class="pv-empty-line">No description yet.</p>
              {/if}
            </section>
            <section>
              <span class="pv-section-label">Metadata</span>
              <div class="pv-meta-grid">
                {#if userData.narrator}
                  <div class="pv-meta-row"><span class="pv-meta-k">Narrator</span><span class="pv-meta-v">{userData.narrator}</span></div>
                {/if}
                {#if book.duration > 0}
                  <div class="pv-meta-row"><span class="pv-meta-k">Length</span><span class="pv-meta-v mono">{(book.duration / 3600).toFixed(1)}h</span></div>
                {/if}
                {#if userData.series}
                  <div class="pv-meta-row"><span class="pv-meta-k">Series</span><span class="pv-meta-v">{userData.series}{userData.seriesOrder ? ` · Book ${userData.seriesOrder}` : ""}</span></div>
                {/if}
                {#if userData.genre}
                  <div class="pv-meta-row"><span class="pv-meta-k">Genre</span><span class="pv-meta-v">{userData.genre}</span></div>
                {/if}
                <div class="pv-meta-row"><span class="pv-meta-k">Source</span><span class="pv-meta-v">{userData.source || "Local"}</span></div>
                {#if userData.yearRead}
                  <div class="pv-meta-row"><span class="pv-meta-k">Year read</span><span class="pv-meta-v mono">{userData.yearRead}</span></div>
                {/if}
                {#if userData.publishYear}
                  <div class="pv-meta-row"><span class="pv-meta-k">Published</span><span class="pv-meta-v mono">{userData.publishYear}</span></div>
                {/if}
                <div class="pv-meta-row"><span class="pv-meta-k">Added</span><span class="pv-meta-v">{formatDateAdded(userData.dateAdded)}</span></div>
                {#if userData.tags.length > 0}
                  <div class="pv-meta-row"><span class="pv-meta-k">Tags</span><span class="pv-meta-v">{userData.tags.join(" · ")}</span></div>
                {/if}
              </div>
            </section>
          </div>

          <section class="pv-details-full">
            <div class="pv-section-head">
              <span class="pv-section-label">Your notes</span>
              {#if !editingNotes}
                <button class="pv-edit-link" onclick={startNotesEdit}>{userData.notes ? "EDIT" : "+ ADD"}</button>
              {/if}
            </div>
            {#if editingNotes}
              <textarea
                class="pv-notes-edit"
                bind:value={notesDraft}
                use:focusOnMount
                onblur={commitNotes}
                placeholder="Your thoughts, takeaways, review…"
                maxlength={4000}
              ></textarea>
            {:else if userData.notes}
              <p class="pv-notes-view">{userData.notes}</p>
            {:else}
              <p class="pv-empty-line">No notes yet.</p>
            {/if}
          </section>

          <section class="pv-details-full">
            <div class="pv-section-head">
              <span class="pv-section-label">Favorite quotes</span>
            </div>
            {#if userData.quotes.length > 0}
              <div class="pv-quotes">
                {#each userData.quotes as q, i (i + q)}
                  <div class="pv-quote">
                    <span class="pv-quote-text">"{q}"</span>
                    <button class="pv-quote-remove" onclick={() => removeQuote(i)} title="Remove quote" aria-label="Remove quote">×</button>
                  </div>
                {/each}
              </div>
            {/if}
            <div class="pv-quote-add">
              <input
                type="text"
                class="pv-quote-input"
                bind:value={newQuoteInput}
                placeholder="Add a quote + Enter"
                onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); addQuote(); } }}
                maxlength={1000}
              />
              <button class="pv-quote-add-btn" onclick={addQuote} disabled={!newQuoteInput.trim()} aria-label="Add quote">
                <span class="material-symbols-outlined">add</span>
              </button>
            </div>
          </section>
        </div>
      {:else if activeTab === "rating" && userData}
        <div class="pv-rating-pane">
          <BookRankingCard {book} {userData} {currentTier} {otherListsCount} compact />
        </div>
      {/if}
    </div>
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

{#if editingBook && book}
  <BookEditDialog
    mode="edit"
    {book}
    collections={$userdataStore.collections}
    existingSeriesNames={[...new Set(
      Object.values($userdataStore.books)
        .map((ud) => ud.series)
        .filter((s): s is string => !!s),
    )]}
    onclose={() => (editingBook = false)}
  />
{/if}

<style>
  /* =========================================================================
     Player view — scroll-morphing layout (A+C merged)
     ---------------------------------------------------------------------- */

  .player-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
    color: var(--color-text);
    overflow: hidden;
    position: relative;
    min-height: 0;
  }

  .pv-glass-bg {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    filter: blur(60px) saturate(1.8);
    opacity: 0.1;
    pointer-events: none;
    z-index: 0;
  }

  .player-view > :not(.pv-glass-bg) {
    position: relative;
    z-index: 1;
  }

  /* ------ BackBar ------ */
  .pv-backbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 1rem;
    border-bottom: 1px solid var(--color-outline-variant);
    flex-shrink: 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
  }

  .pv-back-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    background: none;
    border: none;
    color: var(--color-text-variant);
    cursor: pointer;
    padding: 0.25rem 0.4rem;
    border-radius: var(--radius-md);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    transition: background 0.15s, color 0.15s;
  }

  .pv-back-btn:hover {
    background: var(--color-surface-high);
    color: var(--color-text);
  }

  .pv-back-btn .material-symbols-outlined { font-size: 0.95rem; }

  .pv-backbar-sep { opacity: 0.5; }

  .pv-backbar-title {
    flex: 1;
    min-width: 0;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
  }

  .pv-backbar-progress {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.65rem;
    color: var(--color-outline);
    letter-spacing: 0.05em;
  }

  .pv-mini-btn {
    background: none;
    border: none;
    color: var(--color-text-variant);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: var(--radius-md);
    display: inline-flex;
    align-items: center;
    transition: background 0.15s;
  }

  .pv-mini-btn:hover { background: var(--color-surface-high); }
  .pv-mini-btn .material-symbols-outlined { font-size: 1rem; }

  /* ------ Hero (morphs) ------ */
  .pv-hero {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.9rem 1.1rem 0.7rem;
    border-bottom: 1px solid var(--color-outline-variant);
    background: transparent;
    flex-shrink: 0;
    transition: padding 0.24s ease, background 0.24s ease;
  }

  .pv-hero.collapsed {
    padding: 0.5rem 1.1rem;
    background: var(--color-surface);
  }

  .pv-cover {
    width: 5.75rem;
    height: 5.75rem;
    border-radius: 0.4rem;
    flex-shrink: 0;
    overflow: hidden;
    background: var(--color-surface-high);
    box-shadow: var(--shadow-card);
    transition: width 0.24s ease, height 0.24s ease, border-radius 0.24s ease;
  }

  .pv-cover.collapsed {
    width: 2.625rem;
    height: 2.625rem;
    border-radius: 0.25rem;
  }

  .pv-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .pv-cover-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-outline-variant);
  }

  .pv-cover-placeholder .material-symbols-outlined { font-size: 2.5rem; }

  .pv-title-block {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .pv-title-big {
    font-family: var(--font-headline);
    font-size: 1.2rem;
    font-weight: 600;
    line-height: 1.2;
    color: var(--color-text);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: font-size 0.2s ease;
  }

  .pv-title-row {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
  }

  .pv-title-small {
    font-family: var(--font-headline);
    font-size: 0.9rem;
    font-weight: 600;
    line-height: 1.2;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
    transition: font-size 0.2s ease;
  }

  .pv-ch-compact {
    font-size: 0.7rem;
    color: var(--color-text-variant);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .pv-author-row {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    margin-top: 0.1rem;
  }

  .pv-author {
    font-family: var(--font-body);
    font-size: 0.75rem;
    color: var(--color-text-variant);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pv-ch-of-total {
    font-family: var(--font-label);
    font-size: 0.6rem;
    color: var(--color-outline);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 600;
    flex-shrink: 0;
  }

  .pv-progress-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.4rem;
  }

  .pv-time {
    font-size: 0.65rem;
    color: var(--color-text-variant);
    min-width: 2rem;
  }
  .pv-time.right { text-align: right; }

  .mono { font-family: var(--font-mono, ui-monospace, "JetBrains Mono", monospace); }

  .pv-waveform-wrap {
    flex: 1;
    min-width: 0;
  }

  .pv-progress-line {
    flex: 1;
    height: 0.2rem;
    background: color-mix(in srgb, var(--color-text) 10%, transparent);
    border-radius: 0.1rem;
    position: relative;
    cursor: pointer;
  }

  .pv-progress-fill {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: var(--color-primary);
    border-radius: 0.1rem;
    transition: width 0.2s ease-out;
  }

  /* ------ Transport ------ */
  .pv-transport {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex-shrink: 0;
    transition: gap 0.24s ease;
  }

  .pv-ctrl {
    width: 2rem;
    height: 2rem;
    background: transparent;
    border: none;
    color: var(--color-text);
    cursor: pointer;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, width 0.24s ease, height 0.24s ease;
  }

  .pv-ctrl:hover { background: color-mix(in srgb, var(--color-text) 6%, transparent); }
  .pv-ctrl .material-symbols-outlined { font-size: 1.25rem; }

  .pv-transport.collapsed .pv-ctrl {
    width: 1.75rem;
    height: 1.75rem;
  }
  .pv-transport.collapsed .pv-ctrl .material-symbols-outlined { font-size: 1.1rem; }

  .pv-play {
    width: 2.75rem;
    height: 2.75rem;
    background: var(--color-primary);
    color: var(--color-on-primary);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: box-shadow 0.2s, width 0.24s ease, height 0.24s ease, background 0.2s;
  }

  .pv-play:hover {
    box-shadow: 0 0 0.75rem color-mix(in srgb, var(--color-primary) 45%, transparent);
  }

  .pv-play .material-symbols-outlined { font-size: 1.4rem; }

  .pv-play.collapsed {
    width: 2.25rem;
    height: 2.25rem;
  }
  .pv-play.collapsed .material-symbols-outlined { font-size: 1.2rem; }

  /* ------ Hero divider + utility bar ------ */
  .pv-hero-divider {
    width: 1px;
    height: 2.6rem;
    background: var(--color-outline-variant);
    flex-shrink: 0;
  }

  .pv-util-bar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  /* ------ Volume group (icon + slider) ------ */
  .pv-volume-group {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .pv-volume-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 4rem;
    height: 0.3rem;
    background: var(--color-surface-high);
    border-radius: 0.15rem;
    outline: none;
    cursor: pointer;
    padding: 0;
    margin: 0;
  }

  .pv-volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 0.7rem;
    height: 0.7rem;
    background: var(--color-primary);
    border-radius: 50%;
    border: none;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }

  .pv-volume-slider::-moz-range-thumb {
    width: 0.7rem;
    height: 0.7rem;
    background: var(--color-primary);
    border-radius: 50%;
    border: none;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }

  .pv-volume-group.stacked {
    width: 100%;
  }

  .pv-volume-group.stacked .pv-volume-slider {
    flex: 1;
    width: auto;
  }

  /* ------ More menu (collapsed-state overflow) ------ */
  .pv-more-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }

  .pv-more-menu {
    position: absolute;
    top: calc(100% + 0.35rem);
    right: 0;
    background: var(--color-surface-lowest);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-ambient), 0 8px 24px rgba(0, 0, 0, 0.25);
    padding: 0.5rem;
    z-index: 50;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    min-width: 15rem;
    max-width: 18rem;
  }

  .pv-more-menu .sleep-wrap { margin-left: auto; }

  .pv-speed {
    height: 1.6rem;
    padding: 0 0.6rem;
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text);
    border-radius: 0.8rem;
    font-family: var(--font-label);
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .pv-speed:hover { background: var(--color-surface-highest); }

  .pv-util-icon {
    width: 1.6rem;
    height: 1.6rem;
    background: transparent;
    border: none;
    color: var(--color-text-variant);
    cursor: pointer;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
  }

  .pv-util-icon:hover {
    background: var(--color-surface-high);
    color: var(--color-text);
  }

  .pv-util-icon.active {
    color: var(--color-primary);
  }

  .pv-util-icon .material-symbols-outlined { font-size: 0.9rem; }

  .pv-util-icon.small {
    width: 1.5rem;
    height: 1.5rem;
  }
  .pv-util-icon.small .material-symbols-outlined { font-size: 0.85rem; }

  .ab-label {
    font-family: var(--font-label);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .sleep-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .sleep-countdown {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.65rem;
    color: var(--color-primary);
    font-weight: 600;
  }

  .sleep-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.25rem;
    background: var(--color-surface-lowest);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-ambient), 0 8px 24px rgba(0, 0, 0, 0.2);
    padding: 0.25rem;
    z-index: 30;
    min-width: 9rem;
  }

  .sleep-item {
    display: block;
    width: 100%;
    background: none;
    border: none;
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    padding: 0.4rem 0.7rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
  }

  .sleep-item:hover { background: var(--color-surface-high); }
  .sleep-item.active { color: var(--color-primary); font-weight: 600; }

  /* ------ Fileless CTA ------ */
  .pv-fileless-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.7rem;
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    flex-shrink: 0;
  }

  .pv-fileless-cta .material-symbols-outlined {
    color: var(--color-primary);
    font-size: 1.1rem;
  }

  .pv-fileless-text { display: flex; flex-direction: column; gap: 0.1rem; }
  .pv-fileless-title {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--color-text);
  }
  .pv-fileless-sub {
    font-size: 0.65rem;
    color: var(--color-text-variant);
  }
  .pv-fileless-open {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--color-primary);
    color: var(--color-on-primary);
    border: none;
    padding: 0.2rem 0.5rem;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: 0.65rem;
    font-weight: 600;
    cursor: pointer;
  }
  .pv-fileless-open .material-symbols-outlined {
    font-size: 0.75rem;
    color: var(--color-on-primary);
  }

  /* ------ Error bar ------ */
  .pv-error-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: color-mix(in srgb, var(--color-error) 12%, transparent);
    color: var(--color-error);
    font-size: var(--font-size-xs);
    flex-shrink: 0;
  }

  .pv-error-bar .material-symbols-outlined { font-size: 0.9rem; }

  /* ------ Tabs header ------ */
  .pv-tabs {
    display: flex;
    align-items: stretch;
    gap: 0.1rem;
    padding: 0 1.1rem;
    border-bottom: 1px solid var(--color-outline-variant);
    flex-shrink: 0;
  }

  .pv-tab {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.7rem 0.85rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    color: var(--color-text-variant);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .pv-tab:hover:not(.active) { color: var(--color-text); }

  .pv-tab.active {
    color: var(--color-text);
    border-bottom-color: var(--color-primary);
    font-weight: 600;
  }

  .pv-tab .material-symbols-outlined {
    font-size: 0.95rem;
    opacity: 0.7;
  }
  .pv-tab.active .material-symbols-outlined { opacity: 1; }

  .pv-tab-count {
    font-size: 0.65rem;
    color: var(--color-outline);
    font-weight: 500;
  }

  .pv-tab-badge {
    font-family: var(--font-label);
    font-size: 0.6rem;
    font-weight: 700;
    color: #1a0f0d;
    padding: 0.1rem 0.35rem;
    border-radius: 0.2rem;
    line-height: 1.1;
  }

  .pv-tabs-spacer { flex: 1; }

  /* ------ Tab body ------ */
  .pv-tab-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    animation: tab-in 0.16s ease-out;
  }

  @keyframes tab-in {
    from { opacity: 0; transform: translateY(3px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ------ Chapters pane ------ */
  .pv-chapters-pane {
    padding: 0.4rem 0.9rem 1rem;
  }

  .pv-section-heading {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-outline);
    margin: 1rem 0.25rem 0.4rem;
  }

  .pv-chapter-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .pv-chapter-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.55rem 0.75rem;
    background: transparent;
    border: none;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    text-align: left;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .pv-chapter-row:hover {
    background: var(--color-surface);
  }

  .pv-chapter-row.played {
    color: var(--color-text-variant);
  }

  .pv-chapter-row.active {
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    color: var(--color-primary);
    font-weight: 600;
  }

  .pv-chapter-marker {
    font-size: 0.65rem;
    color: var(--color-outline);
    width: 1.35rem;
    text-align: center;
    flex-shrink: 0;
  }

  .pv-chapter-row.active .pv-chapter-marker { color: var(--color-primary); }

  .pv-chapter-marker.material-symbols-outlined {
    font-size: 0.9rem;
  }

  .pv-chapter-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pv-chapter-time {
    font-size: 0.7rem;
    color: var(--color-text-variant);
    flex-shrink: 0;
  }

  .pv-chapter-row.active .pv-chapter-time { color: var(--color-primary); }

  .pv-chapter-row-wrap {
    display: flex;
    align-items: center;
    gap: 0.15rem;
  }

  .pv-chapter-row-wrap .pv-chapter-row { flex: 1; }

  .pv-chapter-remove {
    width: 1.5rem;
    height: 1.5rem;
    background: none;
    border: none;
    color: var(--color-outline);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s, background 0.15s;
  }

  .pv-chapter-row-wrap:hover .pv-chapter-remove,
  .pv-chapter-remove:focus-visible { opacity: 1; }

  .pv-chapter-remove:hover {
    color: var(--color-error);
    background: color-mix(in srgb, var(--color-error) 10%, transparent);
  }
  .pv-chapter-remove .material-symbols-outlined { font-size: 0.85rem; }

  /* ------ Details pane ------ */
  .pv-details-pane {
    padding: 1rem 1.3rem 1.3rem;
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
  }

  .pv-details-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.75rem;
  }

  @media (max-width: 640px) {
    .pv-details-grid { grid-template-columns: 1fr; gap: 1rem; }
  }

  .pv-section-label {
    display: block;
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-outline);
    margin-bottom: 0.45rem;
  }

  .pv-section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .pv-section-head .pv-section-label { margin-bottom: 0.45rem; }

  .pv-edit-link {
    background: none;
    border: none;
    color: var(--color-primary);
    font-family: var(--font-label);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    cursor: pointer;
    padding: 0;
  }

  .pv-edit-link:hover { text-decoration: underline; }

  .pv-about-text {
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    line-height: 1.6;
    color: var(--color-text);
    margin: 0;
    text-wrap: pretty;
  }

  .pv-meta-grid {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .pv-meta-row {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: var(--font-size-sm);
  }

  .pv-meta-k {
    font-family: var(--font-label);
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--color-outline);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .pv-meta-v {
    color: var(--color-text);
    text-align: right;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pv-details-full {
    width: 100%;
  }

  .pv-notes-view {
    font-family: var(--font-headline);
    font-size: var(--font-size-sm);
    font-style: italic;
    line-height: 1.55;
    color: var(--color-text-variant);
    white-space: pre-wrap;
    margin: 0;
  }

  .pv-notes-edit {
    width: 100%;
    min-height: 5rem;
    background: var(--color-surface);
    border: none;
    outline: none;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius-md);
    resize: vertical;
  }

  .pv-empty-line {
    font-size: var(--font-size-xs);
    color: var(--color-outline);
    font-style: italic;
    margin: 0;
  }

  .pv-quotes {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-bottom: 0.4rem;
  }

  .pv-quote {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    padding: 0.55rem 0.85rem;
    border-left: 2px solid var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 4%, var(--color-surface));
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
  }

  .pv-quote-text {
    flex: 1;
    font-family: var(--font-headline);
    font-style: italic;
    font-size: 0.9rem;
    line-height: 1.45;
    color: var(--color-text);
  }

  .pv-quote-remove {
    background: none;
    border: none;
    color: var(--color-outline);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0 0.25rem;
  }

  .pv-quote-remove:hover { color: var(--color-error); }

  .pv-quote-add {
    display: flex;
    gap: 0.3rem;
  }

  .pv-quote-input {
    flex: 1;
    background: var(--color-surface);
    border: none;
    outline: none;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    padding: 0.45rem 0.65rem;
    border-radius: var(--radius-md);
  }

  .pv-quote-add-btn {
    width: 2rem;
    background: var(--color-surface);
    border: none;
    color: var(--color-text-variant);
    border-radius: var(--radius-md);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .pv-quote-add-btn:hover:not(:disabled) {
    background: var(--color-primary);
    color: var(--color-on-primary);
  }

  .pv-quote-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .pv-quote-add-btn .material-symbols-outlined { font-size: 1rem; }

  /* ------ Rating pane ------ */
  .pv-rating-pane {
    padding: 1rem 1.3rem 1.3rem;
  }

  /* ------ Empty state ------ */
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

  /* Narrow-window: let the hero wrap its utility bar to a second row
     instead of clipping. Collapsed state also uses the more-menu fallback. */
  @media (max-width: 720px) {
    .pv-hero:not(.collapsed) {
      flex-wrap: wrap;
      row-gap: 0.4rem;
    }
    .pv-hero:not(.collapsed) .pv-title-block {
      flex-basis: 60%;
    }
  }
</style>
