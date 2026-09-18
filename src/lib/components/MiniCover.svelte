<script lang="ts">
  /**
   * A book on the tier board: 58×78 cover plus a two-line clamped caption.
   * Captions clamp rather than clip, so a long title never spills into the
   * row below.
   */
  import type { BookMeta, UserBookData } from "../types";
  import { getDisplayTitle, getDisplayCover } from "../stores/userdataStore";
  import { bookDragSource } from "../utils/pointerDrag";
  import { Cover } from "./ui";

  interface Props {
    book: BookMeta;
    userData?: UserBookData | undefined;
    /** Hide the draggable affordance (used in read-only previews). */
    draggable?: boolean;
    /** Plays the settle animation right after this book was dropped here. */
    justDropped?: boolean;
    onclick?: (book: BookMeta) => void;
    /** Right-click or the keyboard Menu key: book plus a viewport position. */
    oncontextmenu?: (book: BookMeta, pos: { x: number; y: number }) => void;
  }

  let {
    book,
    userData,
    draggable = true,
    justDropped = false,
    onclick,
    oncontextmenu,
  }: Props = $props();

  let cover = $derived(getDisplayCover(book, userData));
  let title = $derived(getDisplayTitle(book, userData));
  let isFileless = $derived(book.fileless === true);

  function handleContextMenu(e: MouseEvent) {
    if (!oncontextmenu) return;
    e.preventDefault();
    // Keyboard-invoked (Shift+F10 / Menu key) reports no coordinates
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    oncontextmenu(book, { x: e.clientX || rect.left, y: e.clientY || rect.bottom });
  }
</script>

<button
  class="mini-cover"
  class:draggable
  class:ab-pop={justDropped}
  use:bookDragSource={{ payload: { filePath: book.filePath }, enabled: draggable }}
  title={title}
  onclick={() => onclick?.(book)}
  oncontextmenu={handleContextMenu}
>
  <span class="mc-art">
    <Cover src={cover} alt="" size="4rem" logged={isFileless} />
  </span>
  <span class="mc-title">{title}</span>
</button>

<style>
  .mini-cover {
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
    width: 4rem;
    padding: 0;
    background: none;
    border: none;
    color: var(--color-text);
    font-family: var(--font-body);
    text-align: left;
    cursor: pointer;
  }

  .mini-cover.draggable {
    cursor: grab;
  }

  .mini-cover.draggable:active {
    cursor: grabbing;
  }

  .mini-cover:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .mc-art {
    display: block;
    transition: transform var(--motion-lift) var(--ease-out);
  }

  .mini-cover:hover .mc-art {
    transform: translateY(-2px);
  }

  /* Drop & settle (motion #5) — the class is cleared by the board after 600ms */
  :global(.ab-pop) {
    animation: ab-pop var(--motion-pop) var(--ease-pop) both;
  }

  .mc-title {
    font-size: 0.62rem;
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
