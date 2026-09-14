<script lang="ts">
  /**
   * Hairline pill with an optional leading icon. Selected reads as ink on
   * paper (filter chips, segmented controls), never as accent.
   */
  import type { Snippet } from "svelte";

  interface Props {
    icon?: string;
    label?: string;
    /** Mono value rendered after the label ("1.5×", "Bass +3"). */
    value?: string;
    selected?: boolean;
    disabled?: boolean;
    /** Height in rem; the handoff's 24/26/30px are 1.65/1.8/2.1rem. */
    height?: string;
    title?: string;
    ariaHasPopup?: boolean;
    ariaExpanded?: boolean;
    class?: string;
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
  }

  let {
    icon = "",
    label = "",
    value = "",
    selected = false,
    disabled = false,
    height = "2.1rem",
    title = "",
    ariaHasPopup = false,
    ariaExpanded,
    class: klass = "",
    onclick,
    children,
  }: Props = $props();
</script>

<button
  type="button"
  class="ab-pill {klass}"
  class:selected
  {disabled}
  title={title || label}
  aria-haspopup={ariaHasPopup ? "menu" : undefined}
  aria-expanded={ariaExpanded}
  style="--h: {height};"
  {onclick}
>
  {#if icon}
    <span class="material-symbols-outlined ab-pill-icon" aria-hidden="true">{icon}</span>
  {/if}
  {#if label}<span class="ab-pill-label">{label}</span>{/if}
  {#if value}<span class="ab-pill-value mono">{value}</span>{/if}
  {#if children}{@render children()}{/if}
</button>

<style>
  .ab-pill {
    height: var(--h);
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    padding: 0 0.7rem;
    background: none;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: 0.76rem;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background var(--motion-fast) ease,
      color var(--motion-fast) ease;
  }

  .ab-pill:hover:not(:disabled) {
    background: var(--color-surface-high);
  }

  .ab-pill.selected {
    background: var(--color-ink);
    border-color: var(--color-ink);
    color: var(--color-on-ink);
    font-weight: 700;
  }

  .ab-pill.selected .ab-pill-icon {
    color: inherit;
  }

  .ab-pill:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .ab-pill:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .ab-pill-icon {
    font-size: 1.05rem;
    color: var(--color-text-variant);
  }

  .ab-pill-value {
    font-size: 0.73rem;
    font-weight: 700;
  }
</style>
