<script lang="ts">
  import type { BookMeta, UserBookData, Collection } from "../types";
  import { formatTime, progressPercent } from "../utils/format";
  import { getDisplayTitle, getDisplayAuthor, getDisplayCover } from "../stores/userdataStore";
  import StatusBadge from "./StatusBadge.svelte";
  import CollectionTag from "./CollectionTag.svelte";

  interface Props {
    book: BookMeta;
    userData?: UserBookData | undefined;
    collections: Collection[];
    position?: { position: number; duration: number } | undefined;
    selectionMode?: boolean;
    selected?: boolean;
    onedit: (book: BookMeta) => void;
    onplay: (book: BookMeta) => void;
    onremove?: (book: BookMeta) => void;
    ontoggleselect?: (book: BookMeta) => void;
  }

  let { book, userData, collections, position, selectionMode = false, selected = false, onedit, onplay, onremove, ontoggleselect }: Props = $props();

  let title = $derived(getDisplayTitle(book, userData));
  let author = $derived(getDisplayAuthor(book, userData));
  let cover = $derived(getDisplayCover(book, userData));
  let status = $derived(userData?.status || "not_started");
  let progress = $derived(
    position ? progressPercent(position.position, position.duration) : 0,
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
</script>

<div
  class="list-item"
  role="listitem"
  draggable="true"
  ondragstart={(e: DragEvent) => {
    e.dataTransfer?.setData("text/plain", book.filePath);
    e.dataTransfer!.effectAllowed = "copy";
  }}
>
  <button class="list-item-main" onclick={() => selectionMode && ontoggleselect ? ontoggleselect(book) : null} ondblclick={() => !selectionMode && onplay(book)}>
    {#if selectionMode}
      <span class="material-symbols-outlined select-check" style="font-size:18px; font-variation-settings: 'FILL' {selected ? 1 : 0}; color: {selected ? 'var(--color-primary)' : 'var(--color-outline)'};">
        {selected ? "check_circle" : "radio_button_unchecked"}
      </span>
    {/if}
    <div class="thumb">
      {#if cover}
        <img src={cover} alt="" />
      {:else}
        <span class="material-symbols-outlined thumb-icon">auto_stories</span>
      {/if}
    </div>
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
        {#each bookCollections as col}
          <CollectionTag name={col.name} color={col.color} />
        {/each}
      </div>
    </div>
  </button>
  <button class="edit-btn" onclick={() => onedit(book)} title="Edit">
    <span class="material-symbols-outlined">edit</span>
  </button>
  {#if onremove}
    <button class="remove-btn" onclick={() => onremove(book)} title="Remove">
      <span class="material-symbols-outlined">close</span>
    </button>
  {/if}
</div>

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

  .list-item-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 10px;
    background: none;
    border: none;
    color: var(--color-text);
    font: inherit;
    cursor: pointer;
    text-align: left;
    min-width: 0;
  }

  .thumb {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--color-surface-high);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumb-icon {
    font-size: 20px;
    color: var(--color-outline-variant);
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
    width: 80px;
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

  .edit-btn {
    background: none;
    border: none;
    color: var(--color-outline);
    cursor: pointer;
    padding: 6px;
    border-radius: var(--radius-md);
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .list-item:hover .edit-btn {
    opacity: 1;
  }

  .edit-btn:hover {
    color: var(--color-primary);
  }

  .edit-btn .material-symbols-outlined {
    font-size: 18px;
  }

  .remove-btn {
    background: none;
    border: none;
    color: var(--color-outline);
    cursor: pointer;
    padding: 6px;
    border-radius: var(--radius-md);
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .list-item:hover .remove-btn {
    opacity: 1;
  }

  .remove-btn:hover {
    color: var(--color-error);
  }

  .remove-btn .material-symbols-outlined {
    font-size: 18px;
  }
</style>
