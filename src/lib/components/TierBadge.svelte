<script lang="ts">
  interface Props {
    /** Short label rendered in the circle (e.g. "S", "★"). */
    label: string;
    /** Hex color. */
    color: string;
    /** Badge diameter in rem. */
    size?: number;
    /** When true, renders as an outlined placeholder (used in the tier picker). */
    outlined?: boolean;
  }

  let { label, color, size = 1.6, outlined = false }: Props = $props();
</script>

<span
  class="tier-badge"
  class:outlined
  style="--tier-color: {color}; --tier-size: {size}rem;"
  title={label}
>
  <span class="tier-label">{label}</span>
</span>

<style>
  .tier-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--tier-size);
    height: var(--tier-size);
    border-radius: 50%;
    background: var(--tier-color);
    color: #1a0f0d;
    font-family: var(--font-label);
    font-weight: 700;
    font-size: calc(var(--tier-size) * 0.45);
    line-height: 1;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    flex-shrink: 0;
    user-select: none;
  }

  .tier-badge.outlined {
    background: transparent;
    color: var(--tier-color);
    box-shadow: inset 0 0 0 1.5px var(--tier-color);
  }

  .tier-label {
    transform: translateY(-1px);
    white-space: nowrap;
  }
</style>
