<script lang="ts">
  /**
   * The list row shared by chapters, bookmarks and "pick up again": a mono
   * marker column, an ellipsised title, right-aligned mono meta. The active
   * row is a surface step with a bold title — no accent text; the accent only
   * appears as the equalizer at its right edge.
   */
  import Equalizer from "./Equalizer.svelte";

  interface Props {
    /** Left mono column: chapter number, timestamp, index. */
    marker?: string;
    title: string;
    meta?: string;
    active?: boolean;
    /** Shows the animated equalizer at the right of the active row. */
    playing?: boolean;
    /** Dimmed, for chapters already listened to. */
    muted?: boolean;
    height?: string;
    class?: string;
    onclick?: (e: MouseEvent) => void;
  }

  let {
    marker = "",
    title,
    meta = "",
    active = false,
    playing = false,
    muted = false,
    height = "2.5rem",
    class: klass = "",
    onclick,
  }: Props = $props();
</script>

<button
  type="button"
  class="ab-row {klass}"
  class:active
  class:muted
  aria-current={active ? "true" : undefined}
  style="--h: {height};"
  {onclick}
>
  {#if marker}<span class="ab-row-marker mono">{marker}</span>{/if}
  <span class="ab-row-title">{title}</span>
  {#if playing}
    <Equalizer height="0.6rem" label="Now playing" />
  {/if}
  {#if meta}<span class="ab-row-meta mono">{meta}</span>{/if}
</button>

<style>
  .ab-row {
    width: 100%;
    height: var(--h);
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0 0.85rem;
    background: none;
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text);
    text-align: left;
    cursor: pointer;
    transition: background var(--motion-fast) ease;
  }

  .ab-row:hover {
    background: var(--color-surface-high);
  }

  .ab-row.active {
    background: var(--color-surface-high);
  }

  .ab-row.active .ab-row-title {
    font-weight: 700;
    color: var(--color-text);
  }

  .ab-row.muted .ab-row-title,
  .ab-row.muted .ab-row-marker {
    color: var(--color-text-variant);
  }

  .ab-row:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }

  .ab-row-marker {
    flex-shrink: 0;
    width: 1.4rem;
    font-size: 0.73rem;
    color: var(--color-outline);
    text-align: right;
  }

  .ab-row-title {
    flex: 1;
    min-width: 0;
    font-family: var(--font-label);
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ab-row-meta {
    flex-shrink: 0;
    font-size: 0.73rem;
    color: var(--color-text-variant);
  }
</style>
