<script lang="ts">
  /**
   * The player's "how you're listening" tile: 62px tall, icon over a mono
   * value over a micro uppercase label. Active is a surface step.
   */
  import type { Snippet } from "svelte";

  interface Props {
    icon: string;
    /** Mono value line ("1.5×", "Bass +3", "Off"). */
    value: string;
    label: string;
    active?: boolean;
    ariaHasPopup?: boolean;
    ariaExpanded?: boolean;
    class?: string;
    onclick?: (e: MouseEvent) => void;
    /** Replaces the value line — used by the volume tile's slider. */
    control?: Snippet;
  }

  let {
    icon,
    value,
    label,
    active = false,
    ariaHasPopup = false,
    ariaExpanded,
    class: klass = "",
    onclick,
    control,
  }: Props = $props();
</script>

<button
  type="button"
  class="ab-tile {klass}"
  class:active
  aria-haspopup={ariaHasPopup ? "menu" : undefined}
  aria-expanded={ariaExpanded}
  title="{label}: {value}"
  {onclick}
>
  <span class="material-symbols-outlined ab-tile-icon" aria-hidden="true">{icon}</span>
  {#if control}
    <span class="ab-tile-control">{@render control()}</span>
  {:else}
    <span class="ab-tile-value mono">{value}</span>
  {/if}
  <span class="ab-tile-label">{label}</span>
</button>

<style>
  .ab-tile {
    min-width: 0;
    height: 4.3rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.28rem;
    padding: 0 0.4rem;
    background: none;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-lg);
    color: var(--color-text);
    cursor: pointer;
    transition: background var(--motion-fast) ease;
  }

  .ab-tile:hover,
  .ab-tile.active {
    background: var(--color-surface-high);
  }

  .ab-tile:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .ab-tile-icon {
    font-size: 1.4rem;
    color: var(--color-text-variant);
  }

  .ab-tile.active .ab-tile-icon {
    color: var(--color-text);
  }

  .ab-tile-value {
    font-size: 0.76rem;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
  }

  .ab-tile-control {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-width: 0;
  }

  .ab-tile-label {
    max-width: 100%;
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.55rem;
    letter-spacing: 0.14em;
    line-height: 1;
    text-transform: uppercase;
    color: var(--color-outline);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
