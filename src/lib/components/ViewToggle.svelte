<script lang="ts">
  interface Props {
    mode: "grid" | "list";
    onchange: (mode: "grid" | "list") => void;
  }

  let { mode, onchange }: Props = $props();
</script>

<div class="toggle">
  <button
    class="toggle-btn"
    class:active={mode === "list"}
    onclick={() => onchange("list")}
    title="List view"
  >
    <span class="material-symbols-outlined">format_list_bulleted</span>
  </button>
  <button
    class="toggle-btn"
    class:active={mode === "grid"}
    onclick={() => onchange("grid")}
    title="Grid view"
  >
    <span class="material-symbols-outlined">grid_view</span>
  </button>
</div>

<style>
  .toggle {
    display: flex;
    background: var(--color-surface-high);
    border-radius: var(--radius-xl);
    padding: 2px;
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--color-outline);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: var(--radius-lg);
    transition: background 0.15s, color 0.15s;
  }

  .toggle-btn .material-symbols-outlined {
    font-size: 18px;
  }

  .toggle-btn.active {
    background: var(--color-surface-lowest);
    color: var(--color-primary);
    box-shadow: var(--shadow-card);
  }

  .toggle-btn:not(.active):hover {
    color: var(--color-text-variant);
  }
</style>
