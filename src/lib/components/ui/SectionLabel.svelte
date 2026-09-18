<script lang="ts">
  /**
   * Micro uppercase label followed by a hairline rule that fills the row.
   * Opens every block in the refreshed layouts.
   */
  import type { Snippet } from "svelte";

  interface Props {
    label: string;
    /** Mono meta shown after the rule ("82 chapters", "7 books · 3 finished"). */
    meta?: string;
    /** Extra controls pinned to the right of the rule. */
    trailing?: Snippet;
    class?: string;
  }

  let { label, meta = "", trailing, class: klass = "" }: Props = $props();
</script>

<div class="ab-section {klass}">
  <span class="ab-section-label">{label}</span>
  <span class="ab-section-rule"></span>
  {#if meta}<span class="ab-section-meta mono">{meta}</span>{/if}
  {#if trailing}{@render trailing()}{/if}
</div>

<style>
  .ab-section {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
  }

  .ab-section-label {
    flex-shrink: 0;
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.66rem;
    line-height: 1;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-outline);
  }

  .ab-section-rule {
    flex: 1;
    min-width: 0.7rem;
    height: 1px;
    background: var(--color-outline-variant);
  }

  .ab-section-meta {
    flex-shrink: 0;
    font-size: 0.73rem;
    color: var(--color-outline);
  }
</style>
