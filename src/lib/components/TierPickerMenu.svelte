<script lang="ts">
  /**
   * Context menu opened by right-clicking a cover in the Tiers view: lists the
   * active list's tiers (current one checked) and, when the book is ranked,
   * "Remove from this list". Owned by TiersView, which passes the position.
   */
  import { onMount } from "svelte";
  import type { BookMeta, TierList } from "../types";

  interface Props {
    book: BookMeta;
    title: string;
    list: TierList;
    /** Viewport position to open at; clamped so the menu stays on screen. */
    x: number;
    y: number;
    /** A tier id, or null to remove the book from this list. */
    onassign: (tierId: string | null) => void;
    onclose: () => void;
  }

  let { book, title, list, x, y, onassign, onclose }: Props = $props();

  const MARGIN = 8;

  let menuEl = $state<HTMLDivElement | null>(null);
  let size = $state<{ w: number; h: number } | null>(null);

  let tiers = $derived(list.tiers.slice().sort((a, b) => a.order - b.order));
  let currentTierId = $derived(list.assignments[book.filePath] ?? null);
  let left = $derived(size ? Math.max(MARGIN, Math.min(x, window.innerWidth - size.w - MARGIN)) : x);
  let top = $derived(size ? Math.max(MARGIN, Math.min(y, window.innerHeight - size.h - MARGIN)) : y);

  // Return focus to the cover that opened the menu once it closes
  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  });

  // Measure once rendered so the clamped position can be computed, then focus the first item
  $effect(() => {
    if (!menuEl) return;
    const r = menuEl.getBoundingClientRect();
    size = { w: r.width, h: r.height };
    items()[0]?.focus();
  });

  function items(): HTMLElement[] {
    return Array.from(menuEl?.querySelectorAll<HTMLElement>("[role^='menuitem']") ?? []);
  }

  function pick(tierId: string | null) {
    onassign(tierId);
    onclose();
  }

  function isOutside(target: EventTarget | null): boolean {
    return !!menuEl && !(target instanceof Node && menuEl.contains(target));
  }

  function handleWindowPointerDown(e: PointerEvent) {
    if (isOutside(e.target)) onclose();
  }

  function handleWindowScroll(e: Event) {
    if (isOutside(e.target)) onclose();
  }

  function handleFocusOut(e: FocusEvent) {
    if (e.relatedTarget && isOutside(e.relatedTarget)) onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onclose();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const els = items();
    if (els.length === 0) return;
    e.preventDefault();
    const i = els.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home" ? 0
      : e.key === "End" ? els.length - 1
      : e.key === "ArrowDown" ? (i + 1) % els.length
      : (i - 1 + els.length) % els.length;
    els[next].focus();
  }
</script>

<svelte:window
  onpointerdown={handleWindowPointerDown}
  onkeydown={handleKeydown}
  onresize={onclose}
  onscrollcapture={handleWindowScroll}
/>

<div
  class="tier-menu"
  role="menu"
  aria-label="Set tier for {title}"
  bind:this={menuEl}
  style="left: {left}px; top: {top}px;"
  onfocusout={handleFocusOut}
>
  <div class="tier-menu-title" title={title}>{title}</div>

  {#each tiers as tier (tier.id)}
    <button
      type="button"
      class="tier-menu-item"
      role="menuitemradio"
      aria-checked={currentTierId === tier.id}
      onclick={() => pick(tier.id)}
    >
      <span class="swatch" style="--tier-color: {tier.color};"></span>
      <span class="label">{tier.label}</span>
      {#if tier.name}<span class="name">{tier.name}</span>{/if}
      {#if currentTierId === tier.id}
        <span class="material-symbols-outlined check" aria-hidden="true">check</span>
      {/if}
    </button>
  {/each}

  {#if currentTierId}
    <div class="tier-menu-sep" role="separator"></div>
    <button type="button" class="tier-menu-item remove" role="menuitem" onclick={() => pick(null)}>
      <span class="material-symbols-outlined" aria-hidden="true">remove_circle</span>
      <span class="label">Remove from this list</span>
    </button>
  {/if}
</div>

<style>
  .tier-menu {
    position: fixed;
    z-index: 60;
    min-width: 12rem;
    max-width: 18rem;
    max-height: 70vh;
    overflow-y: auto;
    padding: 0.3rem;
    background: var(--color-surface-lowest);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-ambient), 0 6px 20px rgba(0, 0, 0, 0.25);
  }

  .tier-menu-title {
    padding: 0.35rem 0.7rem 0.3rem;
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-outline);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tier-menu-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.45rem 0.7rem;
    background: none;
    border: none;
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    text-align: left;
    cursor: pointer;
    border-radius: var(--radius-sm);
  }

  .tier-menu-item:hover,
  .tier-menu-item:focus-visible {
    background: var(--color-surface-high);
    outline: none;
  }

  .tier-menu-item[aria-checked="true"] {
    font-weight: 700;
  }

  .swatch {
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
    border-radius: 3px;
    background: var(--tier-color);
  }

  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
    white-space: nowrap;
  }

  .tier-menu-item .material-symbols-outlined {
    font-size: 1rem;
  }

  .check {
    color: var(--color-primary);
  }

  .tier-menu-sep {
    height: 1px;
    margin: 0.25rem 0.4rem;
    background: var(--color-outline-variant);
  }

  .remove {
    color: var(--color-error);
  }
</style>
