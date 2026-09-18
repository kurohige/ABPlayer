<script lang="ts">
  /**
   * Tier drop targets for the Library: a strip along the right edge that only
   * exists while a cover is being dragged (the drag adds `ab-dragging` to
   * <body>), so a book can be ranked without leaving the library.
   */
  import type { TierList } from "../../types";
  import { bookDropZone } from "../../utils/pointerDrag";
  import { TierChip } from "../ui";

  interface Props {
    list: TierList;
    ondrop: (filePath: string, tierId: string) => void;
  }

  let { list, ondrop }: Props = $props();

  let tiers = $derived(list.tiers.slice().sort((a, b) => a.order - b.order));
  let over = $state<string | null>(null);
</script>

<div class="tds" role="group" aria-label="Drop on a tier in {list.name}">
  <span class="tds-name" title={list.name}>{list.name}</span>
  {#each tiers as t (t.id)}
    <div
      class="tds-zone"
      class:over={over === t.id}
      use:bookDropZone={{
        onover: (active) => (over = active ? t.id : over === t.id ? null : over),
        ondrop: (p) => ondrop(p.filePath, t.id),
      }}
    >
      <TierChip label={t.label} color={t.color} size="1.65rem" />
      {#if t.name}<span class="tds-label">{t.name}</span>{/if}
    </div>
  {/each}
</div>

<style>
  .tds {
    display: none;
    position: fixed;
    right: 0.7rem;
    top: 50%;
    translate: 0 -50%;
    z-index: 60;
    flex-direction: column;
    gap: 0.28rem;
    max-height: calc(100vh - 2.2rem);
    overflow-y: auto;
    padding: 0.55rem;
    background: var(--color-bg);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-panel);
    animation: ab-fade var(--motion-fast) ease both;
  }

  :global(body.ab-dragging) .tds {
    display: flex;
  }

  .tds-name {
    max-width: 8.5rem;
    padding: 0 0.28rem 0.14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-label);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-variant);
  }

  .tds-zone {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 6.5rem;
    max-width: 9.5rem;
    padding: 0.42rem 0.55rem;
    border: 1px dashed var(--color-outline-variant);
    border-radius: var(--radius-md);
    transition:
      background var(--motion-fast) ease,
      border-color var(--motion-fast) ease;
  }

  .tds-zone.over {
    background: color-mix(in srgb, var(--color-primary) 14%, transparent);
    border-color: var(--color-primary);
    border-style: solid;
  }

  .tds-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-label);
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--color-text);
  }
</style>
