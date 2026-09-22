<script lang="ts">
  import { bookDragSource } from "../utils/pointerDrag";
  import { Cover } from "./ui";
  import type { BookMeta, BookStatus, UserBookData, Collection } from "../types";
  import { formatTime, progressPercent } from "../utils/format";
  import { getDisplayTitle, getDisplayAuthor, getDisplayCover } from "../stores/userdataStore";
  import StatusBadge from "./StatusBadge.svelte";
  import CollectionTag from "./CollectionTag.svelte";
  import BookMenu from "./library/BookMenu.svelte";

  interface Props {
    book: BookMeta;
    userData?: UserBookData | undefined;
    collections: Collection[];
    position?: { position: number; duration: number } | undefined;
    selectionMode?: boolean;
    selected?: boolean;
    onedit: (book: BookMeta) => void;
    onplay: (book: BookMeta) => void;
    /** The book's page: files, notes, details. */
    ondetails?: (book: BookMeta) => void;
    onstatus?: (book: BookMeta, status: BookStatus) => void;
    onremove?: (book: BookMeta) => void;
    /** Offered on multi-file books: back to one entry per file. */
    onsplit?: (book: BookMeta) => void;
    /** `range` is true for a shift-click: select everything since the last pick. */
    ontoggleselect?: (book: BookMeta, range: boolean) => void;
  }

  let { book, userData, collections, position, selectionMode = false, selected = false, onedit, onplay, ondetails, onstatus, onremove, onsplit, ontoggleselect }: Props = $props();

  let title = $derived(getDisplayTitle(book, userData));
  let author = $derived(getDisplayAuthor(book, userData));
  let cover = $derived(getDisplayCover(book, userData));
  let status = $derived(userData?.status || "not_started");
  // A book marked not started shows no progress at all, whatever was saved
  let progress = $derived(
    position && status !== "not_started" ? progressPercent(position.position, position.duration) : 0,
  );
  let bookCollections = $derived(
    (userData?.collections || [])
      .map((id) => collections.find((c) => c.id === id))
      .filter(Boolean) as Collection[],
  );
  let seriesLabel = $derived(
    userData?.series
      ? userData.seriesOrder
        ? `${userData.series} #${userData.seriesOrder}`
        : userData.series
      : null,
  );

  let contextMenu = $state<{ x: number; y: number } | null>(null);

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY };
  }
</script>

<div
  class="list-item"
  class:selected
  role="listitem"
  oncontextmenu={handleContextMenu}
  use:bookDragSource={{ payload: { filePath: book.filePath } }}
>
  <button
    class="list-item-main"
    data-press="none"
    onclick={(e) => selectionMode && ontoggleselect?.(book, e.shiftKey)}
    aria-pressed={selectionMode ? selected : undefined}
    ondblclick={() => !selectionMode && onplay(book)}
  >
    {#if selectionMode}
      <span class="select-check" class:on={selected}>
        <span class="material-symbols-outlined" aria-hidden="true">
          {selected ? "check_circle" : "radio_button_unchecked"}
        </span>
      </span>
    {/if}
    <span class="cover-slot">
      <Cover src={cover} alt="" size="3.2rem" natural logged={book.fileless === true} />
    </span>
    <div class="info">
      <div class="info-top">
        <span class="title">{title}</span>
        <span class="author">{author}</span>
        {#if book.duration > 0}
          <span class="duration">{formatTime(book.duration)}</span>
        {/if}
      </div>
      <div class="info-bottom">
        {#if progress > 0}
          <div class="progress-track">
            <div class="progress-fill" style:width="{progress}%"></div>
          </div>
          <span class="progress-text">{Math.round(progress)}%</span>
        {/if}
        <StatusBadge {status} />
        {#if seriesLabel}
          <span class="series-badge">{seriesLabel}</span>
        {/if}
        {#each bookCollections as col (col.id)}
          <CollectionTag name={col.name} color={col.color} />
        {/each}
      </div>
    </div>
  </button>
  {#if ondetails}
    <button class="row-btn" onclick={() => ondetails(book)} title="View book" aria-label="View book">
      <span class="material-symbols-outlined">info</span>
    </button>
  {/if}
  <button class="row-btn" onclick={() => onedit(book)} title="Edit" aria-label="Edit">
    <span class="material-symbols-outlined">edit</span>
  </button>
  {#if onsplit && book.tracks.length > 1}
    <button class="row-btn" onclick={() => onsplit(book)} title="Split into files" aria-label="Split into files">
      <span class="material-symbols-outlined">call_split</span>
    </button>
  {/if}
  {#if onremove}
    <button class="row-btn danger" onclick={() => onremove(book)} title="Remove" aria-label="Remove">
      <span class="material-symbols-outlined">close</span>
    </button>
  {/if}
</div>

{#if contextMenu}
  <BookMenu
    {book}
    {userData}
    {collections}
    x={contextMenu.x}
    y={contextMenu.y}
    onclose={() => (contextMenu = null)}
    onplay={() => onplay(book)}
    ondetails={ondetails ? () => ondetails(book) : undefined}
    onedit={() => onedit(book)}
    onstatus={onstatus ? (s) => onstatus(book, s) : undefined}
    onsplit={onsplit ? () => onsplit(book) : undefined}
    onremove={onremove ? () => onremove(book) : undefined}
  />
{/if}

<style>
  .list-item {
    display: flex;
    align-items: center;
    border-radius: var(--radius-md);
    transition: background 0.15s;
  }

  .list-item:hover {
    background: var(--color-surface);
  }

  .list-item.selected {
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  }

  .list-item-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.35rem 0.7rem;
    background: none;
    border: none;
    color: var(--color-text);
    font: inherit;
    cursor: pointer;
    text-align: left;
    min-width: 0;
  }

  /* The circle is part of the row button, so the whole row selects, circle included */
  .select-check {
    flex-shrink: 0;
    display: flex;
    color: var(--color-outline);
  }

  .select-check.on {
    color: var(--color-primary);
  }

  .select-check .material-symbols-outlined {
    font-size: 1.5rem;
  }

  .select-check.on .material-symbols-outlined {
    font-variation-settings: "FILL" 1;
  }

  /* Fixed slot so titles line up whatever shape each cover is */
  .cover-slot {
    flex-shrink: 0;
    width: 3.2rem;
    height: 3.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .info-top {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
  }

  .title {
    font-family: var(--font-headline);
    font-size: var(--font-size-md);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
  }

  .author {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .duration {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-outline);
    white-space: nowrap;
    flex-shrink: 0;
    margin-left: auto;
  }

  .info-bottom {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .progress-track {
    width: 5rem;
    height: 3px;
    background: var(--color-surface-highest);
    flex-shrink: 0;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-primary-container);
  }

  .progress-text {
    font-family: var(--font-label);
    font-size: 0.6rem;
    color: var(--color-outline);
    font-variant-numeric: tabular-nums;
  }

  .series-badge {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--color-primary);
    white-space: nowrap;
  }

  .row-btn {
    background: none;
    border: none;
    color: var(--color-outline);
    cursor: pointer;
    padding: 0.4rem;
    border-radius: var(--radius-md);
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .list-item:hover .row-btn,
  .list-item:focus-within .row-btn {
    opacity: 1;
  }

  .row-btn:hover {
    color: var(--color-text);
  }

  .row-btn.danger:hover {
    color: var(--color-error);
  }

  .row-btn .material-symbols-outlined {
    font-size: 1.15rem;
  }
</style>
