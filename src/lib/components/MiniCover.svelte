<script lang="ts">
  import type { BookMeta, UserBookData } from "../types";
  import { getDisplayTitle, getDisplayCover } from "../stores/userdataStore";

  interface Props {
    book: BookMeta;
    userData?: UserBookData | undefined;
    /** Hide the draggable affordance (used in read-only previews). */
    draggable?: boolean;
    onclick?: (book: BookMeta) => void;
  }

  let { book, userData, draggable = true, onclick }: Props = $props();

  let cover = $derived(getDisplayCover(book, userData));
  let title = $derived(getDisplayTitle(book, userData));
  let isFileless = $derived(book.fileless === true);

  function handleDragStart(e: DragEvent) {
    if (!draggable) return;
    e.dataTransfer?.setData("text/plain", book.filePath);
    e.dataTransfer?.setData("application/x-abplayer-book", book.filePath);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  }
</script>

<button
  class="mini-cover"
  class:draggable
  draggable={draggable}
  title={title}
  onclick={() => onclick?.(book)}
  ondragstart={handleDragStart}
>
  <div class="art">
    {#if cover}
      <img src={cover} alt="" />
    {:else}
      <span class="material-symbols-outlined placeholder">auto_stories</span>
    {/if}
    {#if isFileless}
      <span class="logged-dot" title="Metadata-only">•</span>
    {/if}
  </div>
  <span class="title">{title}</span>
</button>

<style>
  .mini-cover {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 4rem;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--color-text);
    font-family: var(--font-body);
    text-align: left;
  }

  .mini-cover.draggable:active {
    cursor: grabbing;
  }

  .art {
    width: 4rem;
    height: 5.3rem;
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--color-surface-high);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: transform 0.15s, box-shadow 0.15s;
  }

  .mini-cover:hover .art {
    transform: translateY(-1px);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
  }

  .art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .placeholder {
    font-size: 1.5rem;
    color: var(--color-outline-variant);
  }

  .logged-dot {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    font-size: 0;
  }

  .title {
    font-size: 0.65rem;
    line-height: 1.2;
    color: var(--color-text-variant);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    max-height: 1.6rem;
  }
</style>
