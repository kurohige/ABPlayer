<script lang="ts">
  /**
   * The tier-list rail (handoff 1f): every list, the active one framed, with
   * its ranked count and a row of tier-colour dots.
   */
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

<aside class="tls">
  <div class="tls-head">
    <h1 class="tls-title">Tiers</h1>
    <span class="tls-count mono">{lists.length}</span>
  </div>

  <button class="tls-new" onclick={oncreate}>
    <span class="material-symbols-outlined" aria-hidden="true">add</span>
    New list
  </button>

  <div class="tls-lists">
    {#each lists as list (list.id)}
      {@const ranked = Object.keys(list.assignments).length}
      <button
        class="tls-row"
        class:active={list.id === activeId}
        aria-current={list.id === activeId ? "true" : undefined}
        onclick={() => onselect(list.id)}
      >
        <span class="tls-row-top">
          <span class="tls-name">{list.name}</span>
          {#if list.id === defaultId}
            <span class="tls-default">DEFAULT</span>
          {/if}
        </span>
        <span class="tls-row-bottom">
          <span class="tls-ranked mono">{ranked} ranked</span>
          <span class="tls-dots">
            {#each list.tiers.slice(0, 6) as tier (tier.id)}
              <span class="tls-dot" style="--dot: {tier.color};"></span>
            {/each}
          </span>
        </span>
      </button>
    {/each}

    {#if lists.length === 0}
      <p class="tls-empty">No lists yet.</p>
    {/if}
  </div>
</aside>

<style>
  .tls {
    width: 14.4rem;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 0.97rem 0.83rem;
    background: var(--color-bg);
    border-right: 1px solid var(--color-outline-variant);
    overflow-y: auto;
  }

  .tls-head {
    display: flex;
    align-items: baseline;
    gap: 0.42rem;
  }

  .tls-title {
    margin: 0;
    font-family: var(--font-headline);
    font-weight: 500;
    font-size: 1.46rem;
    line-height: 1;
  }

  .tls-count {
    font-size: 0.73rem;
    color: var(--color-outline);
  }

  .tls-new {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    height: 2.1rem;
    padding: 0 0.7rem;
    background: var(--color-ink);
    color: var(--color-on-ink);
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-label);
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;
  }

  .tls-new:hover {
    opacity: 0.88;
  }

  .tls-new .material-symbols-outlined {
    font-size: 1.05rem;
  }

  .tls-lists {
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
    min-height: 0;
  }

  .tls-row {
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
    padding: 0.55rem 0.7rem;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius-lg);
    text-align: left;
    cursor: pointer;
    transition:
      background var(--motion-fast) ease,
      border-color var(--motion-fast) ease;
  }

  .tls-row:hover {
    background: var(--color-surface-high);
  }

  /* The active list is the only framed row */
  .tls-row.active {
    background: var(--color-surface);
    border-color: var(--color-outline-variant);
  }

  .tls-row:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }

  .tls-row-top {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }

  .tls-name {
    flex: 1;
    min-width: 0;
    font-family: var(--font-label);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tls-row.active .tls-name {
    font-weight: 700;
  }

  .tls-default {
    flex-shrink: 0;
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.5rem;
    letter-spacing: 0.14em;
    color: var(--color-outline);
  }

  .tls-row-bottom {
    display: flex;
    align-items: center;
    gap: 0.42rem;
    min-width: 0;
  }

  .tls-ranked {
    font-size: 0.66rem;
    color: var(--color-outline);
    white-space: nowrap;
  }

  .tls-dots {
    display: flex;
    gap: 2px;
    margin-left: auto;
  }

  .tls-dot {
    width: 0.42rem;
    height: 0.42rem;
    border-radius: 50%;
    background: var(--dot);
  }

  .tls-empty {
    margin: 0.28rem 0 0;
    font-family: var(--font-body);
    font-size: 0.72rem;
    color: var(--color-outline);
  }
</style>
