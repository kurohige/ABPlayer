<script lang="ts">
  /**
   * Scan placeholder (handoff motion #6): a shimmering cover plus two caption
   * bars at 76% and 50% width. `queued` renders the dashed "more queued"
   * placeholder that breathes instead of shimmering.
   */
  interface Props {
    size?: string;
    queued?: boolean;
    label?: string;
  }

  let { size = "7.5rem", queued = false, label = "" }: Props = $props();
</script>

<div class="ab-skel" style="--size: {size};" aria-hidden="true">
  {#if queued}
    <div class="ab-skel-queued ab-breathe">
      {#if label}<span class="ab-skel-queued-label">{label}</span>{/if}
    </div>
  {:else}
    <div class="ab-skel-cover ab-shimmer"></div>
    <div class="ab-skel-line ab-shimmer" style="width: 76%;"></div>
    <div class="ab-skel-line ab-shimmer" style="width: 50%;"></div>
  {/if}
</div>

<style>
  .ab-skel {
    width: var(--size);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0.42rem;
  }

  .ab-skel-cover {
    width: var(--size);
    height: var(--size);
    border-radius: var(--radius-md);
  }

  .ab-skel-line {
    height: 0.5rem;
    border-radius: var(--radius-sm);
  }

  /* :global so the reduce-motion rules in App.svelte can reach these */
  :global(.ab-shimmer) {
    background: linear-gradient(
      90deg,
      var(--color-surface) 0%,
      var(--color-surface-high) 50%,
      var(--color-surface) 100%
    );
    background-size: 220% 100%;
    animation: ab-shimmer var(--motion-shimmer) linear infinite;
  }

  :global(.ab-breathe) {
    animation: ab-breathe var(--motion-breathe) ease-in-out infinite;
  }

  .ab-skel-queued {
    width: var(--size);
    height: var(--size);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.4rem;
    border: 1px dashed var(--color-outline-variant);
    border-radius: var(--radius-md);
  }

  .ab-skel-queued-label {
    font-family: var(--font-label);
    font-size: 0.66rem;
    font-weight: 600;
    color: var(--color-outline);
    text-align: center;
    line-height: 1.3;
  }
</style>
