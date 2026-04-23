<script lang="ts">
  import type { TierList } from "../types";

  interface Props {
    lists: TierList[];
    activeId: string | null;
    defaultId: string | null;
    onselect: (id: string) => void;
    oncreate: () => void;
  }

  let { lists, activeId, defaultId, onselect, oncreate }: Props = $props();
</script>

<aside class="sidebar">
  <div class="header">
    <h1 class="title">Tiers</h1>
    <span class="count">{lists.length} list{lists.length === 1 ? "" : "s"}</span>
  </div>

  <div class="new-wrap">
    <button class="btn-primary" onclick={oncreate}>
      <span class="material-symbols-outlined" style="font-size:1rem;">add</span>
      New tier list
    </button>
  </div>

  <div class="lists">
    {#each lists as list (list.id)}
      {@const rankedCount = Object.keys(list.assignments).length}
      <button
        class="list-row"
        class:active={list.id === activeId}
        onclick={() => onselect(list.id)}
      >
        <div class="list-name">
          <span class="name-text">{list.name}</span>
          {#if list.id === defaultId}
            <span class="default-dot" title="Default list"></span>
          {/if}
        </div>
        <div class="list-meta">
          <span>{rankedCount} ranked</span>
          <span class="dot-sep">·</span>
          <div class="color-dots">
            {#each list.tiers.slice(0, 5) as tier}
              <span class="color-dot" style="--dot-color: {tier.color};"></span>
            {/each}
          </div>
        </div>
      </button>
    {/each}
  </div>
</aside>

<style>
  .sidebar {
    width: 15rem;
    flex-shrink: 0;
    background: var(--color-surface);
    border-right: 1px solid var(--color-outline-variant);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .header {
    padding: 0.9rem 0.9rem 0.3rem;
  }

  .title {
    font-family: var(--font-headline);
    font-size: var(--font-size-xl);
    font-weight: 600;
    margin: 0;
    color: var(--color-text);
  }

  .count {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
  }

  .new-wrap {
    padding: 0.4rem 0.7rem 0.7rem;
  }

  .btn-primary {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    background: var(--gradient-primary);
    color: var(--color-on-primary);
    border: none;
    padding: 0.45rem 0.8rem;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary:hover { opacity: 0.9; }

  .lists {
    flex: 1;
    overflow-y: auto;
    padding: 0 0.4rem 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .list-row {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.55rem 0.7rem;
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s;
  }

  .list-row:hover {
    background: var(--color-surface-high);
  }

  .list-row.active {
    background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  }

  .list-row.active .name-text {
    color: var(--color-primary);
  }

  .list-name {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .name-text {
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .default-dot {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: var(--color-primary);
    flex-shrink: 0;
  }

  .list-meta {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
  }

  .dot-sep { opacity: 0.5; }

  .color-dots {
    display: flex;
    gap: 0.15rem;
  }

  .color-dot {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: var(--dot-color);
  }
</style>
