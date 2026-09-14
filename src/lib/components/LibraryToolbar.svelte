<script lang="ts">
  /**
   * Library header (handoff 1a): title + count on the left; search, sort,
   * view toggle, an overflow menu and the one filled button on the right.
   *
   * The status / tier / collection chips are no longer here — they belong to
   * the "All books" block and live in LibraryFilters.svelte.
   */
  import { onDestroy } from "svelte";
  import type { SortBy } from "../types";
  import ViewToggle from "./ViewToggle.svelte";
  import { IconButton, Panel, Pill } from "./ui";

  interface Props {
    viewMode: "grid" | "list";
    sortBy: SortBy;
    bookCount: number;
    folders: string[];
    scanning: boolean;
    enriching: boolean;
    hasBooks: boolean;
    onviewchange: (m: "grid" | "list") => void;
    onsortchange: (s: SortBy) => void;
    onselect: () => void;
    onsearch: (q: string) => void;
    onaddfolder: () => void;
    onaddbook: () => void;
    onremovefolder: (folder: string) => void;
    onrescan: () => void;
    onexport: () => void;
    onimport: () => void;
    onstats: () => void;
    onmanagecollections: () => void;
  }

  let {
    viewMode,
    sortBy,
    bookCount,
    folders,
    scanning,
    enriching,
    hasBooks,
    onviewchange,
    onsortchange,
    onselect,
    onsearch,
    onaddfolder,
    onaddbook,
    onremovefolder,
    onrescan,
    onexport,
    onimport,
    onstats,
    onmanagecollections,
  }: Props = $props();

  const SORT_OPTIONS: { value: SortBy; label: string }[] = [
    { value: "title", label: "Title" },
    { value: "author", label: "Author" },
    { value: "recent", label: "Recent" },
    { value: "status", label: "Status" },
    { value: "series", label: "Series" },
  ];

  /** One panel at a time, closed by the Panel's own outside-click contract. */
  let menu = $state<"sort" | "folders" | "more" | null>(null);
  let searchInput = $state("");
  let searchEl = $state<HTMLInputElement | null>(null);
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (searchTimer) clearTimeout(searchTimer);
  });

  function handleSearchInput(e: Event) {
    searchInput = (e.currentTarget as HTMLInputElement).value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => onsearch(searchInput), 180);
  }

  function clearSearch() {
    searchInput = "";
    if (searchTimer) clearTimeout(searchTimer);
    onsearch("");
  }

  export function focusSearch() {
    searchEl?.focus();
    searchEl?.select();
  }

  function folderDisplayName(path: string): string {
    const parts = path.split(/[/\\]/).filter(Boolean);
    return parts[parts.length - 1] || path;
  }

  function run(fn: () => void) {
    menu = null;
    fn();
  }

  let sortLabel = $derived(SORT_OPTIONS.find((s) => s.value === sortBy)?.label ?? "Title");
  let busy = $derived(scanning || enriching);
</script>

<header class="lh">
  <div class="lh-left">
    <h1 class="lh-title">Library</h1>
    <span class="lh-count mono">{bookCount}</span>
    {#if busy}
      <span class="lh-busy mono">
        <span class="lh-spinner" aria-hidden="true"></span>
        {scanning ? "Scanning" : "Reading metadata"}
      </span>
    {/if}
  </div>

  <div class="lh-right">
    {#if hasBooks}
      <div class="lh-search">
        <span class="material-symbols-outlined lh-search-icon" aria-hidden="true">search</span>
        <input
          bind:this={searchEl}
          class="lh-search-input"
          type="text"
          placeholder="Title, author, series"
          aria-label="Search the library"
          value={searchInput}
          oninput={handleSearchInput}
          onkeydown={(e: KeyboardEvent) => {
            if (e.key === "Escape") clearSearch();
          }}
        />
        {#if searchInput}
          <button class="lh-search-clear" onclick={clearSearch} aria-label="Clear search">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        {/if}
      </div>

      <div class="lh-anchor">
        <Pill
          label={sortLabel}
          icon="expand_more"
          height="2.1rem"
          title="Sort by"
          ariaHasPopup
          ariaExpanded={menu === "sort"}
          onclick={() => (menu = menu === "sort" ? null : "sort")}
        />
        {#if menu === "sort"}
          <Panel
            label="Sort by"
            origin="top right"
            width="9.7rem"
            style="top: 2.5rem; right: 0;"
            onclose={() => (menu = null)}
          >
            {#each SORT_OPTIONS as opt, i (opt.value)}
              <button
                class="lh-item"
                class:selected={sortBy === opt.value}
                role="menuitem"
                style="animation-delay: calc(var(--motion-stagger) * {i});"
                onclick={() => run(() => onsortchange(opt.value))}
              >
                {opt.label}
                {#if sortBy === opt.value}
                  <span class="material-symbols-outlined lh-check" aria-hidden="true">check</span>
                {/if}
              </button>
            {/each}
          </Panel>
        {/if}
      </div>

      <ViewToggle mode={viewMode} onchange={onviewchange} />

      <IconButton icon="checklist" label="Select books" size="2.1rem" onclick={onselect} />

      <div class="lh-anchor">
        <IconButton
          icon="more_horiz"
          label="More library actions"
          size="2.1rem"
          selected={menu === "more"}
          onclick={() => (menu = menu === "more" ? null : "more")}
        />
        {#if menu === "more"}
          <Panel
            label="More library actions"
            origin="top right"
            width="12.5rem"
            style="top: 2.5rem; right: 0;"
            onclose={() => (menu = null)}
          >
            <button class="lh-item" role="menuitem" onclick={() => run(onstats)}>
              <span class="material-symbols-outlined" aria-hidden="true">bar_chart</span> Statistics
            </button>
            <button class="lh-item" role="menuitem" onclick={() => run(onmanagecollections)}>
              <span class="material-symbols-outlined" aria-hidden="true">checklist</span> Collections
            </button>
            <button class="lh-item" role="menuitem" onclick={() => run(onimport)}>
              <span class="material-symbols-outlined" aria-hidden="true">upload</span> Import library
            </button>
            <button class="lh-item" role="menuitem" onclick={() => run(onexport)}>
              <span class="material-symbols-outlined" aria-hidden="true">download</span> Export library
            </button>
            <button class="lh-item" role="menuitem" disabled={busy} onclick={() => run(onrescan)}>
              <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
              {busy ? "Scanning…" : "Rescan folders"}
            </button>
          </Panel>
        {/if}
      </div>
    {/if}

    <Pill icon="book_2" label="Add book" height="2.1rem" title="Log a book with no file" onclick={onaddbook} />

    <div class="lh-anchor">
      <button
        class="lh-primary"
        onclick={() => {
          if (folders.length > 0) menu = menu === "folders" ? null : "folders";
          else onaddfolder();
        }}
        aria-haspopup={folders.length > 0 ? "menu" : undefined}
        aria-expanded={folders.length > 0 ? menu === "folders" : undefined}
      >
        <span class="material-symbols-outlined" aria-hidden="true">
          {folders.length > 0 ? "folder" : "add"}
        </span>
        Folder
      </button>
      {#if menu === "folders"}
        <Panel
          label="Library folders"
          origin="top right"
          width="15.3rem"
          style="top: 2.5rem; right: 0;"
          onclose={() => (menu = null)}
        >
          {#each folders as folder (folder)}
            <div class="lh-folder">
              <span class="lh-folder-name" title={folder}>{folderDisplayName(folder)}</span>
              <IconButton
                icon="close"
                label="Remove {folderDisplayName(folder)}"
                size="1.6rem"
                bare
                onclick={() => run(() => onremovefolder(folder))}
              />
            </div>
          {/each}
          <button class="lh-item" role="menuitem" onclick={() => run(onaddfolder)}>
            <span class="material-symbols-outlined" aria-hidden="true">add</span> Add folder
          </button>
        </Panel>
      {/if}
    </div>
  </div>
</header>

<style>
  /* Handoff: the header clips and the search field shrinks; nothing in it
     wraps to a second line. The clipping is left to .app-content (overflow
     hidden at the window edge) rather than set here, because the sort,
     overflow and Folder menus are anchored inside this row and an overflow
     on it would clip them too. */
  .lh {
    display: flex;
    align-items: center;
    gap: 0.97rem;
    height: 3.75rem;
    padding: 0 1.4rem;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-outline-variant);
    background: var(--color-bg);
  }

  .lh-left {
    display: flex;
    align-items: baseline;
    gap: 0.55rem;
    min-width: 0;
  }

  .lh-title {
    margin: 0;
    font-family: var(--font-headline);
    font-weight: 500;
    font-size: 1.46rem;
    line-height: 1;
    color: var(--color-text);
  }

  .lh-count {
    font-size: 0.76rem;
    color: var(--color-outline);
  }

  .lh-busy {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    font-size: 0.72rem;
    color: var(--color-text-variant);
    white-space: nowrap;
  }

  .lh-spinner {
    width: 0.62rem;
    height: 0.62rem;
    border: 1.5px solid var(--color-outline-variant);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: ab-spin var(--motion-spin) linear infinite;
  }

  .lh-right {
    display: flex;
    align-items: center;
    gap: 0.42rem;
    margin-left: auto;
    min-width: 0;
  }

  .lh-anchor {
    position: relative;
  }

  .lh-search {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    /* Handoff: flex 0 1 186px, min 78px — gives way first */
    flex: 0 1 12.9rem;
    min-width: 5.4rem;
    height: 2.1rem;
    padding: 0 0.55rem;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-md);
  }

  .lh-search:focus-within {
    border-color: var(--color-outline);
  }

  .lh-search-icon {
    font-size: 1.05rem;
    color: var(--color-outline);
    flex-shrink: 0;
  }

  .lh-search-input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    outline: none;
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: 0.76rem;
    font-weight: 600;
  }

  .lh-search-input::placeholder {
    color: var(--color-outline);
    font-weight: 500;
  }

  .lh-search-clear {
    display: flex;
    padding: 0;
    background: none;
    border: none;
    color: var(--color-outline);
    cursor: pointer;
  }

  .lh-search-clear .material-symbols-outlined {
    font-size: 0.97rem;
  }

  .lh-primary {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    height: 2.1rem;
    padding: 0 0.83rem;
    background: var(--color-ink);
    color: var(--color-on-ink);
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-label);
    font-size: 0.76rem;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }

  .lh-primary .material-symbols-outlined {
    font-size: 1.05rem;
  }

  .lh-primary:hover {
    opacity: 0.88;
  }

  .lh-item {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    height: 2.1rem;
    padding: 0 0.7rem;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: 0.76rem;
    font-weight: 600;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
    animation: ab-rise var(--motion-rise) var(--ease-out) both;
  }

  .lh-item:hover:not(:disabled) {
    background: var(--color-surface-high);
  }

  .lh-item:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .lh-item.selected {
    font-weight: 700;
  }

  .lh-item .material-symbols-outlined {
    font-size: 1.05rem;
    color: var(--color-text-variant);
  }

  .lh-check {
    margin-left: auto;
    color: var(--color-primary) !important;
  }

  .lh-folder {
    display: flex;
    align-items: center;
    gap: 0.42rem;
    height: 2.1rem;
    padding: 0 0.28rem 0 0.7rem;
  }

  .lh-folder-name {
    flex: 1;
    min-width: 0;
    font-family: var(--font-label);
    font-size: 0.76rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
