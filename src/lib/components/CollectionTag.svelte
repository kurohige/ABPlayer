<script lang="ts">
  interface Props {
    name: string;
    color?: string;
    removable?: boolean;
    onremove?: () => void;
  }

  let { name, color = "var(--color-outline-variant)", removable = false, onremove }: Props = $props();
</script>

<span class="tag" style:--tag-color={color}>
  {name}
  {#if removable && onremove}
    <button class="remove" onclick={onremove} aria-label="Remove {name}">&times;</button>
  {/if}
</span>

<style>
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-label);
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--tag-color);
    background: color-mix(in srgb, var(--tag-color) 12%, transparent);
    padding: 2px 7px;
    border-radius: var(--radius-xl);
    line-height: 1.2;
    white-space: nowrap;
  }

  .remove {
    background: none;
    border: none;
    color: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    opacity: 0.7;
  }

  .remove:hover {
    opacity: 1;
  }
</style>
