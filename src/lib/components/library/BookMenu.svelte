<script lang="ts">
  /**
   * Right-click menu for a book, shared by the grid tile and the list row.
   * Status is one click (inline radio rows); collections and the tier open as
   * flyouts. Closes on any click or right-click outside, or Escape.
   */
  import { onMount } from "svelte";
  import type { BookMeta, BookStatus, Collection, UserBookData } from "../../types";
  import { pickCoverArt, setUserBookData, getDisplayCover } from "../../stores/userdataStore";
  import { defaultTierList, assignBookToTier, unassignBook } from "../../stores/tierListStore";

  interface Props {
    book: BookMeta;
    userData?: UserBookData | undefined;
    collections: Collection[];
    /** Pointer position of the right-click, in px. */
    x: number;
    y: number;
    onclose: () => void;
    onplay: () => void;
    ondetails?: () => void;
    onedit: () => void;
    onstatus?: (status: BookStatus) => void;
    onsplit?: () => void;
    onremove?: () => void;
  }

  let { book, userData, collections, x, y, onclose, onplay, ondetails, onedit, onstatus, onsplit, onremove }: Props =
    $props();

  const EDGE = 8;
  const STATUSES: { value: BookStatus; label: string; icon: string }[] = [
    { value: "not_started", label: "Not started", icon: "radio_button_unchecked" },
    { value: "in_progress", label: "Reading", icon: "timelapse" },
    { value: "finished", label: "Finished", icon: "check_circle" },
  ];

  let el = $state<HTMLElement | null>(null);

  let status = $derived(userData?.status || "not_started");
  let cover = $derived(getDisplayCover(book, userData));
  let inCollections = $derived(userData?.collections ?? []);

  let tierList = $derived($defaultTierList);
  let tierOptions = $derived((tierList?.tiers ?? []).slice().sort((a, b) => a.order - b.order));
  let currentTierId = $derived(tierList?.assignments[book.filePath] ?? null);

  // Flyouts open towards the side and the half of the window with more room
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  let flyLeft = $derived(window.innerWidth - x < 24 * rem);
  let flyUp = $derived(y > window.innerHeight * 0.55);

  function run(fn: (() => void) | undefined) {
    onclose();
    fn?.();
  }

  async function pickTier(tierId: string | null) {
    const list = tierList;
    onclose();
    if (!list) return;
    if (tierId) await assignBookToTier(list.id, book.filePath, tierId);
    else await unassignBook(list.id, book.filePath);
  }

  /** Stays open: several collections are often ticked in one go. */
  async function toggleCollection(id: string) {
    const next = inCollections.includes(id)
      ? inCollections.filter((c) => c !== id)
      : [...inCollections, id];
    await setUserBookData(book.filePath, { collections: next });
  }

  // `translate` rather than `transform`: the open animation owns transform
  $effect(() => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = r.right > window.innerWidth - EDGE ? window.innerWidth - EDGE - r.right : 0;
    const dy = r.bottom > window.innerHeight - EDGE ? window.innerHeight - EDGE - r.bottom : 0;
    if (dx || dy) el.style.translate = `${dx}px ${dy}px`;
  });

  onMount(() => {
    const outside = (e: Event) => {
      if (e.target instanceof Node && el?.contains(e.target)) return;
      onclose();
    };
    const onkey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onclose();
    };
    // Deferred so the right-click that opened the menu does not close it again
    const timer = setTimeout(() => {
      window.addEventListener("click", outside, true);
      window.addEventListener("contextmenu", outside, true);
    }, 0);
    window.addEventListener("keydown", onkey, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", outside, true);
      window.removeEventListener("contextmenu", outside, true);
      window.removeEventListener("keydown", onkey, true);
    };
  });
</script>

<div
  class="ctx-menu"
  role="menu"
  tabindex="-1"
  aria-label="Actions for {userData?.titleOverride || book.title}"
  bind:this={el}
  style="left:{x}px;top:{y}px;"
  oncontextmenu={(e) => e.preventDefault()}
>
  {#if !book.fileless}
    <button class="ctx-item" role="menuitem" onclick={() => run(onplay)}>
      <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span> Play
    </button>
  {/if}
  {#if ondetails}
    <button class="ctx-item" role="menuitem" onclick={() => run(ondetails)}>
      <span class="material-symbols-outlined" aria-hidden="true">info</span> View book
    </button>
  {/if}
  <button class="ctx-item" role="menuitem" onclick={() => run(onedit)}>
    <span class="material-symbols-outlined" aria-hidden="true">edit</span> Edit
  </button>

  {#if onstatus}
    <div class="ctx-rule" role="separator"></div>
    {#each STATUSES as s (s.value)}
      <button
        class="ctx-item"
        role="menuitemradio"
        aria-checked={status === s.value}
        onclick={() => run(() => { if (status !== s.value) onstatus?.(s.value); })}
      >
        <span class="material-symbols-outlined" aria-hidden="true">{s.icon}</span>
        <span class="ctx-label">{s.label}</span>
        {#if status === s.value}
          <span class="material-symbols-outlined ctx-tick" aria-hidden="true">check</span>
        {/if}
      </button>
    {/each}
  {/if}

  <div class="ctx-rule" role="separator"></div>
  <div class="ctx-sub" class:left={flyLeft} class:up={flyUp}>
    <button class="ctx-item" aria-haspopup="menu">
      <span class="material-symbols-outlined" aria-hidden="true">collections_bookmark</span>
      <span class="ctx-label">Collections</span>
      {#if inCollections.length > 0}<span class="ctx-sub-label mono">{inCollections.length}</span>{/if}
      <span class="material-symbols-outlined ctx-chevron" aria-hidden="true">chevron_right</span>
    </button>
    <div class="ctx-submenu" role="menu" aria-label="Collections">
      {#each collections as col (col.id)}
        <button
          class="ctx-item"
          role="menuitemcheckbox"
          aria-checked={inCollections.includes(col.id)}
          onclick={() => toggleCollection(col.id)}
        >
          <span class="ctx-dot" style="--dot: {col.color};"></span>
          <span class="ctx-label">{col.name}</span>
          {#if inCollections.includes(col.id)}
            <span class="material-symbols-outlined ctx-tick" aria-hidden="true">check</span>
          {/if}
        </button>
      {:else}
        <p class="ctx-note">No collections yet. Create one from Select books, or the library's ⋯ menu.</p>
      {/each}
    </div>
  </div>

  {#if tierList}
    <div class="ctx-sub" class:left={flyLeft} class:up={flyUp}>
      <button class="ctx-item" aria-haspopup="menu">
        <span class="material-symbols-outlined" aria-hidden="true">military_tech</span>
        <span class="ctx-label">Tier</span>
        <span class="material-symbols-outlined ctx-chevron" aria-hidden="true">chevron_right</span>
      </button>
      <div class="ctx-submenu" role="menu" aria-label="Tier in {tierList.name}">
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
              <span class="material-symbols-outlined ctx-tick" aria-hidden="true">check</span>
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

  {#if (!cover && !book.fileless) || (onsplit && book.tracks.length > 1) || onremove}
    <div class="ctx-rule" role="separator"></div>
  {/if}
  {#if !cover && !book.fileless}
    <button class="ctx-item" role="menuitem" onclick={() => run(() => pickCoverArt(book.filePath))}>
      <span class="material-symbols-outlined" aria-hidden="true">add_photo_alternate</span> Add cover
    </button>
  {/if}
  {#if onsplit && book.tracks.length > 1}
    <button class="ctx-item" role="menuitem" onclick={() => run(onsplit)}>
      <span class="material-symbols-outlined" aria-hidden="true">call_split</span> Split into files
    </button>
  {/if}
  {#if onremove}
    <button class="ctx-item danger" role="menuitem" onclick={() => run(onremove)}>
      <span class="material-symbols-outlined" aria-hidden="true">delete</span> Remove
    </button>
  {/if}
</div>

<style>
  .ctx-menu {
    position: fixed;
    z-index: 200;
    min-width: 11rem;
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
    padding: 0.42rem 0.83rem;
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

  .ctx-item:hover,
  .ctx-item:focus-visible {
    background: var(--color-surface-high);
    outline: none;
  }

  .ctx-item.danger {
    color: var(--color-error);
  }

  .ctx-item .material-symbols-outlined {
    font-size: 1.05rem;
  }

  .ctx-rule {
    height: 1px;
    margin: 0.28rem 0.4rem;
    background: var(--color-outline-variant);
  }

  .ctx-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ctx-tick {
    color: var(--color-primary);
  }

  .ctx-sub-label {
    font-size: 0.66rem;
    color: var(--color-text-variant);
  }

  .ctx-note {
    max-width: 13rem;
    margin: 0;
    padding: 0.42rem 0.6rem;
    font-family: var(--font-label);
    font-size: 0.72rem;
    line-height: 1.4;
    color: var(--color-text-variant);
    white-space: normal;
  }

  /* Flyouts: open on hover or keyboard focus, beside the menu */
  .ctx-sub {
    position: relative;
  }

  .ctx-chevron {
    opacity: 0.7;
  }

  .ctx-submenu {
    display: none;
    position: absolute;
    top: -0.28rem;
    left: calc(100% - 0.1rem); /* overlaps the parent so the pointer never crosses a gap */
    min-width: 11rem;
    max-width: 16rem;
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

  .ctx-sub.up .ctx-submenu {
    top: auto;
    bottom: -0.28rem;
  }

  .ctx-sub:hover > .ctx-submenu,
  .ctx-sub:focus-within > .ctx-submenu {
    display: block;
  }

  .ctx-dot {
    flex-shrink: 0;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--dot);
  }

  .tier-swatch {
    flex-shrink: 0;
    width: 0.9rem;
    height: 0.9rem;
    border-radius: 3px;
    background: var(--tier-color);
  }
</style>
