<script lang="ts">
  /**
   * Square hairline icon button. Selected state is a surface step, never the
   * accent — the accent belongs to progress and tier colors only.
   */
  interface Props {
    /** Material Symbols glyph name. */
    icon: string;
    label: string;
    /** Square side in rem; the handoff uses 26/28/30/32px → 1.8–2.2rem. */
    size?: string;
    /** Glyph size in rem; defaults to roughly 0.58 × size. */
    iconSize?: string;
    selected?: boolean;
    disabled?: boolean;
    /** Drops the hairline — for buttons that sit inside an already-framed row. */
    bare?: boolean;
    filled?: boolean;
    title?: string;
    class?: string;
    /** "submit" inside a form; plain button otherwise. */
    type?: "button" | "submit";
    onclick?: (e: MouseEvent) => void;
  }

  let {
    icon,
    label,
    size = "2.1rem",
    iconSize = "",
    selected = false,
    disabled = false,
    bare = false,
    filled = false,
    title = "",
    class: klass = "",
    type = "button",
    onclick,
  }: Props = $props();

  let glyph = $derived(iconSize || `calc(${size} * 0.58)`);
</script>

<button
  {type}
  class="ab-icon-btn {klass}"
  class:selected
  class:bare
  aria-label={label}
  aria-pressed={selected ? true : undefined}
  title={title || label}
  {disabled}
  style="--size: {size}; --glyph: {glyph};"
  {onclick}
>
  <span class="material-symbols-outlined" class:filled aria-hidden="true">{icon}</span>
</button>

<style>
  .ab-icon-btn {
    width: var(--size);
    height: var(--size);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: none;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-md);
    color: var(--color-text-variant);
    cursor: pointer;
    transition:
      background var(--motion-fast) ease,
      color var(--motion-fast) ease;
  }

  .ab-icon-btn.bare {
    border-color: transparent;
  }

  .ab-icon-btn:hover:not(:disabled),
  .ab-icon-btn.selected {
    background: var(--color-surface-high);
    color: var(--color-text);
  }

  .ab-icon-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .ab-icon-btn:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .material-symbols-outlined {
    font-size: var(--glyph);
  }

  .filled {
    font-variation-settings: "FILL" 1;
  }
</style>
