<script lang="ts">
  /**
   * Two-up grid/list switch. Selected reads as an inset surface on a
   * surface-high track — the segmented-control pattern the player's tabs and
   * the tier board header reuse.
   */
  interface Props {
    mode: "grid" | "list";
    onchange: (m: "grid" | "list") => void;
  }

  let { mode, onchange }: Props = $props();

  const OPTIONS: { value: "grid" | "list"; icon: string; label: string }[] = [
    { value: "grid", icon: "grid_view", label: "Grid view" },
    { value: "list", icon: "format_list_bulleted", label: "List view" },
  ];
</script>

<div class="vt" role="group" aria-label="View mode">
  {#each OPTIONS as opt (opt.value)}
    <button
      type="button"
      class="vt-btn"
      class:selected={mode === opt.value}
      aria-label={opt.label}
      aria-pressed={mode === opt.value}
      title={opt.label}
      onclick={() => onchange(opt.value)}
    >
      <span class="material-symbols-outlined" aria-hidden="true">{opt.icon}</span>
    </button>
  {/each}
</div>

<style>
  .vt {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 2.1rem;
    padding: 2px;
    flex-shrink: 0;
    background: var(--color-surface-high);
    border-radius: var(--radius-md);
  }

  .vt-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.9rem;
    height: 100%;
    padding: 0;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-variant);
    cursor: pointer;
    transition:
      background var(--motion-fast) ease,
      color var(--motion-fast) ease;
  }

  .vt-btn.selected {
    background: var(--color-surface);
    color: var(--color-text);
  }

  .vt-btn:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }

  .material-symbols-outlined {
    font-size: 1.05rem;
  }
</style>
