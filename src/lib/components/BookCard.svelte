<script lang="ts">
  /**
   * Library grid tile (handoff 1a): square cover, Newsreader title, Manrope
   * author, both ellipsised. One badge per cover, enforced by Cover itself.
   *
   * Double-click still plays — single click only focuses — because avoiding
   * accidental playback from a single click was a deliberate earlier decision.
   * The cover flight starts from the same double-click.
   */
  import type { BookMeta, BookStatus, UserBookData, Collection, Tier } from "../types";
  import { getDisplayTitle, getDisplayAuthor, getDisplayCover } from "../stores/userdataStore";
  import { bookDragSource } from "../utils/pointerDrag";
  import { startFlight } from "../utils/coverFlight";
  import { Cover, Equalizer } from "./ui";
  import BookMenu from "./library/BookMenu.svelte";

  interface Props {
    book: BookMeta;
    userData?: UserBookData | undefined;
    collections: Collection[];
    position?: { position: number; duration: number } | undefined;
    tier?: Tier | null;
    selectionMode?: boolean;
    selected?: boolean;
    isPlaying?: boolean;
    focused?: boolean;
    /** Position within its series, shown on the shelf view. */
    seriesNumber?: number | null;
    /** First unfinished book of its series. */
    nextUp?: boolean;
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

  let {
    book,
    userData,
    collections,
    position,
    tier = null,
    selectionMode = false,
    selected = false,
    isPlaying = false,
    focused = false,
    seriesNumber = null,
    nextUp = false,
    onedit,
    onplay,
    ondetails,
    onstatus,
    onremove,
    ontoggleselect,
    onsplit,
  }: Props = $props();

  let coverEl = $state<HTMLElement | null>(null);

  let title = $derived(getDisplayTitle(book, userData));
  let author = $derived(getDisplayAuthor(book, userData));
  let cover = $derived(getDisplayCover(book, userData));
  let isFileless = $derived(book.fileless === true);
  let status = $derived(userData?.status || "not_started");
  let progress = $derived(
    position && position.duration > 0 ? (position.position / position.duration) * 100 : 0,
  );

  // One badge: logged, else progress while reading, else the tier once finished.
  let showTier = $derived(status === "finished" ? tier : null);
  let coverProgress = $derived(status === "in_progress" && progress > 0 ? progress : null);

  let bookCollections = $derived(
    (userData?.collections || [])
      .map((id) => collections.find((c) => c.id === id))
      .filter(Boolean) as Collection[],
  );

  let contextMenu = $state<{ x: number; y: number } | null>(null);

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY };
  }

  function handleActivate() {
    if (selectionMode) {
      ontoggleselect?.(book, false);
      return;
    }
    startFlight(coverEl, cover, book.filePath);
    onplay(book);
  }
</script>

<div
  class="tile"
  class:kbd-focus={focused}
  class:selected
  role="listitem"
  oncontextmenu={handleContextMenu}
  use:bookDragSource={{ payload: { filePath: book.filePath } }}
>
  <button
    class="tile-main"
    data-press="none"
    onclick={(e) => selectionMode && ontoggleselect?.(book, e.shiftKey)}
    aria-pressed={selectionMode ? selected : undefined}
    ondblclick={() => !selectionMode && handleActivate()}
    title={title}
  >
    <span class="tile-cover" bind:this={coverEl}>
      <Cover
        src={cover}
        alt=""
        size="100%"
        logged={isFileless}
        progress={coverProgress}
        tier={showTier ? { label: showTier.label, color: showTier.color } : null}
      />
      {#if isPlaying}
        <span class="tile-eq"><Equalizer height="0.62rem" /></span>
      {/if}
      {#if selectionMode}
        <span class="tile-check" class:on={selected}>
          <span class="material-symbols-outlined" aria-hidden="true">
            {selected ? "check_circle" : "radio_button_unchecked"}
          </span>
        </span>
      {/if}
    </span>

    {#if seriesNumber !== null || nextUp}
      <span class="tile-series">
        {#if seriesNumber !== null}<span class="tile-num mono">#{seriesNumber}</span>{/if}
        {#if nextUp}<span class="tile-next">NEXT</span>{/if}
      </span>
    {/if}
    <span class="tile-title">{title}</span>
    <span class="tile-author">{author}</span>
    {#if bookCollections.length > 0}
      <span class="tile-collections">
        {#each bookCollections.slice(0, 3) as col (col.id)}
          <span class="tile-dot" style="--dot: {col.color};" title={col.name}></span>
        {/each}
      </span>
    {/if}
  </button>
  {#if ondetails && !selectionMode}
    <button class="tile-info" onclick={() => ondetails(book)} title="View book" aria-label="View {title}">
      <span class="material-symbols-outlined" aria-hidden="true">info</span>
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
    onplay={handleActivate}
    ondetails={ondetails ? () => ondetails(book) : undefined}
    onedit={() => onedit(book)}
    onstatus={onstatus ? (s) => onstatus(book, s) : undefined}
    onsplit={onsplit ? () => onsplit(book) : undefined}
    onremove={onremove ? () => onremove(book) : undefined}
  />
{/if}

<style>
  .tile {
    position: relative;
    min-width: 0;
    border-radius: var(--radius-md);
  }

  /* Selected: an accent ring on the cover, so a pick is unmistakable */
  .tile.selected .tile-cover {
    outline: 3px solid var(--color-primary);
    outline-offset: 2px;
    border-radius: var(--radius-md);
  }

  .tile-main {
    display: flex;
    flex-direction: column;
    gap: 0.42rem;
    width: 100%;
    min-width: 0;
    padding: 0;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: transform var(--motion-lift) var(--ease-out);
  }

  /* Tile lift (motion #2): the whole tile moves as one piece. Keyed on the
     tile, not the button, so it holds while the pointer is on "View book". */
  .tile:hover .tile-main,
  .tile:hover .tile-info {
    transform: translateY(-4px);
  }

  .tile-main:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
    border-radius: var(--radius-md);
  }

  .tile.kbd-focus .tile-main {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
    border-radius: var(--radius-md);
  }

  .tile-cover {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1;
  }

  .tile-eq {
    position: absolute;
    right: 0.28rem;
    bottom: 0.42rem;
    display: flex;
    padding: 0.14rem 0.2rem;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--color-bg) 70%, transparent);
  }

  .tile-check {
    position: absolute;
    right: 0.28rem;
    top: 0.28rem;
    display: flex;
    border-radius: 50%;
    background: var(--color-bg);
    color: var(--color-outline);
  }

  .tile-check.on {
    color: var(--color-primary);
  }

  .tile-check .material-symbols-outlined {
    font-size: 1.4rem;
    font-variation-settings: "FILL" 1;
  }

  .tile-series {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .tile-num {
    font-size: 0.66rem;
    color: var(--color-outline);
  }

  .tile-next {
    padding: 0.08rem 0.28rem;
    border-radius: var(--radius-sm);
    background: var(--color-ink);
    color: var(--color-on-ink);
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.5rem;
    letter-spacing: 0.14em;
    line-height: 1.4;
  }

  .tile-title {
    font-family: var(--font-headline);
    font-weight: 500;
    font-size: 0.87rem;
    line-height: 1.25;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile-author {
    font-family: var(--font-label);
    font-size: 0.73rem;
    color: var(--color-text-variant);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile-collections {
    display: flex;
    gap: 0.2rem;
  }

  .tile-dot {
    width: 0.42rem;
    height: 0.42rem;
    border-radius: 50%;
    background: var(--dot);
  }


  /* "View book": appears with the pointer, top right of the cover (where the
     selection circle sits in selection mode, when this is hidden) */
  .tile-info {
    position: absolute;
    top: 0.28rem;
    right: 0.28rem;
    display: flex;
    padding: 0.2rem;
    border: none;
    border-radius: 50%;
    background: color-mix(in srgb, var(--color-bg) 82%, transparent);
    color: var(--color-text);
    cursor: pointer;
    opacity: 0;
    transition:
      opacity var(--motion-fast) ease,
      transform var(--motion-lift) var(--ease-out);
  }

  .tile:hover .tile-info,
  .tile-info:focus-visible {
    opacity: 1;
  }

  .tile-info .material-symbols-outlined {
    font-size: 1.15rem;
  }
</style>
