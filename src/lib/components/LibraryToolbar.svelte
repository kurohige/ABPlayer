<script lang="ts">
  import { onDestroy } from "svelte";
  import type { SortBy, FilterStatus, Collection, Tier } from "../types";
  import ViewToggle from "./ViewToggle.svelte";
  import CollectionTag from "./CollectionTag.svelte";
  import TierBadge from "./TierBadge.svelte";

  interface Props {
    viewMode: "grid" | "list";
    sortBy: SortBy;
    filterStatus: FilterStatus;
    filterCollection: string | null;
    filterTier: string | null;
    tierFilterOptions: Tier[];
    collections: Collection[];
    folders: string[];
    scanning: boolean;
    enriching: boolean;
    hasBooks: boolean;
    onselect: () => void;
    onviewchange: (mode: "grid" | "list") => void;
    onsortchange: (sort: SortBy) => void;
    onstatusfilter: (status: FilterStatus) => void;
    oncollectionfilter: (id: string | null) => void;
    ontierfilter: (id: string | null) => void;
    onsearch: (query: string) => void;
    onaddfolder: () => void;
    onaddbook: () => void;
    onremovefolder: (folder: string) => void;
    onrescan: () => void;
    onexport: () => void;
    onimport: () => void;
    onmanagecollections: () => void;
    onstats: () => void;
    ondrop: (collectionId: string, filePath: string) => void;
    nowPlaying: string | null;
    onnowplaying: () => void;
  }

  let {
    viewMode,
    sortBy,
    filterStatus,
    filterCollection,
    filterTier,
    tierFilterOptions,
    collections,
    folders,
    scanning,
    enriching,
    hasBooks,
    onviewchange,
    onsortchange,
    onstatusfilter,
    oncollectionfilter,
    ontierfilter,
    onselect,
    onsearch,
    onaddfolder,
    onaddbook,
    onremovefolder,
    onrescan,
    onexport,
    onimport,
    onmanagecollections,
    onstats,
    ondrop,
    nowPlaying,
    onnowplaying,
  }: Props = $props();

  let dragOverCollection = $state<string | null>(null);

  function handleDragOver(e: DragEvent, colId: string) {
    e.preventDefault();
    dragOverCollection = colId;
  }

  function handleDragLeave() {
    dragOverCollection = null;
  }

  function handleDrop(e: DragEvent, colId: string) {
    e.preventDefault();
    dragOverCollection = null;
    const filePath = e.dataTransfer?.getData("text/plain");
    if (filePath) {
      ondrop(colId, filePath);
    }
  }

  let sortOpen = $state(false);
  let foldersOpen = $state(false);
  let searchInput = $state("");
  let searchVisible = $state(false);
  let searchEl: HTMLInputElement = $state(null!);
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (searchTimer) clearTimeout(searchTimer);
  });

  function handleSearchInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    searchInput = val;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => onsearch(val), 150);
  }

  function clearSearch() {
    searchInput = "";
    onsearch("");
    searchVisible = false;
  }

  function toggleSearch() {
    searchVisible = !searchVisible;
    if (searchVisible) {
      // Focus after DOM update
      setTimeout(() => searchEl?.focus(), 0);
    } else {
      clearSearch();
    }
  }

  export function focusSearch() {
    searchVisible = true;
    setTimeout(() => searchEl?.focus(), 0);
  }

  function folderDisplayName(path: string): string {
    const parts = path.split(/[/\\]/).filter(Boolean);
    return parts[parts.length - 1] || path;
  }

  const sortOptions: { value: SortBy; label: string }[] = [
    { value: "title", label: "Title" },
    { value: "author", label: "Author" },
    { value: "recent", label: "Recent" },
    { value: "status", label: "Status" },
    { value: "series", label: "Series" },
  ];

  const statusFilters: { value: FilterStatus; label: string }[] = [
    { value: "all", label: "All" },
    { value: "in_progress", label: "Reading" },
    { value: "finished", label: "Finished" },
    { value: "not_started", label: "New" },
  ];
</script>

<div class="toolbar">
  <div class="toolbar-top">
    <div class="toolbar-left">
      <h1>Library</h1>
      {#if nowPlaying}
        <button class="now-playing-pill" onclick={onnowplaying} title="Back to player">
          <span class="material-symbols-outlined np-icon">play_circle</span>
          <span class="hide-narrow">{nowPlaying}</span>
        </button>
      {/if}
    </div>
    <div class="toolbar-actions">
      {#if hasBooks}
        {#if searchVisible}
          <div class="search-box">
            <span class="material-symbols-outlined search-icon">search</span>
            <input
              bind:this={searchEl}
              type="text"
              class="search-input"
              placeholder="Search title or author..."
              value={searchInput}
              oninput={handleSearchInput}
              onkeydown={(e: KeyboardEvent) => { if (e.key === "Escape") clearSearch(); }}
            />
            {#if searchInput}
              <button class="search-clear" onclick={clearSearch}>
                <span class="material-symbols-outlined" style="font-size:1rem;">close</span>
              </button>
            {/if}
          </div>
        {:else}
          <button class="tool-btn" onclick={toggleSearch} title="Search (Ctrl+F)">
            <span class="material-symbols-outlined" style="font-size:1.15rem;">search</span>
          </button>
        {/if}
        <div class="sort-wrapper">
          <button class="tool-btn" onclick={() => (sortOpen = !sortOpen)}>
            <span class="material-symbols-outlined" style="font-size:1.15rem;">sort</span>
            <span class="hide-narrow">{sortOptions.find((s) => s.value === sortBy)?.label}</span>
          </button>
          {#if sortOpen}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="sort-menu" onclick={() => (sortOpen = false)}>
              {#each sortOptions as opt}
                <button
                  class="sort-item"
                  class:active={sortBy === opt.value}
                  onclick={() => onsortchange(opt.value)}
                >
                  {opt.label}
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <ViewToggle mode={viewMode} onchange={onviewchange} />
        <button class="tool-btn" onclick={onselect} title="Select books">
          <span class="material-symbols-outlined" style="font-size:1.15rem;">checklist</span>
        </button>
        <button class="tool-btn hide-narrow" onclick={onstats} title="Statistics">
          <span class="material-symbols-outlined" style="font-size:1.15rem;">bar_chart</span>
        </button>
        <button class="tool-btn hide-narrow" onclick={onexport} title="Export library">
          <span class="material-symbols-outlined" style="font-size:1.15rem;">download</span>
        </button>
        <button class="tool-btn hide-narrow" onclick={onimport} title="Import library">
          <span class="material-symbols-outlined" style="font-size:1.15rem;">upload</span>
        </button>
      {/if}
      <button class="tool-btn" onclick={onaddbook} title="Add a book manually (no file needed)">
        <span class="material-symbols-outlined" style="font-size:1.15rem;">book_2</span>
        <span class="hide-narrow">Add book</span>
      </button>
      <div class="sort-wrapper">
        <button class="btn-primary" onclick={() => { if (folders.length > 0) foldersOpen = !foldersOpen; else onaddfolder(); }}>
          <span class="material-symbols-outlined" style="font-size:1.15rem;">{folders.length > 0 ? "folder" : "add"}</span>
          <span class="hide-narrow">Folders</span>
        </button>
        {#if foldersOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="sort-menu folders-menu" onclick={(e: MouseEvent) => e.stopPropagation()}>
            {#each folders as folder}
              <div class="folder-item">
                <span class="folder-name" title={folder}>{folderDisplayName(folder)}</span>
                <button class="folder-remove" onclick={() => { onremovefolder(folder); foldersOpen = false; }} title="Remove folder">
                  <span class="material-symbols-outlined" style="font-size:0.85rem;">close</span>
                </button>
              </div>
            {/each}
            <button class="sort-item add-folder-item" onclick={() => { onaddfolder(); foldersOpen = false; }}>
              <span class="material-symbols-outlined" style="font-size:1rem;">add</span>
              Add Folder
            </button>
          </div>
        {/if}
      </div>
      {#if hasBooks}
        <button
          class="tool-btn"
          onclick={onrescan}
          disabled={scanning || enriching}
          title={scanning ? "Scanning..." : enriching ? "Loading metadata..." : "Rescan"}
        >
          <span class="material-symbols-outlined" style="font-size:1.15rem;">refresh</span>
        </button>
      {/if}
    </div>
  </div>

  {#if hasBooks}
    <div class="filter-row">
      {#each statusFilters as sf}
        <button
          class="filter-chip"
          class:active={filterStatus === sf.value}
          onclick={() => onstatusfilter(sf.value)}
        >
          {sf.label}
        </button>
      {/each}

      {#if tierFilterOptions.length > 0}
        <span class="filter-divider"></span>
        {#each tierFilterOptions as tier}
          <button
            class="filter-chip tier-chip"
            class:active={filterTier === tier.id}
            onclick={() => ontierfilter(filterTier === tier.id ? null : tier.id)}
            title={tier.name ? `${tier.label} — ${tier.name}` : tier.label}
          >
            <TierBadge label={tier.label} color={tier.color} size={1.1} />
          </button>
        {/each}
      {/if}

      {#if collections.length > 0}
        <span class="filter-divider"></span>
        {#each collections as col}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <button
            class="filter-chip"
            class:active={filterCollection === col.id}
            class:drop-target={dragOverCollection === col.id}
            onclick={() =>
              oncollectionfilter(filterCollection === col.id ? null : col.id)}
            ondragover={(e: DragEvent) => handleDragOver(e, col.id)}
            ondragleave={handleDragLeave}
            ondrop={(e: DragEvent) => handleDrop(e, col.id)}
          >
            <CollectionTag name={col.name} color={col.color} />
          </button>
        {/each}
      {/if}

      <button
        class="filter-chip manage-btn"
        onclick={onmanagecollections}
        title="Manage collections"
      >
        <span class="material-symbols-outlined" style="font-size:1rem;">settings</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .toolbar {
    margin-bottom: var(--spacing-md);
  }

  .toolbar-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-sm);
    gap: var(--spacing-sm);
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    min-width: 0;
  }

  .now-playing-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--color-primary);
    color: var(--color-on-primary);
    border: none;
    padding: 3px 10px;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    cursor: pointer;
    max-width: 150px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    transition: opacity 0.15s;
    flex-shrink: 1;
    min-width: 0;
  }

  .now-playing-pill:hover {
    opacity: 0.85;
  }

  .np-icon {
    font-size: 14px;
    font-variation-settings: "FILL" 1;
    flex-shrink: 0;
  }

  h1 {
    font-family: var(--font-headline);
    font-size: var(--font-size-display);
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--color-text);
    white-space: nowrap;
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  /* Hide text labels when window is narrow */
  @media (max-width: 560px) {
    :global(.hide-narrow) {
      display: none !important;
    }
    h1 {
      font-size: var(--font-size-lg);
    }
  }

  .tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text-variant);
    padding: 0.35rem 0.55rem;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .tool-btn:hover {
    background: var(--color-surface-highest);
  }

  .tool-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--gradient-primary);
    color: var(--color-on-primary);
    border: none;
    padding: 0.4rem 0.85rem;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .sort-wrapper {
    position: relative;
  }

  .sort-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: var(--color-surface-lowest);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-ambient);
    padding: 4px;
    z-index: 20;
    min-width: 120px;
  }

  .sort-item {
    display: block;
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

  .sort-item:hover {
    background: var(--color-surface-container);
  }

  .sort-item.active {
    color: var(--color-primary);
    font-weight: 600;
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: 2px;
    overflow-x: auto;
    padding: 3px;
    background: var(--color-surface-high);
    border-radius: var(--radius-xl);
    width: fit-content;
  }

  .filter-chip {
    display: inline-flex;
    align-items: center;
    background: none;
    border: none;
    color: var(--color-text-variant);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    padding: 4px 10px;
    border-radius: var(--radius-xl);
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
  }

  .filter-chip:hover {
    background: var(--color-surface-highest);
  }

  .filter-chip.drop-target {
    background: color-mix(in srgb, var(--color-primary) 25%, transparent);
    outline: 2px dashed var(--color-primary);
    outline-offset: -2px;
  }

  .filter-chip.active {
    background: var(--gradient-primary);
    color: var(--color-on-primary);
    box-shadow: 0 2px 6px color-mix(in srgb, var(--color-primary) 30%, transparent);
  }

  .filter-divider {
    width: 1px;
    height: 16px;
    background: var(--color-outline-variant);
    opacity: 0.4;
    margin: 0 4px;
    flex-shrink: 0;
  }

  .manage-btn {
    padding: 4px 6px;
  }

  .tier-chip {
    padding: 2px 4px;
  }

  .tier-chip.active {
    background: color-mix(in srgb, var(--color-primary) 20%, transparent);
    box-shadow: inset 0 0 0 1.5px var(--color-primary);
  }

  .search-box {
    display: flex;
    align-items: center;
    background: var(--color-surface-high);
    border-radius: var(--radius-xl);
    padding: 0 8px;
    gap: 4px;
    height: 30px;
    min-width: 140px;
    max-width: 220px;
    flex: 1;
  }

  .search-icon {
    font-size: 16px;
    color: var(--color-outline);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    font-family: var(--font-body);
    font-size: var(--font-size-xs);
    color: var(--color-text);
    min-width: 0;
  }

  .search-input::placeholder {
    color: var(--color-outline);
  }

  .search-clear {
    background: none;
    border: none;
    color: var(--color-outline);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    border-radius: 50%;
    flex-shrink: 0;
    transition: color 0.15s;
  }

  .search-clear:hover {
    color: var(--color-text);
  }

  .folders-menu {
    min-width: 180px;
    left: auto;
    right: 0;
  }

  .folder-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 5px 12px;
    border-radius: var(--radius-md);
  }

  .folder-name {
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    color: var(--color-text-variant);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .folder-remove {
    background: none;
    border: none;
    color: var(--color-outline);
    cursor: pointer;
    padding: 2px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    flex-shrink: 0;
    transition: color 0.15s;
  }

  .folder-remove:hover {
    color: var(--color-error);
  }

  .add-folder-item {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--color-primary);
    border-top: 1px solid var(--color-outline-variant);
    margin-top: 4px;
    padding-top: 8px;
  }
</style>
