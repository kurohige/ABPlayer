<script lang="ts">
  /**
   * Round tier badge. Tier colors stay vivid — they are exempt from the
   * calmer palette — and the label on a tier fill is always #16110f.
   */
  interface Props {
    label: string;
    color: string;
    /** Diameter in rem; the handoff uses 20–22px → 1.4–1.5rem. */
    size?: string;
    title?: string;
    class?: string;
  }

  let { label, color, size = "1.4rem", title = "", class: klass = "" }: Props = $props();
</script>

<span
  class="ab-tier-chip {klass}"
  style="--tier-color: {color}; --size: {size};"
  title={title || label}
>
  {label}
</span>

<style>
  .ab-tier-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--size);
    height: var(--size);
    padding: 0 0.25rem;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--tier-color);
    color: #16110f;
    font-family: var(--font-label);
    font-weight: 700;
    font-size: calc(var(--size) * 0.47);
    line-height: 1;
  }
</style>
