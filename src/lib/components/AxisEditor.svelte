<script lang="ts">
  import { focusOnMount } from "../utils/focusOnMount";

  interface Props {
    label: string;
    value: number;
    color: string;
    onlabel: (next: string) => void;
    onvalue: (next: number) => void;
    ondelete: () => void;
  }

  let { label, value, color, onlabel, onvalue, ondelete }: Props = $props();

  let editing = $state(false);
  // svelte-ignore state_referenced_locally — intentional one-shot seed; edit handler always resets draft to current label before enabling edit mode
  let draft = $state(label);

  function startEdit() {
    draft = label;
    editing = true;
  }

  function commit() {
    editing = false;
    const v = draft.trim();
    if (v && v !== label) onlabel(v);
    else draft = label;
  }
</script>

<div class="axis">
  <div class="axis-head">
    {#if editing}
      <input
        class="label-input"
        bind:value={draft}
        use:focusOnMount
        onblur={commit}
        onkeydown={(e: KeyboardEvent) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          else if (e.key === "Escape") { draft = label; editing = false; }
        }}
        maxlength={30}
      />
    {:else}
      <button type="button" class="label-btn" onclick={startEdit}>{label}</button>
    {/if}
    <span class="value">{value}</span>
    <button class="remove" onclick={ondelete} title="Remove axis" aria-label="Remove axis">×</button>
  </div>
  <div class="bar-wrap">
    <div class="bar-bg"></div>
    <div class="bar-fill" style="--bar-color: {color}; width: {(value / 10) * 100}%;"></div>
    <input
      class="slider"
      type="range"
      min="0"
      max="10"
      step="1"
      value={value}
      oninput={(e: Event) => onvalue(parseInt((e.target as HTMLInputElement).value, 10))}
    />
  </div>
</div>

<style>
  .axis {
    margin-bottom: 0.7rem;
  }

  .axis-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .label-btn {
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    color: var(--color-text);
    background: none;
    border: none;
    padding: 0;
    cursor: text;
    flex: 1;
    min-width: 0;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .label-btn:hover { color: var(--color-primary); }

  .label-input {
    flex: 1;
    background: var(--color-surface-high);
    border: none;
    outline: none;
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    padding: 0.15rem 0.4rem;
    border-radius: var(--radius-sm);
    min-width: 0;
  }

  .value {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    color: var(--color-text);
    width: 1.5rem;
    text-align: right;
  }

  .remove {
    background: none;
    border: none;
    color: var(--color-outline);
    cursor: pointer;
    font-size: 1.1rem;
    line-height: 1;
    padding: 0 0.25rem;
    opacity: 0.6;
    transition: opacity 0.15s, color 0.15s;
  }

  .remove:hover {
    opacity: 1;
    color: var(--color-error);
  }

  .bar-wrap {
    position: relative;
    height: 0.4rem;
  }

  .bar-bg {
    position: absolute;
    inset: 0;
    background: var(--color-surface-high);
    border-radius: var(--radius-sm);
  }

  .bar-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: var(--bar-color);
    border-radius: var(--radius-sm);
    transition: width 0.15s ease-out;
  }

  .slider {
    position: absolute;
    inset: -0.5rem 0;
    width: 100%;
    height: calc(100% + 1rem);
    margin: 0;
    padding: 0;
    appearance: none;
    background: transparent;
    cursor: pointer;
    opacity: 0;
  }

  .bar-wrap:hover .bar-fill { filter: brightness(1.1); }
</style>
