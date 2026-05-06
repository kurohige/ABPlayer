<script lang="ts">
  import { onMount } from "svelte";
  import type { BookMeta, Tier, TierList } from "../types";
  import { libraryStore } from "../stores/libraryStore";
  import { userdataStore, getDisplayTitle } from "../stores/userdataStore";
  import {
    tierListsStore,
    assignBookToTier,
    unassignBook,
    addTier,
    updateTier,
    removeTier,
    reorderTier,
    renameTierList,
    updateListDescription,
    updateListScope,
    deleteTierList,
    duplicateTierList,
    exportTierList,
    setDefaultTierList,
  } from "../stores/tierListStore";
  import { TIER_PALETTE } from "../tierDefaults";
  import TierListSidebar from "./TierListSidebar.svelte";
  import EditableTierRow from "./EditableTierRow.svelte";
  import UnrankedPool from "./UnrankedPool.svelte";
  import NewTierListDialog from "./NewTierListDialog.svelte";
  import Modal from "./Modal.svelte";
  import { focusOnMount } from "../utils/focusOnMount";

  let activeListId = $state<string | null>(null);
  let newDialogOpen = $state(false);
  let menuOpen = $state(false);
  let editingName = $state(false);
  let nameDraft = $state("");
  let editingDescription = $state(false);
  let descriptionDraft = $state("");
  let confirmDelete = $state<string | null>(null);
  let tierRemovalChoice = $state<{ tierId: string; hasAssignments: boolean } | null>(null);

  let lists = $derived($tierListsStore.lists);
  let activeList = $derived(
    (activeListId ? lists.find((l) => l.id === activeListId) : null) ?? lists[0] ?? null,
  );
  let defaultId = $derived($userdataStore.preferences.defaultTierListId);

  // Pick the default list if nothing is selected yet
  $effect(() => {
    if (!activeListId && lists.length > 0) activeListId = defaultId || lists[0].id;
    if (activeListId && !lists.find((l) => l.id === activeListId)) {
      activeListId = lists[0]?.id || null;
    }
  });

  // Books within the active list's scope
  let scopedBooks = $derived.by(() => {
    if (!activeList) return [] as BookMeta[];
    return $libraryStore.books.filter((b) => {
      const ud = $userdataStore.books[b.filePath];
      const status = ud?.status || "not_started";
      switch (activeList!.scope) {
        case "finished": return status === "finished";
        case "in_progress": return status === "in_progress";
        default: return true;
      }
    });
  });

  // Group books by tier + collect unranked
  let grouped = $derived.by(() => {
    const map = new Map<string, BookMeta[]>();
    const unranked: BookMeta[] = [];
    if (!activeList) return { map, unranked };
    for (const tier of activeList.tiers) map.set(tier.id, []);
    for (const book of scopedBooks) {
      const tierId = activeList.assignments[book.filePath];
      if (tierId && map.has(tierId)) map.get(tierId)!.push(book);
      else unranked.push(book);
    }
    return { map, unranked };
  });

  function handleCreate(id: string) {
    activeListId = id;
  }

  function handleSelectList(id: string) {
    activeListId = id;
    editingName = false;
    editingDescription = false;
  }

  function startNameEdit(list: TierList) {
    nameDraft = list.name;
    editingName = true;
  }

  async function commitName(list: TierList) {
    editingName = false;
    const v = nameDraft.trim();
    if (v && v !== list.name) await renameTierList(list.id, v);
  }

  function startDescriptionEdit(list: TierList) {
    descriptionDraft = list.description || "";
    editingDescription = true;
  }

  async function commitDescription(list: TierList) {
    editingDescription = false;
    const v = descriptionDraft.trim();
    if (v !== (list.description || "")) await updateListDescription(list.id, v);
  }

  async function handleDropToTier(listId: string, tierId: string, filePath: string) {
    await assignBookToTier(listId, filePath, tierId);
  }

  async function handleDropToPool(listId: string, filePath: string) {
    await unassignBook(listId, filePath);
  }

  async function handleAddTier(list: TierList) {
    await addTier(list.id, {
      label: "New",
      color: TIER_PALETTE[list.tiers.length % TIER_PALETTE.length],
    });
  }

  async function handleRemoveTier(list: TierList, tier: Tier, mode: "pool" | "adjacent") {
    await removeTier(list.id, tier.id, mode);
    tierRemovalChoice = null;
  }

  function requestRemoveTier(list: TierList, tier: Tier) {
    const hasAssignments = Object.values(list.assignments).some((id) => id === tier.id);
    if (!hasAssignments) {
      removeTier(list.id, tier.id, "pool");
      return;
    }
    tierRemovalChoice = { tierId: tier.id, hasAssignments };
  }

  async function handleDuplicate(list: TierList) {
    const newId = await duplicateTierList(list.id);
    if (newId) activeListId = newId;
    menuOpen = false;
  }

  async function handleExport(list: TierList) {
    await exportTierList(list.id);
    menuOpen = false;
  }

  async function handleDelete(list: TierList) {
    confirmDelete = list.id;
    menuOpen = false;
  }

  async function confirmDeleteList() {
    if (!confirmDelete) return;
    await deleteTierList(confirmDelete);
    confirmDelete = null;
  }

  async function handleSetDefault(list: TierList) {
    await setDefaultTierList(list.id);
    menuOpen = false;
  }

  function updatedAgo(iso: string): string {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diff = Math.max(0, now - then);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  }

  onMount(() => {
    function onClickAway(e: MouseEvent) {
      if (menuOpen) {
        const target = e.target as HTMLElement;
        if (!target.closest(".menu-wrap")) menuOpen = false;
      }
    }
    window.addEventListener("click", onClickAway);
    return () => window.removeEventListener("click", onClickAway);
  });
</script>

<div class="tiers-view">
  <TierListSidebar
    {lists}
    activeId={activeList?.id || null}
    {defaultId}
    onselect={handleSelectList}
    oncreate={() => (newDialogOpen = true)}
  />

  <main class="main">
    {#if !activeList}
      <div class="empty">
        <span class="material-symbols-outlined empty-icon">format_list_numbered</span>
        <p class="empty-title">No tier lists yet</p>
        <p class="empty-hint">Rank your books into tiers — create as many lists as you like.</p>
        <button class="btn-primary" onclick={() => (newDialogOpen = true)}>
          <span class="material-symbols-outlined" style="font-size:1rem;">add</span>
          Create your first tier list
        </button>
      </div>
    {:else}
      <header class="list-header">
        <div class="title-block">
          {#if editingName}
            <input
              class="name-input"
              bind:value={nameDraft}
              use:focusOnMount
              onblur={() => commitName(activeList!)}
              onkeydown={(e: KeyboardEvent) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                else if (e.key === "Escape") editingName = false;
              }}
              maxlength={100}
            />
          {:else}
            <button type="button" class="list-title" onclick={() => startNameEdit(activeList!)}>
              <span class="list-title-text">{activeList.name}</span>
              {#if activeList.id === defaultId}
                <span class="default-badge" title="Default list">DEFAULT</span>
              {/if}
            </button>
          {/if}
          {#if editingDescription}
            <textarea
              class="desc-input"
              bind:value={descriptionDraft}
              use:focusOnMount
              onblur={() => commitDescription(activeList!)}
              placeholder="Add a description"
              maxlength={500}
            ></textarea>
          {:else}
            <button type="button" class="list-description" onclick={() => startDescriptionEdit(activeList!)}>
              {activeList.description || "Click to add a description"}
            </button>
          {/if}
        </div>

        <div class="header-actions">
          <button class="pill-btn" onclick={() => handleDuplicate(activeList!)} title="Duplicate list">
            <span class="material-symbols-outlined">content_copy</span>
            <span class="hide-narrow">Duplicate</span>
          </button>
          <button class="pill-btn" onclick={() => handleExport(activeList!)} title="Export JSON">
            <span class="material-symbols-outlined">download</span>
            <span class="hide-narrow">Export</span>
          </button>
          <div class="menu-wrap">
            <button class="icon-btn" onclick={(e) => { e.stopPropagation(); menuOpen = !menuOpen; }} title="More" aria-label="More actions">
              <span class="material-symbols-outlined">more_horiz</span>
            </button>
            {#if menuOpen}
              <div class="menu">
                {#if activeList.id !== defaultId}
                  <button class="menu-item" onclick={() => handleSetDefault(activeList!)}>
                    <span class="material-symbols-outlined">star</span> Set as default
                  </button>
                {/if}
                <label class="menu-item">
                  <span class="material-symbols-outlined">filter_alt</span>
                  <select
                    class="scope-select"
                    value={activeList.scope}
                    onchange={(e) => updateListScope(activeList!.id, (e.target as HTMLSelectElement).value as TierList["scope"])}
                  >
                    <option value="all">Entire library</option>
                    <option value="finished">Finished only</option>
                    <option value="in_progress">Reading only</option>
                  </select>
                </label>
                <button class="menu-item danger" onclick={() => handleDelete(activeList!)}>
                  <span class="material-symbols-outlined">delete</span> Delete list
                </button>
              </div>
            {/if}
          </div>
        </div>
      </header>

      <div class="meta-row">
        <span class="meta-chip">{activeList.tiers.length} tiers</span>
        <span class="meta-chip">{Object.keys(activeList.assignments).length} books ranked</span>
        <span class="meta-chip">{activeList.scope === "all" ? "All books" : activeList.scope === "finished" ? "Finished only" : "Reading only"}</span>
        <span class="meta-fill"></span>
        <span class="updated">Updated {updatedAgo(activeList.updatedAt)}</span>
      </div>

      <div class="board">
        {#each activeList.tiers.slice().sort((a, b) => a.order - b.order) as tier, i (tier.id)}
          <EditableTierRow
            {tier}
            books={grouped.map.get(tier.id) || []}
            userData={$userdataStore.books}
            canMoveUp={i > 0}
            canMoveDown={i < activeList.tiers.length - 1}
            onrelabel={(label) => updateTier(activeList!.id, tier.id, { label })}
            onrename={(name) => updateTier(activeList!.id, tier.id, { name })}
            onrecolor={(color) => updateTier(activeList!.id, tier.id, { color })}
            onmove={(delta) => reorderTier(activeList!.id, tier.id, delta)}
            ondelete={() => requestRemoveTier(activeList!, tier)}
            ondropbook={(fp) => handleDropToTier(activeList!.id, tier.id, fp)}
          />
        {/each}

        <button class="add-tier-btn" onclick={() => handleAddTier(activeList!)}>
          <span class="material-symbols-outlined" style="font-size:1rem;">add</span>
          Add tier row
        </button>

        <UnrankedPool
          books={grouped.unranked}
          userData={$userdataStore.books}
          ondropbook={(fp) => handleDropToPool(activeList!.id, fp)}
        />
      </div>
    {/if}
  </main>
</div>

{#if newDialogOpen}
  <NewTierListDialog
    onclose={() => (newDialogOpen = false)}
    oncreated={handleCreate}
  />
{/if}

{#if confirmDelete}
  {@const l = lists.find((x) => x.id === confirmDelete)}
  <Modal onclose={() => (confirmDelete = null)} label="Delete tier list">
    <h3>Delete tier list?</h3>
    <p class="confirm-text">
      "{l?.name}" and its {Object.keys(l?.assignments || {}).length} rankings will be removed. This can't be undone.
    </p>
    <div class="confirm-actions">
      <button class="btn-ghost" onclick={() => (confirmDelete = null)}>Cancel</button>
      <button class="btn-danger" onclick={confirmDeleteList}>Delete</button>
    </div>
  </Modal>
{/if}

{#if tierRemovalChoice && activeList}
  {@const tier = activeList.tiers.find((t) => t.id === tierRemovalChoice!.tierId)}
  <Modal onclose={() => (tierRemovalChoice = null)} label="Delete tier row">
    <h3>This tier has books assigned</h3>
    <p class="confirm-text">
      What should happen to books currently in "{tier?.label}"?
    </p>
    <div class="confirm-actions vertical">
      <button class="btn-ghost" onclick={() => handleRemoveTier(activeList!, tier!, "pool")}>
        Move them to the unranked pool
      </button>
      <button class="btn-ghost" onclick={() => handleRemoveTier(activeList!, tier!, "adjacent")}>
        Merge into adjacent tier
      </button>
      <button class="btn-ghost" onclick={() => (tierRemovalChoice = null)}>Cancel</button>
    </div>
  </Modal>
{/if}

<style>
  .tiers-view {
    flex: 1;
    display: flex;
    overflow: hidden;
    background: var(--color-bg);
  }

  .main {
    flex: 1;
    min-width: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    text-align: center;
    padding: var(--spacing-xl);
  }

  .empty-icon {
    font-size: 2.8rem;
    color: var(--color-outline-variant);
    margin-bottom: var(--spacing-sm);
  }

  .empty-title {
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
    color: var(--color-text-variant);
    margin: 0;
  }

  .empty-hint {
    font-size: var(--font-size-sm);
    color: var(--color-outline);
    line-height: 1.5;
    max-width: 22rem;
    margin: 0 0 var(--spacing-md);
  }

  .list-header {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-md);
    padding: var(--spacing-lg) var(--spacing-lg) var(--spacing-sm);
    border-bottom: 1px solid var(--color-outline-variant);
  }

  .title-block {
    flex: 1;
    min-width: 0;
  }

  .list-title {
    font-family: var(--font-headline);
    font-size: var(--font-size-display);
    font-weight: 600;
    margin: 0;
    color: var(--color-text);
    cursor: text;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    line-height: 1.1;
    background: none;
    border: none;
    padding: 0;
    text-align: left;
  }

  .list-title-text { overflow-wrap: anywhere; }

  .default-badge {
    font-family: var(--font-label);
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
    padding: 0.15rem 0.4rem;
    border-radius: var(--radius-sm);
  }

  .name-input {
    font-family: var(--font-headline);
    font-size: var(--font-size-display);
    font-weight: 600;
    background: var(--color-surface-high);
    border: none;
    outline: none;
    color: var(--color-text);
    padding: 0.2rem 0.4rem;
    border-radius: var(--radius-md);
    width: 100%;
  }

  .list-description {
    margin: 0.3rem 0 0;
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    color: var(--color-text-variant);
    line-height: 1.4;
    cursor: text;
    max-width: 40rem;
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    display: block;
    width: 100%;
  }

  .desc-input {
    margin-top: 0.3rem;
    width: 100%;
    max-width: 40rem;
    background: var(--color-surface-high);
    border: none;
    outline: none;
    color: var(--color-text);
    padding: 0.4rem 0.5rem;
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    line-height: 1.4;
    min-height: 2.5rem;
    resize: vertical;
  }

  .header-actions {
    display: flex;
    gap: 0.3rem;
    align-items: center;
    flex-shrink: 0;
  }

  .pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.65rem;
    border: none;
    background: var(--color-surface-high);
    color: var(--color-text-variant);
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .pill-btn:hover { background: var(--color-surface-highest); }

  .pill-btn .material-symbols-outlined { font-size: 0.9rem; }

  .icon-btn {
    width: 1.9rem;
    height: 1.9rem;
    background: var(--color-surface-high);
    border: none;
    border-radius: 50%;
    color: var(--color-text-variant);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }

  .icon-btn:hover { background: var(--color-surface-highest); }

  .menu-wrap { position: relative; }

  .menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.3rem;
    background: var(--color-surface-lowest);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-ambient), 0 6px 20px rgba(0, 0, 0, 0.25);
    padding: 0.3rem;
    z-index: 40;
    min-width: 11rem;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.45rem 0.7rem;
    background: none;
    border: none;
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    cursor: pointer;
    border-radius: var(--radius-sm);
    text-align: left;
  }

  .menu-item:hover { background: var(--color-surface-high); }

  .menu-item.danger { color: var(--color-error); }

  .menu-item .material-symbols-outlined { font-size: 1rem; }

  .scope-select {
    flex: 1;
    background: var(--color-surface-high);
    border: none;
    outline: none;
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    padding: 0.25rem 0.4rem;
    border-radius: var(--radius-sm);
  }

  .meta-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.6rem var(--spacing-lg);
    flex-wrap: wrap;
  }

  .meta-chip {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
    background: var(--color-surface-high);
    padding: 0.2rem 0.6rem;
    border-radius: var(--radius-xl);
  }

  .meta-fill { flex: 1; }

  .updated {
    font-family: var(--font-label);
    font-size: 0.65rem;
    color: var(--color-outline);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 600;
  }

  .board {
    padding: 0.5rem var(--spacing-lg) var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .add-tier-btn {
    height: 2.5rem;
    border-radius: var(--radius-md);
    background: transparent;
    border: 1px dashed var(--color-outline-variant);
    color: var(--color-text-variant);
    cursor: pointer;
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    transition: background 0.15s, color 0.15s;
  }

  .add-tier-btn:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    background: var(--gradient-primary);
    color: var(--color-on-primary);
    border: none;
    padding: 0.5rem 1rem;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary:hover { opacity: 0.9; }

  h3 {
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
    font-weight: 500;
    margin-bottom: var(--spacing-sm);
  }

  .confirm-text {
    font-size: var(--font-size-sm);
    color: var(--color-text-variant);
    line-height: 1.5;
    margin-bottom: var(--spacing-lg);
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
  }

  .confirm-actions.vertical {
    flex-direction: column;
  }

  .btn-ghost {
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text-variant);
    padding: 0.5rem 1rem;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .btn-ghost:hover { background: var(--color-surface-highest); }

  .btn-danger {
    background: var(--color-error);
    border: none;
    color: #fff;
    padding: 0.5rem 1rem;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .btn-danger:hover { opacity: 0.9; }

  @media (max-width: 560px) {
    :global(.hide-narrow) { display: none !important; }
  }
</style>
