<script lang="ts">
  /**
   * The status / tier / collection chips. Split out of the header because the
   * refresh puts them under the "All books" section label, next to the grid
   * they filter. Collection chips are still drop targets for book covers.
   */
  import type { Collection, FilterStatus, Tier } from "../../types";
  import { bookDropZone } from "../../utils/pointerDrag";
  import { Pill, TierChip } from "../ui";

  interface Props {
    filterStatus: FilterStatus;
    filterCollection: string | null;
    filterTier: string | null;
    tierFilterOptions: Tier[];
    collections: Collection[];
    onstatusfilter: (s: FilterStatus) => void;
    oncollectionfilter: (id: string | null) => void;
    ontierfilter: (id: string | null) => void;
    /** A book cover dropped on a collection chip joins that collection. */
    ondrop: (collectionId: string, filePath: string) => void;
  }

  let {
    filterStatus,
    filterCollection,
    filterTier,
    tierFilterOptions,
    collections,
    onstatusfilter,
    oncollectionfilter,
    ontierfilter,
    ondrop,
  }: Props = $props();

  const STATUS_FILTERS: { value: FilterStatus; label: string }[] = [
    { value: "all", label: "All" },
    { value: "in_progress", label: "Reading" },
    { value: "finished", label: "Finished" },
    { value: "not_started", label: "New" },
  ];

  let dragOver = $state<string | null>(null);
</script>

<div class="lf">
  {#each STATUS_FILTERS as sf (sf.value)}
    <Pill
      label={sf.label}
      height="1.8rem"
      selected={filterStatus === sf.value}
      onclick={() => onstatusfilter(sf.value)}
    />
  {/each}

  {#if tierFilterOptions.length > 0}
    <span class="lf-divider"></span>
    {#each tierFilterOptions as tier (tier.id)}
      <button
        class="lf-tier"
        class:selected={filterTier === tier.id}
        title={tier.name ? `${tier.label} — ${tier.name}` : tier.label}
        aria-pressed={filterTier === tier.id}
        onclick={() => ontierfilter(filterTier === tier.id ? null : tier.id)}
      >
        <TierChip label={tier.label} color={tier.color} size="1.4rem" />
      </button>
    {/each}
  {/if}

  {#if collections.length > 0}
    <span class="lf-divider"></span>
    {#each collections as col (col.id)}
      <button
        class="lf-collection"
        class:selected={filterCollection === col.id}
        class:drop-target={dragOver === col.id}
        aria-pressed={filterCollection === col.id}
        onclick={() => oncollectionfilter(filterCollection === col.id ? null : col.id)}
        use:bookDropZone={{
          onover: (over) => {
            if (over) dragOver = col.id;
            else if (dragOver === col.id) dragOver = null;
          },
          ondrop: (p) => ondrop(col.id, p.filePath),
        }}
      >
        <span class="lf-dot" style="--dot: {col.color};"></span>
        {col.name}
      </button>
    {/each}
  {/if}
</div>

<style>
  .lf {
    display: flex;
    align-items: center;
    gap: 0.42rem;
    flex-wrap: wrap;
    min-width: 0;
  }

  .lf-divider {
    width: 1px;
    height: 1.1rem;
    margin: 0 0.28rem;
    background: var(--color-outline-variant);
    flex-shrink: 0;
  }

  .lf-tier {
    display: flex;
    padding: 0.14rem;
    background: none;
    border: 1px solid transparent;
    border-radius: 50%;
    cursor: pointer;
  }

  .lf-tier.selected {
    border-color: var(--color-text);
  }

  .lf-collection {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    height: 1.8rem;
    padding: 0 0.7rem;
    background: none;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: 0.73rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background var(--motion-fast) ease,
      border-color var(--motion-fast) ease;
  }

  .lf-collection:hover {
    background: var(--color-surface-high);
  }

  .lf-collection.selected {
    background: var(--color-ink);
    border-color: var(--color-ink);
    color: var(--color-on-ink);
    font-weight: 700;
  }

  /* Hovered while dragging a cover — the one place a chip shows the accent */
  .lf-collection.drop-target {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  }

  .lf-dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: var(--dot);
    flex-shrink: 0;
  }
</style>
