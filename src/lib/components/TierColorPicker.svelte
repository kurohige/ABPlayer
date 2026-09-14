<script lang="ts">
  import { TIER_PALETTE } from "../tierDefaults";

  interface Props {
    value: string;
    onchange: (color: string) => void;
    onclose?: () => void;
  }

  let { value, onchange, onclose }: Props = $props();
  // svelte-ignore state_referenced_locally — picker is re-instantiated on each open, so the one-shot seed is correct
  let custom = $state(value);

  function commit(color: string) {
    if (/^#[0-9a-f]{6}$/i.test(color)) {
      onchange(color);
      onclose?.();
    }
  }

  function handleCustomKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(custom.trim());
    }
  }
</script>

<div class="picker" role="dialog">
  <div class="swatches">
    {#each TIER_PALETTE as color}
      <button
        class="swatch"
        class:active={value.toLowerCase() === color.toLowerCase()}
        style="--swatch: {color};"
        title={color}
        onclick={() => { onchange(color); onclose?.(); }}
        aria-label="Color {color}"
      ></button>
    {/each}
  </div>
  <div class="custom-row">
    <span class="custom-label">Custom</span>
    <input
      type="text"
      class="custom-input"
      bind:value={custom}
      placeholder="#rrggbb"
      onkeydown={handleCustomKeydown}
      maxlength={7}
    />
    <button class="apply" onclick={() => commit(custom.trim())}>Apply</button>
  </div>
</div>

<style>
  .picker {
    background: var(--color-surface-lowest);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-ambient), 0 4px 16px rgba(0, 0, 0, 0.25);
    padding: 0.5rem;
    min-width: 10rem;
  }

  .swatches {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.3rem;
  }

  .swatch {
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-md);
    background: var(--swatch);
    border: none;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
  }

  .swatch:hover { transform: scale(1.08); }

  .swatch.active {
    box-shadow: 0 0 0 2px var(--color-text), inset 0 0 0 2px var(--color-bg);
  }

  .custom-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.5rem;
  }

  .custom-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
    font-family: var(--font-label);
    font-weight: 600;
  }

  .custom-input {
    flex: 1;
    background: var(--color-surface-high);
    border: none;
    outline: none;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: var(--font-size-xs);
    padding: 0.25rem 0.4rem;
    border-radius: var(--radius-sm);
    min-width: 0;
  }

  .apply {
    background: var(--color-primary);
    color: var(--color-on-primary);
    border: none;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    cursor: pointer;
  }
</style>
