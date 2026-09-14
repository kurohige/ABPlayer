<script lang="ts">
  /**
   * Library grid tile (handoff 1a): square cover, Newsreader title, Manrope
   * author, both ellipsised. One badge per cover, enforced by Cover itself.
   *
   * Double-click still plays — single click only focuses — because avoiding
   * accidental playback from a single click was a deliberate earlier decision.
   * The cover flight starts from the same double-click.
   */
  import { onDestroy } from "svelte";
  import type { BookMeta, UserBookData, Collection, Tier } from "../types";
  import { getDisplayTitle, getDisplayAuthor, getDisplayCover } from "../stores/userdataStore";
  import { defaultTierList, assignBookToTier, unassignBook } from "../stores/tierListStore";
  import { bookDragSource } from "../utils/pointerDrag";
  import { startFlight } from "../utils/coverFlight";
  import { Cover, Equalizer } from "./ui";

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
    onremove?: (book: BookMeta) => void;
    ontoggleselect?: (book: BookMeta) => void;
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
    onremove,
    ontoggleselect,
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

  // ---- context menu ----
  let contextMenu = $state<{ x: number; y: number } | null>(null);
  let closeMenu: ((e: MouseEvent) => void) | null = null;
  let submenuLeft = $state(false);

  let tierList = $derived($defaultTierList);
  let tierOptions = $derived((tierList?.tiers ?? []).slice().sort((a, b) => a.order - b.order));
  let currentTierId = $derived(tierList?.assignments[book.filePath] ?? null);

  async function pickTier(tierId: string | null) {
    const list = tierList;
    contextMenu = null;
    if (!list) return;
    if (tierId) await assignBookToTier(list.id, book.filePath, tierId);
    else await unassignBook(list.id, book.filePath);
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY };
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    submenuLeft = window.innerWidth - e.clientX < 24 * rem;
    if (closeMenu) {
      window.removeEventListener("click", closeMenu);
      closeMenu = null;
    }
    const close = (ev: MouseEvent) => {
      // Clicks inside the menu must not dismiss it; items close it themselves
      if (ev.target instanceof Element && ev.target.closest(".ctx-menu")) return;
      contextMenu = null;
      window.removeEventListener("click", close);
      if (closeMenu === close) closeMenu = null;
    };
    closeMenu = close;
    // Defer so the contextmenu event's own trailing click doesn't dismiss it
    setTimeout(() => {
      if (closeMenu === close) window.addEventListener("click", close);
    }, 0);
  }

  onDestroy(() => {
    if (closeMenu) {
      window.removeEventListener("click", closeMenu);
      closeMenu = null;
    }
  });

  function handleActivate() {
    if (selectionMode) {
      ontoggleselect?.(book);
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
    onclick={() => selectionMode && ontoggleselect?.(book)}
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
</div>

{#if contextMenu}
  <div class="ctx-menu" style="left:{contextMenu.x}px;top:{contextMenu.y}px;">
    <button class="ctx-item" onclick={() => { handleActivate(); contextMenu = null; }}>
      <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span> Play
    </button>
    <button class="ctx-item" onclick={() => { onedit(book); contextMenu = null; }}>
      <span class="material-symbols-outlined" aria-hidden="true">edit</span> Edit
    </button>
    {#if tierList}
      <div class="ctx-sub" class:left={submenuLeft}>
        <button class="ctx-item" aria-haspopup="menu">
          <span class="material-symbols-outlined" aria-hidden="true">military_tech</span> Assign tier
          <span class="material-symbols-outlined ctx-chevron" aria-hidden="true">chevron_right</span>
        </button>
        <div class="ctx-submenu" role="menu" aria-label="Assign tier in {tierList.name}">
          {#each tierOptions as t (t.id)}
            <button
              class="ctx-item"
              role="menuitemradio"
              aria-checked={currentTierId === t.id}
              onclick={() => pickTier(t.id)}
            >
              <span class="tier-swatch" style="--tier-color: {t.color};"></span>
              <span class="ctx-label">{t.label}</span>
              {#if t.name}<span class="ctx-sub-label">{t.name}</span>{/if}
              {#if currentTierId === t.id}
                <span class="material-symbols-outlined" aria-hidden="true">check</span>
              {/if}
            </button>
          {/each}
          {#if currentTierId}
            <button class="ctx-item danger" role="menuitem" onclick={() => pickTier(null)}>
              <span class="material-symbols-outlined" aria-hidden="true">remove_circle</span> Remove from list
            </button>
          {/if}
        </div>
      </div>
    {/if}
    {#if onremove}
      <button class="ctx-item danger" onclick={() => { onremove(book); contextMenu = null; }}>
        <span class="material-symbols-outlined" aria-hidden="true">delete</span> Remove
      </button>
    {/if}
  </div>
{/if}

<style>
  .tile {
    min-width: 0;
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

  /* Tile lift (motion #2): the whole tile moves as one piece */
  .tile-main:hover {
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
    color: var(--color-outline);
  }

  .tile-check.on {
    color: var(--color-primary);
  }

  .tile-check .material-symbols-outlined {
    font-size: 1.15rem;
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

  /* ---- context menu ---- */
  .ctx-menu {
    position: fixed;
    z-index: 200;
    min-width: 9.7rem;
    padding: 0.28rem;
    background: var(--color-bg);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-panel);
    animation: ab-panel var(--motion-panel) var(--ease-out) both;
  }

  .ctx-item {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    padding: 0.48rem 0.83rem;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: 0.76rem;
    font-weight: 600;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
    transition: background var(--motion-fast) ease;
  }

  .ctx-item:hover {
    background: var(--color-surface-high);
  }

  .ctx-item.danger {
    color: var(--color-error);
  }

  .ctx-item .material-symbols-outlined {
    font-size: 1.05rem;
  }

  /* "Assign tier" flyout: opens on hover or keyboard focus, beside the menu */
  .ctx-sub {
    position: relative;
  }

  .ctx-chevron {
    margin-left: auto;
    opacity: 0.7;
  }

  .ctx-submenu {
    display: none;
    position: absolute;
    top: -0.28rem;
    left: calc(100% - 0.1rem); /* overlaps the parent so the pointer never crosses a gap */
    min-width: 11rem;
    max-height: 60vh;
    overflow-y: auto;
    padding: 0.28rem;
    background: var(--color-bg);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-panel);
  }

  .ctx-sub.left .ctx-submenu {
    left: auto;
    right: calc(100% - 0.1rem);
  }

  .ctx-sub:hover > .ctx-submenu,
  .ctx-sub:focus-within > .ctx-submenu {
    display: block;
  }

  .tier-swatch {
    flex-shrink: 0;
    width: 0.9rem;
    height: 0.9rem;
    border-radius: 3px;
    background: var(--tier-color);
  }

  .ctx-label {
    flex: 1;
  }

  .ctx-sub-label {
    font-size: 0.66rem;
    color: var(--color-text-variant);
  }
</style>
