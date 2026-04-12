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
    isPlaying?: boolean;
    focused?: boolean;
    onedit: (book: BookMeta) => void;
    onplay: (book: BookMeta) => void;
    onremove?: (book: BookMeta) => void;
    ontoggleselect?: (book: BookMeta) => void;
  }

  let { book, userData, collections, position, selectionMode = false, selected = false, isPlaying = false, focused = false, onedit, onplay, onremove, ontoggleselect }: Props = $props();

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

  let contextMenu = $state<{ x: number; y: number } | null>(null);

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY };
    const close = () => { contextMenu = null; window.removeEventListener("click", close); };
    setTimeout(() => window.addEventListener("click", close), 0);
  }
</script>

<div
  class="book-card"
  class:now-playing={isPlaying}
  class:kbd-focus={focused}
  role="listitem"
  draggable="true"
  oncontextmenu={handleContextMenu}
  ondragstart={(e: DragEvent) => {
    e.dataTransfer?.setData("text/plain", book.filePath);
    e.dataTransfer!.effectAllowed = "copy";
  }}
>
  <button class="card-main" onclick={() => selectionMode && ontoggleselect ? ontoggleselect(book) : null} ondblclick={() => !selectionMode && onplay(book)}>
    <div class="cover">
      {#if cover}
        <img src={cover} alt={title} />
      {:else}
        <div class="cover-placeholder">
          <span class="material-symbols-outlined">auto_stories</span>
        </div>
      {/if}
      {#if isPlaying}
        <div class="playing-indicator">
          <span class="eq-bars">
            <span></span><span></span><span></span>
          </span>
        </div>
      {:else if status !== "not_started"}
        <div class="status-overlay">
          <StatusBadge {status} />
        </div>
      {/if}
      {#if progress > 0 && !isPlaying}
        <div class="progress-ring-wrap">
          <svg class="progress-ring" viewBox="0 0 28 28">
            <circle cx="14" cy="14" r="11" fill="none" stroke="var(--color-surface-highest)" stroke-width="2.5" />
            <circle cx="14" cy="14" r="11" fill="none" stroke="var(--color-primary)" stroke-width="2.5"
              stroke-dasharray="{11 * 2 * Math.PI}"
              stroke-dashoffset="{11 * 2 * Math.PI * (1 - progress / 100)}"
              transform="rotate(-90 14 14)"
              stroke-linecap="round"
            />
          </svg>
          <span class="progress-ring-text">{Math.round(progress)}%</span>
        </div>
      {/if}
    </div>
    <div class="info">
      <span class="title">{title}</span>
      <span class="author">{author}</span>
      <div class="meta-row">
        {#if seriesLabel}
          <span class="series-badge">{seriesLabel}</span>
        {/if}
        {#if book.tracks.length > 1}
          <span class="duration">{book.tracks.length} tracks</span>
        {:else if book.duration > 0}
          <span class="duration">{formatTime(book.duration)}</span>
        {/if}
        {#if bookCollections.length > 0}
          {#each bookCollections.slice(0, 2) as col}
            <CollectionTag name={col.name} color={col.color} />
          {/each}
        {/if}
      </div>
    </div>
  </button>
  {#if selectionMode}
    <div class="select-overlay" class:checked={selected}>
      <span class="material-symbols-outlined" style="font-size:20px; font-variation-settings: 'FILL' {selected ? 1 : 0};">
        {selected ? "check_circle" : "radio_button_unchecked"}
      </span>
    </div>
  {/if}
  <button class="edit-btn" onclick={() => onedit(book)} title="Edit">
    <span class="material-symbols-outlined">edit</span>
  </button>
  {#if onremove}
    <button class="remove-btn" onclick={() => onremove(book)} title="Remove from library">
      <span class="material-symbols-outlined">close</span>
    </button>
  {/if}
</div>

{#if contextMenu}
  <div class="ctx-menu" style="left:{contextMenu.x}px;top:{contextMenu.y}px;">
    <button class="ctx-item" onclick={() => { onplay(book); contextMenu = null; }}>
      <span class="material-symbols-outlined" style="font-size:16px;">play_arrow</span> Play
    </button>
    <button class="ctx-item" onclick={() => { onedit(book); contextMenu = null; }}>
      <span class="material-symbols-outlined" style="font-size:16px;">edit</span> Edit
    </button>
    {#if onremove}
      <button class="ctx-item danger" onclick={() => { onremove(book); contextMenu = null; }}>
        <span class="material-symbols-outlined" style="font-size:16px;">delete</span> Remove
      </button>
    {/if}
  </div>
{/if}

<style>
  .book-card {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--color-surface-lowest);
    border: none;
    border-radius: var(--radius-lg);
    overflow: hidden;
    transition: box-shadow 0.2s, transform 0.15s;
    box-shadow: var(--shadow-card);
  }

  .book-card:hover {
    box-shadow: var(--shadow-ambient);
    transform: translateY(-2px);
  }

  .book-card.kbd-focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .book-card.now-playing {
    box-shadow: 0 0 0 2px var(--color-primary), var(--shadow-ambient);
  }

  .playing-indicator {
    position: absolute;
    top: 6px;
    right: 6px;
    background: var(--color-primary);
    border-radius: var(--radius-md);
    padding: 4px 5px;
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 20px;
  }

  .eq-bars {
    display: flex;
    align-items: flex-end;
    gap: 1.5px;
    height: 12px;
  }

  .eq-bars span {
    width: 3px;
    background: var(--color-on-primary);
    border-radius: 1px;
    animation: eq-bounce 0.8s ease-in-out infinite;
  }

  .eq-bars span:nth-child(1) { height: 40%; animation-delay: 0s; }
  .eq-bars span:nth-child(2) { height: 70%; animation-delay: 0.15s; }
  .eq-bars span:nth-child(3) { height: 50%; animation-delay: 0.3s; }

  @keyframes eq-bounce {
    0%, 100% { transform: scaleY(1); }
    50% { transform: scaleY(0.4); }
  }

  .book-card:active {
    transform: translateY(0);
  }

  .card-main {
    display: flex;
    flex-direction: column;
    background: none;
    border: none;
    color: var(--color-text);
    font: inherit;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }

  .cover {
    aspect-ratio: 1;
    overflow: hidden;
    background: var(--color-surface-high);
    position: relative;
  }

  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-outline-variant);
  }

  .cover-placeholder .material-symbols-outlined {
    font-size: 48px;
    font-variation-settings: "FILL" 0, "wght" 300;
  }

  .status-overlay {
    position: absolute;
    top: 6px;
    right: 6px;
  }

  .progress-ring-wrap {
    position: absolute;
    bottom: 6px;
    right: 6px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--color-bg) 80%, transparent);
    border-radius: 50%;
    backdrop-filter: blur(4px);
  }

  .progress-ring {
    position: absolute;
    width: 28px;
    height: 28px;
  }

  .progress-ring-text {
    font-family: var(--font-label);
    font-size: 7px;
    font-weight: 700;
    color: var(--color-primary);
    z-index: 1;
  }

  .info {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .title {
    font-family: var(--font-headline);
    font-size: var(--font-size-md);
    font-weight: 500;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-text);
  }

  .author {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 500;
    color: var(--color-text-variant);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.01em;
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 2px;
    overflow: hidden;
    flex-wrap: wrap;
  }

  .series-badge {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--color-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .duration {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-outline);
    margin-top: 2px;
  }

  .edit-btn {
    position: absolute;
    top: 6px;
    left: 6px;
    background: var(--color-surface);
    opacity: 0.9;
    backdrop-filter: blur(8px);
    border: none;
    color: var(--color-text-variant);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-md);
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 2;
  }

  .book-card:hover .edit-btn {
    opacity: 1;
  }

  .edit-btn:hover {
    color: var(--color-primary);
  }

  .edit-btn .material-symbols-outlined {
    font-size: 16px;
  }

  .select-overlay {
    position: absolute;
    top: 6px;
    left: 6px;
    color: var(--color-outline);
    z-index: 3;
    pointer-events: none;
  }

  .select-overlay.checked {
    color: var(--color-primary);
  }

  .remove-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    background: var(--color-surface);
    opacity: 0.9;
    backdrop-filter: blur(8px);
    border: none;
    color: var(--color-text-variant);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-md);
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 2;
  }

  .book-card:hover .remove-btn {
    opacity: 1;
  }

  .remove-btn:hover {
    color: var(--color-error);
  }

  .remove-btn .material-symbols-outlined {
    font-size: 16px;
  }

  .ctx-menu {
    position: fixed;
    background: var(--color-surface-lowest);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    padding: 4px;
    z-index: 200;
    min-width: 140px;
    animation: ctx-in 0.12s ease-out;
  }

  @keyframes ctx-in {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }

  .ctx-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    background: none;
    border: none;
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    padding: 7px 12px;
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .ctx-item:hover {
    background: var(--color-surface-high);
  }

  .ctx-item.danger {
    color: var(--color-error);
  }
</style>
