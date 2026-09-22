<script lang="ts">
  /**
   * A book's page, opened from the library without loading it into the
   * player: what it is, where you are in it, your notes and quotes, its
   * files, chapters and bookmarks. Notes and quotes are edited in place;
   * everything else goes through Edit.
   */
  import type { BookMeta, BookStatus, Collection } from "../../types";
  import {
    userdataStore,
    defaultUserBookData,
    getDisplayTitle,
    getDisplayAuthor,
    getDisplayCover,
  } from "../../stores/userdataStore";
  import { libraryStore } from "../../stores/libraryStore";
  import { bookmarkStore } from "../../stores/bookmarkStore";
  import { defaultTierList, getBookTier } from "../../stores/tierListStore";
  import { formatTime, formatTimeShort, progressPercent } from "../../utils/format";
  import Modal from "../Modal.svelte";
  import StatusBadge from "../StatusBadge.svelte";
  import CollectionTag from "../CollectionTag.svelte";
  import DetailsTab from "../player/DetailsTab.svelte";
  import { Cover, IconButton, Pill, TierChip } from "../ui";

  interface Props {
    book: BookMeta;
    collections: Collection[];
    onclose: () => void;
    onplay: (book: BookMeta) => void;
    onedit: (book: BookMeta) => void;
    onstatus: (book: BookMeta, status: BookStatus) => void;
  }

  let { book: opened, collections, onclose, onplay, onedit, onstatus }: Props = $props();

  const BLANK = defaultUserBookData();
  const STATUSES: { value: BookStatus; label: string }[] = [
    { value: "not_started", label: "Not started" },
    { value: "in_progress", label: "Reading" },
    { value: "finished", label: "Finished" },
  ];
  /** Long lists start folded so notes stay near the top. */
  const FOLD_AT = 12;

  // The live entry, so an edit or a rescan made while this is open shows up
  let book = $derived($libraryStore.books.find((b) => b.filePath === opened.filePath) ?? opened);
  let stored = $derived($userdataStore.books[book.filePath]);
  let userData = $derived(stored ?? BLANK);
  let title = $derived(getDisplayTitle(book, stored));
  let author = $derived(getDisplayAuthor(book, stored));
  let cover = $derived(getDisplayCover(book, stored));
  let status = $derived(userData.status);
  let tier = $derived(getBookTier($defaultTierList, book.filePath));
  let bookCollections = $derived(
    userData.collections
      .map((id) => collections.find((c) => c.id === id))
      .filter(Boolean) as Collection[],
  );

  let saved = $derived($libraryStore.positions[book.filePath]);
  let progress = $derived(
    saved && status !== "not_started" ? progressPercent(saved.position, saved.duration) : 0,
  );
  let remaining = $derived(saved && progress > 0 ? Math.max(0, saved.duration - saved.position) : 0);

  let bookmarks = $derived($bookmarkStore[book.filePath] ?? []);
  let files = $derived(
    book.tracks.length > 0
      ? book.tracks.map((t) => ({ path: t.filePath, title: t.title, duration: t.duration }))
      : book.fileless
        ? []
        : [{ path: book.filePath, title: fileName(book.filePath), duration: book.duration }],
  );
  let folder = $derived(files.length > 0 ? parentDir(files[0].path) : "");

  let allFiles = $state(false);
  let allChapters = $state(false);
  let shownFiles = $derived(allFiles ? files : files.slice(0, FOLD_AT));
  let shownChapters = $derived(allChapters ? book.chapters : book.chapters.slice(0, FOLD_AT));

  function fileName(path: string): string {
    return path.split(/[/\\]/).pop() || path;
  }

  function parentDir(path: string): string {
    const parts = path.split(/[/\\]/);
    parts.pop();
    return parts.join(path.includes("\\") ? "\\" : "/");
  }
</script>

<Modal {onclose} label="Book details" maxWidth="46rem">
  <div class="bd">
    <header class="bd-head">
      <Cover src={cover} alt="" size="8.5rem" natural logged={book.fileless === true} />
      <div class="bd-head-text">
        <h2 class="bd-title">{title}</h2>
        <p class="bd-author">{author}</p>

        <div class="bd-facts">
          <StatusBadge {status} size="md" />
          {#if tier}<TierChip label={tier.label} color={tier.color} size="1.25rem" />{/if}
          {#if book.duration > 0}<span class="mono">{formatTime(book.duration)}</span>{/if}
          {#if files.length > 1}<span class="mono">{files.length} files</span>{/if}
          {#if book.chapters.length > 0}<span class="mono">{book.chapters.length} chapters</span>{/if}
        </div>

        {#if progress > 0}
          <div class="bd-progress">
            <div class="bd-track"><div class="bd-fill" style:width="{progress}%"></div></div>
            <span class="mono">{Math.round(progress)}% · {formatTime(remaining)} left</span>
          </div>
        {/if}

        {#if bookCollections.length > 0}
          <div class="bd-collections">
            {#each bookCollections as col (col.id)}
              <CollectionTag name={col.name} color={col.color} />
            {/each}
          </div>
        {/if}

        <div class="bd-actions">
          {#if !book.fileless}
            <button class="bd-primary" onclick={() => { onclose(); onplay(book); }}>
              <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>
              {progress > 0 ? "Resume" : "Play"}
            </button>
          {/if}
          <Pill icon="edit" label="Edit" height="2.1rem" onclick={() => onedit(book)} />
          <div class="bd-status" role="group" aria-label="Status">
            {#each STATUSES as s (s.value)}
              <button
                class="bd-status-btn"
                class:on={status === s.value}
                aria-pressed={status === s.value}
                onclick={() => status !== s.value && onstatus(book, s.value)}
              >
                {s.label}
              </button>
            {/each}
          </div>
        </div>
      </div>
      <span class="bd-close">
        <IconButton icon="close" label="Close" size="2rem" bare onclick={onclose} />
      </span>
    </header>

    <DetailsTab {book} {userData} />

    {#if files.length > 0}
      <section class="bd-section">
        <div class="bd-section-head">
          <span class="bd-label">{files.length === 1 ? "File" : `Files · ${files.length}`}</span>
          {#if folder}<span class="bd-path mono" title={folder}>{folder}</span>{/if}
        </div>
        <ol class="bd-list">
          {#each shownFiles as f, i (f.path)}
            <li class="bd-row" title={f.path}>
              <span class="bd-num mono">{String(i + 1).padStart(2, "0")}</span>
              <span class="bd-row-title">{files.length === 1 ? f.title : fileName(f.path)}</span>
              {#if f.duration > 0}<span class="bd-row-meta mono">{formatTimeShort(f.duration)}</span>{/if}
            </li>
          {/each}
        </ol>
        {#if files.length > FOLD_AT}
          <button class="bd-more" onclick={() => (allFiles = !allFiles)}>
            {allFiles ? "Show fewer" : `Show all ${files.length}`}
          </button>
        {/if}
      </section>
    {/if}

    {#if book.chapters.length > 0}
      <section class="bd-section">
        <div class="bd-section-head">
          <span class="bd-label">Chapters · {book.chapters.length}</span>
        </div>
        <ol class="bd-list">
          {#each shownChapters as c, i (i)}
            <li class="bd-row">
              <span class="bd-num mono">{String(i + 1).padStart(2, "0")}</span>
              <span class="bd-row-title">{c.title}</span>
              <span class="bd-row-meta mono">{formatTimeShort(c.startTimeMs / 1000)}</span>
            </li>
          {/each}
        </ol>
        {#if book.chapters.length > FOLD_AT}
          <button class="bd-more" onclick={() => (allChapters = !allChapters)}>
            {allChapters ? "Show fewer" : `Show all ${book.chapters.length}`}
          </button>
        {/if}
      </section>
    {/if}

    {#if bookmarks.length > 0}
      <section class="bd-section">
        <div class="bd-section-head">
          <span class="bd-label">Bookmarks · {bookmarks.length}</span>
        </div>
        <ol class="bd-list">
          {#each bookmarks as bm (bm.id)}
            <li class="bd-row">
              <span class="material-symbols-outlined bd-num" aria-hidden="true">bookmark</span>
              <span class="bd-row-title">{bm.name}</span>
              <span class="bd-row-meta mono">{formatTimeShort(bm.position)}</span>
            </li>
          {/each}
        </ol>
      </section>
    {/if}
  </div>
</Modal>

<style>
  .bd {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .bd-head {
    position: relative;
    display: flex;
    gap: 1.2rem;
    align-items: flex-start;
    padding-right: 2rem;
  }

  .bd-head-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .bd-title {
    margin: 0;
    font-family: var(--font-headline);
    font-size: 1.45rem;
    font-weight: 500;
    line-height: 1.2;
    text-wrap: balance;
  }

  .bd-author {
    margin: 0;
    font-family: var(--font-label);
    font-size: 0.85rem;
    color: var(--color-text-variant);
  }

  .bd-facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.8rem;
    font-size: 0.73rem;
    color: var(--color-text-variant);
  }

  .bd-progress {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.73rem;
    color: var(--color-text-variant);
  }

  .bd-track {
    flex: 1;
    max-width: 14rem;
    height: 3px;
    background: var(--color-outline-variant);
  }

  .bd-fill {
    height: 100%;
    background: var(--color-primary);
  }

  .bd-collections {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .bd-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.2rem;
  }

  .bd-primary {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    height: 2.1rem;
    padding: 0 0.95rem 0 0.7rem;
    border: none;
    border-radius: var(--radius-xl);
    background: var(--color-ink);
    color: var(--color-on-ink);
    font-family: var(--font-label);
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
  }

  .bd-primary .material-symbols-outlined {
    font-size: 1.2rem;
    font-variation-settings: "FILL" 1;
  }

  .bd-status {
    display: inline-flex;
    padding: 0.14rem;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-xl);
  }

  .bd-status-btn {
    height: 1.7rem;
    padding: 0 0.7rem;
    border: none;
    border-radius: var(--radius-xl);
    background: none;
    color: var(--color-text-variant);
    font-family: var(--font-label);
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
  }

  .bd-status-btn.on {
    background: var(--color-surface-highest);
    color: var(--color-text);
  }

  .bd-close {
    position: absolute;
    top: -0.4rem;
    right: -0.4rem;
  }

  /* DetailsTab brings the player pane's padding; here the dialog already pads */
  .bd :global(.pv-details-pane) {
    padding: 1rem 0 0.4rem;
  }

  .bd-section {
    padding-top: 0.8rem;
    border-top: 1px solid var(--color-outline-variant);
  }

  .bd-section-head {
    display: flex;
    align-items: baseline;
    gap: 0.8rem;
    margin-bottom: 0.35rem;
  }

  .bd-label {
    flex-shrink: 0;
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-outline);
  }

  .bd-path {
    min-width: 0;
    font-size: 0.68rem;
    color: var(--color-text-variant);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bd-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .bd-row {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    height: 1.9rem;
    font-family: var(--font-label);
    font-size: 0.78rem;
  }

  .bd-num {
    flex-shrink: 0;
    width: 1.5rem;
    font-size: 0.7rem;
    color: var(--color-outline);
    text-align: right;
  }

  .material-symbols-outlined.bd-num {
    font-size: 1rem;
  }

  .bd-row-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bd-row-meta {
    flex-shrink: 0;
    font-size: 0.7rem;
    color: var(--color-text-variant);
  }

  .bd-more {
    margin-top: 0.2rem;
    padding: 0.2rem 0;
    background: none;
    border: none;
    color: var(--color-primary);
    font-family: var(--font-label);
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
  }

  .bd-more:hover {
    text-decoration: underline;
  }

  @media (max-width: 560px) {
    .bd-head {
      flex-direction: column;
    }
  }
</style>
