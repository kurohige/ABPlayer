<script lang="ts">
  /**
   * Player, "split" (handoff 1c): a header, the listening column on the left
   * and the chapters / details / rating column on the right. The scroll-morph
   * hero of v1.1.2 is gone — nothing collapses now, because the controls and
   * the chapter list are both meant to stay visible.
   */
  import { audioStore } from "../stores/audioStore";
  import {
    userdataStore,
    defaultUserBookData,
    getDisplayTitle,
    getDisplayAuthor,
    getDisplayCover,
  } from "../stores/userdataStore";
  import { tierListsStore, defaultTierList, getBookTier } from "../stores/tierListStore";
  import BookRankingCard from "./BookRankingCard.svelte";
  import BookEditDialog from "./BookEditDialog.svelte";
  import PlayerStage from "./player/PlayerStage.svelte";
  import ChaptersTab from "./player/ChaptersTab.svelte";
  import DetailsTab from "./player/DetailsTab.svelte";
  import { IconButton, Pill } from "./ui";

  interface Props {
    onback?: () => void;
    onminiplayer?: () => void;
  }

  let { onback, onminiplayer }: Props = $props();

  let editingBook = $state(false);
  let unplayedOnly = $state(false);

  let book = $derived($audioStore.currentBook);
  let userData = $derived(book ? $userdataStore.books[book.filePath] : undefined);
  /** Details and Rating need a record; a book with none yet gets a blank one
   *  rather than an empty pane. Edits there create the real record. */
  const BLANK_USER_DATA = defaultUserBookData();
  let tabUserData = $derived(userData ?? BLANK_USER_DATA);
  let title = $derived(book ? getDisplayTitle(book, userData) : "");
  let author = $derived(book ? getDisplayAuthor(book, userData) : "");
  let cover = $derived(book ? getDisplayCover(book, userData) : null);
  let isFileless = $derived(book?.fileless === true);
  let isMultiFile = $derived(book ? book.tracks.length > 1 : false);

  let overallPercent = $derived(
    $audioStore.duration > 0
      ? Math.round(($audioStore.currentTime / $audioStore.duration) * 100)
      : 0,
  );

  let totalChapters = $derived(isMultiFile ? $audioStore.totalTracks : $audioStore.chapters.length);

  type PlayerTab = "chapters" | "details" | "rating";
  let activeTab = $state<PlayerTab>("chapters");

  const TABS: { value: PlayerTab; label: string }[] = [
    { value: "chapters", label: "Chapters" },
    { value: "details", label: "Details" },
    { value: "rating", label: "Rating" },
  ];

  // Fileless books have no chapters pane to show
  $effect(() => {
    if (isFileless && activeTab === "chapters") activeTab = "details";
  });

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

  let rightMeta = $derived.by(() => {
    if (activeTab !== "chapters") return "";
    if (isMultiFile) return `${totalChapters} tracks`;
    return totalChapters > 0 ? `${totalChapters} chapters` : "No chapters";
  });
</script>

<div class="pv">
  {#if !book}
    <div class="pv-empty">
      <span class="material-symbols-outlined pv-empty-icon" aria-hidden="true">headphones</span>
      <p class="pv-empty-title">Nothing playing</p>
      <p class="pv-empty-hint">Pick a book in the library to start listening.</p>
      {#if onback}
        <Pill icon="arrow_back" label="Library" onclick={onback} />
      {/if}
    </div>
  {:else}
    <header class="pv-head">
      {#if onback}
        <Pill icon="arrow_back" label="Library" height="2.1rem" onclick={onback} />
      {/if}
      <span class="pv-crumb mono" title="{title} · {author}">{title} · {author}</span>
      <span class="pv-head-right">
        {#if !isFileless}
          <span class="pv-pct mono">{overallPercent}% of book</span>
        {/if}
        <IconButton
          icon="edit"
          label="Edit book details"
          size="2.1rem"
          onclick={() => (editingBook = true)}
        />
        {#if onminiplayer}
          <IconButton
            icon="picture_in_picture_alt"
            label="Open the mini player"
            size="2.1rem"
            onclick={onminiplayer}
          />
        {/if}
      </span>
    </header>

    {#if $audioStore.error}
      <div class="pv-error" role="alert">
        <span class="material-symbols-outlined" aria-hidden="true">error</span>
        {$audioStore.error}
      </div>
    {/if}

    <div class="pv-cols">
      <PlayerStage {book} {userData} {title} {author} {cover} />

      <div class="pv-side">
        <div class="pv-tabs">
          <div class="pv-seg" role="tablist" aria-label="Book panes">
            {#each TABS as tab (tab.value)}
              {#if tab.value !== "chapters" || !isFileless}
                <button
                  class="pv-seg-btn"
                  class:selected={activeTab === tab.value}
                  role="tab"
                  aria-selected={activeTab === tab.value}
                  onclick={() => (activeTab = tab.value)}
                >
                  {tab.label}
                </button>
              {/if}
            {/each}
          </div>

          {#if rightMeta}
            <span class="pv-meta mono">{rightMeta}</span>
          {/if}

          {#if activeTab === "chapters" && !isMultiFile && $audioStore.chapters.length > 0}
            <Pill
              label="Unplayed only"
              height="1.8rem"
              selected={unplayedOnly}
              onclick={() => (unplayedOnly = !unplayedOnly)}
            />
          {/if}
        </div>

        <div class="pv-pane">
          {#if activeTab === "chapters"}
            <ChaptersTab {book} {unplayedOnly} />
          {:else if activeTab === "details"}
            <DetailsTab {book} userData={tabUserData} />
          {:else}
            <div class="pv-rating">
              <BookRankingCard
                {book}
                userData={tabUserData}
                {currentTier}
                {otherListsCount}
                compact
              />
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

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
  .pv {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--color-bg);
    /* A query container's intrinsic width is zero, so as a flex item of
       .app-content it must claim the row explicitly. Named so PlayerStage
       can stack on the same width (see its .ps rule). */
    flex: 1;
    min-width: 0;
    container: player / inline-size;
  }

  .pv-head {
    display: flex;
    align-items: center;
    gap: 0.83rem;
    height: 3.2rem;
    padding: 0 1.1rem;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-outline-variant);
  }

  .pv-crumb {
    flex: 1;
    min-width: 0;
    font-size: 0.73rem;
    color: var(--color-text-variant);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pv-head-right {
    display: flex;
    align-items: center;
    gap: 0.42rem;
    flex-shrink: 0;
  }

  .pv-pct {
    font-size: 0.73rem;
    color: var(--color-outline);
    white-space: nowrap;
  }

  .pv-error {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.55rem 1.1rem;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--color-error) 12%, transparent);
    color: var(--color-error);
    font-family: var(--font-body);
    font-size: 0.76rem;
  }

  .pv-error .material-symbols-outlined {
    font-size: 1.05rem;
  }

  .pv-cols {
    flex: 1;
    min-height: 0;
    display: flex;
  }

  .pv-side {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .pv-tabs {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    height: 3.2rem;
    padding: 0 0.97rem;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-outline-variant);
  }

  .pv-seg {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 2.1rem;
    padding: 2px;
    background: var(--color-surface-high);
    border-radius: var(--radius-md);
  }

  .pv-seg-btn {
    height: 100%;
    padding: 0 0.7rem;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-variant);
    font-family: var(--font-label);
    font-size: 0.76rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background var(--motion-fast) ease,
      color var(--motion-fast) ease;
  }

  .pv-seg-btn.selected {
    background: var(--color-surface);
    color: var(--color-text);
    font-weight: 700;
  }

  .pv-seg-btn:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }

  .pv-meta {
    font-size: 0.73rem;
    color: var(--color-outline);
    white-space: nowrap;
  }

  .pv-pane {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.7rem 0.97rem 1.4rem;
  }

  .pv-rating {
    max-width: 34rem;
  }

  .pv-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.42rem;
    text-align: center;
  }

  .pv-empty-icon {
    font-size: 2.9rem;
    color: var(--color-outline-variant);
    margin-bottom: 0.42rem;
  }

  .pv-empty-title {
    margin: 0;
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
  }

  .pv-empty-hint {
    margin: 0 0 0.83rem;
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    color: var(--color-text-variant);
  }

  /* Narrower than stage + a usable side column: the two stack, stage first,
     and the whole thing scrolls as one instead of two nested scrollers */
  @container player (max-width: 46rem) {
    .pv-cols {
      flex-direction: column;
      overflow-y: auto;
    }

    .pv-side {
      flex: none;
    }

    .pv-pane {
      flex: none;
      overflow: visible;
    }
  }
</style>
