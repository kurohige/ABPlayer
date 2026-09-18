<script lang="ts">
  /**
   * Docked bar for selection mode. Shown as soon as the mode is on (so the
   * circles on the covers come with an instruction), with every bulk action
   * the edit dialog offers one book at a time: status, collection, tags, tier,
   * plus combining files into one book and removing.
   *
   * Actions leave the selection in place so several can be applied in a row.
   */
  import type { BookStatus, Collection, TierList } from "../types";
  import { IconButton, Panel, Pill, TierChip } from "./ui";

  type Menu = "status" | "collection" | "tags" | "tier" | null;

  interface Props {
    selectedCount: number;
    /** How many books "Select all" would cover (the filtered view). */
    totalCount: number;
    collections: Collection[];
    /** The list bulk tiering writes to; null when the user has no tier list. */
    tierList: TierList | null;
    /** Tags on at least one selected book. */
    selectionTags: string[];
    /** Every tag in the library, for one-click adding. */
    knownTags: string[];
    /** True when the selection is 2+ plain single-file books. */
    canCombine: boolean;
    onclear: () => void;
    onselectall: () => void;
    onremove: () => void;
    onsetstatus: (status: BookStatus) => void;
    onaddtocollection: (collectionId: string) => void;
    oncreatecollection: (name: string) => void;
    onaddtag: (tag: string) => void;
    onremovetag: (tag: string) => void;
    onassigntier: (tierId: string | null) => void;
    oncombine: () => void;
  }

  let {
    selectedCount,
    totalCount,
    collections,
    tierList,
    selectionTags,
    knownTags,
    canCombine,
    onclear,
    onselectall,
    onremove,
    onsetstatus,
    onaddtocollection,
    oncreatecollection,
    onaddtag,
    onremovetag,
    onassigntier,
    oncombine,
  }: Props = $props();

  let menu = $state<Menu>(null);
  let newCollection = $state("");
  let newTag = $state("");

  const statuses: { value: BookStatus; label: string }[] = [
    { value: "not_started", label: "Not started" },
    { value: "in_progress", label: "In progress" },
    { value: "finished", label: "Finished" },
  ];

  let none = $derived(selectedCount === 0);
  let tiers = $derived((tierList?.tiers ?? []).slice().sort((a, b) => a.order - b.order));
  let addableTags = $derived(
    knownTags.filter((t) => !selectionTags.some((s) => s.toLowerCase() === t.toLowerCase())),
  );

  function toggle(next: Exclude<Menu, null>) {
    menu = menu === next ? null : next;
  }

  function submitCollection(e: SubmitEvent) {
    e.preventDefault();
    const name = newCollection.trim();
    if (!name) return;
    oncreatecollection(name);
    newCollection = "";
    menu = null;
  }

  function submitTag(e: SubmitEvent) {
    e.preventDefault();
    const tag = newTag.trim();
    if (!tag) return;
    onaddtag(tag);
    newTag = "";
  }
</script>

<div class="bb" role="toolbar" aria-label="Actions for selected books">
  <span class="bb-count" aria-live="polite">
    {#if none}
      Click books to select them
    {:else}
      <span class="mono">{selectedCount}</span> selected
    {/if}
  </span>

  <Pill
    label="Select all"
    height="1.8rem"
    disabled={selectedCount >= totalCount}
    onclick={onselectall}
  />

  <span class="bb-rule" aria-hidden="true"></span>

  <div class="bb-anchor">
    <Pill
      icon="flag"
      label="Status"
      height="1.8rem"
      disabled={none}
      ariaHasPopup
      ariaExpanded={menu === "status"}
      onclick={() => toggle("status")}
    />
    {#if menu === "status"}
      <Panel label="Set status" origin="bottom left" style="bottom: 2.4rem; left: 0;" onclose={() => (menu = null)}>
        {#each statuses as s (s.value)}
          <button class="bb-item" onclick={() => { onsetstatus(s.value); menu = null; }}>{s.label}</button>
        {/each}
      </Panel>
    {/if}
  </div>

  <div class="bb-anchor">
    <Pill
      icon="collections_bookmark"
      label="Collection"
      height="1.8rem"
      disabled={none}
      ariaHasPopup
      ariaExpanded={menu === "collection"}
      onclick={() => toggle("collection")}
    />
    {#if menu === "collection"}
      <Panel label="Add to collection" origin="bottom left" width="14rem" style="bottom: 2.4rem; left: 0;" onclose={() => (menu = null)}>
        <div class="bb-scroll">
          {#each collections as col (col.id)}
            <button class="bb-item" onclick={() => { onaddtocollection(col.id); menu = null; }}>
              <span class="bb-dot" style:background={col.color}></span>
              <span class="bb-item-text">{col.name}</span>
            </button>
          {/each}
        </div>
        <form class="bb-form" onsubmit={submitCollection}>
          <input
            class="bb-input"
            type="text"
            placeholder="New collection…"
            aria-label="New collection name"
            maxlength="60"
            bind:value={newCollection}
          />
          <IconButton icon="add" label="Create and add" size="1.8rem" type="submit" disabled={!newCollection.trim()} />
        </form>
      </Panel>
    {/if}
  </div>

  <div class="bb-anchor">
    <Pill
      icon="sell"
      label="Tags"
      height="1.8rem"
      disabled={none}
      ariaHasPopup
      ariaExpanded={menu === "tags"}
      onclick={() => toggle("tags")}
    />
    {#if menu === "tags"}
      <Panel label="Tags" origin="bottom left" width="15rem" pad="0.7rem" style="bottom: 2.4rem; left: 0;" onclose={() => (menu = null)}>
        <form class="bb-form top" onsubmit={submitTag}>
          <input
            class="bb-input"
            type="text"
            placeholder="Add a tag…"
            aria-label="Tag to add"
            maxlength="40"
            bind:value={newTag}
          />
          <IconButton icon="add" label="Add tag" size="1.8rem" type="submit" disabled={!newTag.trim()} />
        </form>
        {#if addableTags.length > 0}
          <div class="bb-sub">Add</div>
          <div class="bb-tags">
            {#each addableTags as t (t)}
              <button class="bb-tag" onclick={() => onaddtag(t)}>
                <span class="material-symbols-outlined" aria-hidden="true">add</span>{t}
              </button>
            {/each}
          </div>
        {/if}
        {#if selectionTags.length > 0}
          <div class="bb-sub">On the selection — click to remove</div>
          <div class="bb-tags">
            {#each selectionTags as t (t)}
              <button class="bb-tag on" onclick={() => onremovetag(t)}>
                <span class="material-symbols-outlined" aria-hidden="true">close</span>{t}
              </button>
            {/each}
          </div>
        {/if}
      </Panel>
    {/if}
  </div>

  <div class="bb-anchor">
    <Pill
      icon="military_tech"
      label="Tier"
      height="1.8rem"
      disabled={none}
      ariaHasPopup
      ariaExpanded={menu === "tier"}
      onclick={() => toggle("tier")}
    />
    {#if menu === "tier"}
      <Panel label="Set tier" origin="bottom left" width="13rem" style="bottom: 2.4rem; left: 0;" onclose={() => (menu = null)}>
        {#if tierList}
          <div class="bb-sub pad">{tierList.name}</div>
          <div class="bb-scroll">
            {#each tiers as t (t.id)}
              <button class="bb-item" onclick={() => { onassigntier(t.id); menu = null; }}>
                <TierChip label={t.label} color={t.color} size="1.25rem" />
                <span class="bb-item-text">{t.name || `Tier ${t.label}`}</span>
              </button>
            {/each}
          </div>
          <button class="bb-item muted" onclick={() => { onassigntier(null); menu = null; }}>
            Back to the unranked pool
          </button>
        {:else}
          <p class="bb-note">Create a tier list in the Tiers view first.</p>
        {/if}
      </Panel>
    {/if}
  </div>

  <Pill
    icon="merge"
    label="Combine"
    title={canCombine ? "Combine the selected files into one book" : "Select two or more single-file books to combine them"}
    height="1.8rem"
    disabled={!canCombine}
    onclick={oncombine}
  />

  <Pill icon="delete" label="Remove" height="1.8rem" class="bb-danger" disabled={none} onclick={onremove} />

  <span class="bb-rule" aria-hidden="true"></span>

  <IconButton icon="close" label="Leave selection (Esc)" size="1.8rem" onclick={onclear} />
</div>

<style>
  .bb {
    position: fixed;
    bottom: 1.1rem;
    left: 50%;
    translate: -50% 0;
    z-index: 50;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.42rem;
    max-width: calc(100vw - 2.2rem);
    padding: 0.55rem 0.7rem;
    background: var(--color-bg);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-panel);
    animation: ab-rise var(--motion-rise) var(--ease-out) both;
  }

  .bb-count {
    padding: 0 0.28rem;
    font-family: var(--font-label);
    font-size: 0.76rem;
    font-weight: 700;
    color: var(--color-text);
    white-space: nowrap;
  }

  .bb-rule {
    width: 1px;
    height: 1.25rem;
    background: var(--color-outline-variant);
  }

  .bb-anchor {
    position: relative;
    display: flex;
  }

  .bb :global(.bb-danger:not(:disabled)),
  .bb :global(.bb-danger:not(:disabled) .ab-pill-icon) {
    color: var(--color-error);
  }

  .bb-scroll {
    max-height: 12.5rem;
    overflow-y: auto;
  }

  .bb-item {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    min-height: 2.1rem;
    padding: 0 0.7rem;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: 0.76rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  .bb-item:hover {
    background: var(--color-surface-high);
  }

  .bb-item:focus-visible,
  .bb-tag:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }

  .bb-item.muted {
    color: var(--color-text-variant);
  }

  .bb-item-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bb-dot {
    width: 0.62rem;
    height: 0.62rem;
    flex-shrink: 0;
    border-radius: 50%;
  }

  .bb-form {
    display: flex;
    align-items: center;
    gap: 0.28rem;
    margin-top: 0.28rem;
    padding: 0.42rem 0.28rem 0.14rem;
    border-top: 1px solid var(--color-outline-variant);
  }

  .bb-form.top {
    margin: 0 0 0.42rem;
    padding: 0;
    border-top: none;
  }

  .bb-input {
    flex: 1;
    min-width: 0;
    height: 1.8rem;
    padding: 0 0.55rem;
    background: var(--color-surface-low);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: 0.76rem;
  }

  .bb-input:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  .bb-sub {
    margin: 0.42rem 0 0.28rem;
    font-family: var(--font-label);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-variant);
  }

  .bb-sub.pad {
    margin: 0.28rem 0.7rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bb-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.28rem;
    max-height: 7rem;
    overflow-y: auto;
  }

  .bb-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.14rem;
    height: 1.5rem;
    padding: 0 0.5rem 0 0.28rem;
    background: none;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
  }

  .bb-tag:hover {
    background: var(--color-surface-high);
  }

  .bb-tag.on {
    background: var(--color-surface-high);
  }

  .bb-tag .material-symbols-outlined {
    font-size: 0.9rem;
    color: var(--color-text-variant);
  }

  .bb-note {
    margin: 0;
    padding: 0.42rem 0.7rem;
    font-family: var(--font-body);
    font-size: 0.76rem;
    line-height: 1.4;
    color: var(--color-text-variant);
  }
</style>
