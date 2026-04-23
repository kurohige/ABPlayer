<script lang="ts">
  import type { BookStatus, Collection } from "../types";

  interface Props {
    selectedCount: number;
    collections: Collection[];
    onclear: () => void;
    onremove: () => void;
    onsetstatus: (status: BookStatus) => void;
    onaddtocollection: (collectionId: string) => void;
  }

  let { selectedCount, collections, onclear, onremove, onsetstatus, onaddtocollection }: Props = $props();

  let statusOpen = $state(false);
  let collectionOpen = $state(false);

  const statuses: { value: BookStatus; label: string }[] = [
    { value: "not_started", label: "Not Started" },
    { value: "in_progress", label: "In Progress" },
    { value: "finished", label: "Finished" },
  ];
</script>

<div class="batch-bar">
  <span class="batch-count">{selectedCount} selected</span>

  <div class="batch-actions">
    <div class="dropdown-wrap">
      <button class="batch-btn" onclick={() => { statusOpen = !statusOpen; collectionOpen = false; }}>
        <span class="material-symbols-outlined" style="font-size:16px;">flag</span>
        Status
      </button>
      {#if statusOpen}
        <div class="dropdown">
          {#each statuses as s}
            <button class="dropdown-item" onclick={() => { onsetstatus(s.value); statusOpen = false; }}>
              {s.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    {#if collections.length > 0}
      <div class="dropdown-wrap">
        <button class="batch-btn" onclick={() => { collectionOpen = !collectionOpen; statusOpen = false; }}>
          <span class="material-symbols-outlined" style="font-size:16px;">collections_bookmark</span>
          Collection
        </button>
        {#if collectionOpen}
          <div class="dropdown">
            {#each collections as col}
              <button class="dropdown-item" onclick={() => { onaddtocollection(col.id); collectionOpen = false; }}>
                <span class="dot" style:background={col.color}></span>
                {col.name}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <button class="batch-btn danger" onclick={onremove}>
      <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
      Remove
    </button>
  </div>

  <button class="batch-btn ghost" onclick={onclear}>
    <span class="material-symbols-outlined" style="font-size:16px;">close</span>
  </button>
</div>

<style>
  .batch-bar {
    position: fixed;
    bottom: var(--spacing-lg);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    background: var(--color-surface-lowest);
    border-radius: var(--radius-xl);
    padding: var(--spacing-sm) var(--spacing-md);
    box-shadow: var(--shadow-ambient), 0 4px 20px rgba(0, 0, 0, 0.15);
    z-index: 50;
  }

  .batch-count {
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-primary);
    white-space: nowrap;
  }

  .batch-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .dropdown-wrap {
    position: relative;
  }

  .batch-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text-variant);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    padding: 6px 10px;
    border-radius: var(--radius-xl);
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }

  .batch-btn:hover {
    background: var(--color-surface-highest);
  }

  .batch-btn.danger {
    color: var(--color-error);
  }

  .batch-btn.danger:hover {
    background: color-mix(in srgb, var(--color-error) 10%, var(--color-surface-high));
  }

  .batch-btn.ghost {
    background: none;
    padding: 4px;
  }

  .dropdown {
    position: absolute;
    bottom: 100%;
    left: 0;
    margin-bottom: 4px;
    background: var(--color-surface-lowest);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-ambient);
    padding: 4px;
    z-index: 60;
    min-width: 130px;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    background: none;
    border: none;
    color: var(--color-text-variant);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    padding: 6px 12px;
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .dropdown-item:hover {
    background: var(--color-surface-container);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
</style>
