<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import {
    libraryStore,
    addFolder,
    rescan,
    loadLibraryFromStore,
    removeBook,
    removeFolder,
    scanFolders,
    startWatching,
    stopWatching,
  } from "../stores/libraryStore";
  import {
    userdataStore,
    setPreference,
    sortAndFilterBooks,
    exportLibrary,
    importLibrary,
    addBookToCollection,
    setBookStatus,
    getDisplayTitle,
    getDisplayCover,
  } from "../stores/userdataStore";
  import { tierListsStore, defaultTierList, getBookTier } from "../stores/tierListStore";
  import { audioStore, loadBook } from "../stores/audioStore";
  import { getSavedPosition, savePosition } from "../stores/positionStore";
  import type { BookMeta } from "../types";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import BookCard from "./BookCard.svelte";
  import BookListItem from "./BookListItem.svelte";
  import LibraryToolbar from "./LibraryToolbar.svelte";
  import BookEditDialog from "./BookEditDialog.svelte";
  import CollectionManager from "./CollectionManager.svelte";
  import BatchActionBar from "./BatchActionBar.svelte";
  import StatsPanel from "./StatsPanel.svelte";
  import Modal from "./Modal.svelte";

  interface Props {
    onnavtoplayer: () => void;
  }

  let { onnavtoplayer }: Props = $props();

  let toolbarRef: LibraryToolbar;

  onMount(() => {
    loadLibraryFromStore().then(() => startWatching());

    function handleKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        toolbarRef?.focusSearch();
        return;
      }
      handleGridKeydown(e);
    }
    window.addEventListener("keydown", handleKeydown);

    // Listen for file drag-and-drop from OS
    const unlisten = getCurrentWindow().onDragDropEvent((event) => {
      const ev = event.payload;
      if (ev.type === "over") {
        dropActive = true;
      } else if (ev.type === "drop") {
        dropActive = false;
        const paths: string[] = ev.paths;
        if (paths.length > 0) {
          const state = get(libraryStore);
          const newFolders = paths.filter((p: string) => !state.folders.includes(p));
          if (newFolders.length > 0) {
            const allFolders = [...state.folders, ...newFolders];
            libraryStore.update((s) => ({ ...s, folders: allFolders }));
            scanFolders(allFolders);
          }
        }
      } else {
        dropActive = false;
      }
    });

    return () => {
      window.removeEventListener("keydown", handleKeydown);
      unlisten.then((fn) => fn());
      stopWatching();
    };
  });

  let editingBook = $state<BookMeta | null>(null);
  let addBookOpen = $state(false);
  let showCollectionManager = $state(false);
  let showStats = $state(false);
  let searchQuery = $state("");
  let dropActive = $state(false);

  // Keyboard grid navigation
  let focusedIndex = $state(-1);

  function handleGridKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const cols = Math.floor((document.querySelector(".grid")?.clientWidth ?? 600) / 160) || 4;
    const len = visibleBooks.length;
    if (!len) return;

    if (e.key === "ArrowRight") { e.preventDefault(); focusedIndex = Math.min(focusedIndex + 1, len - 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); focusedIndex = Math.max(focusedIndex - 1, 0); }
    else if (e.key === "ArrowDown") { e.preventDefault(); focusedIndex = Math.min(focusedIndex + cols, len - 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusedIndex = Math.max(focusedIndex - cols, 0); }
    else if (e.key === "Enter" && focusedIndex >= 0) { e.preventDefault(); handlePlay(visibleBooks[focusedIndex]); }
    else return;

    // Scroll focused card into view
    const cards = document.querySelectorAll(".book-card, .list-item");
    cards[focusedIndex]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // Progressive rendering — defined after displayBooks
  const RENDER_BATCH = 40;
  let renderLimit = $state(RENDER_BATCH);

  let recentlyPlayed = $derived(
    $libraryStore.books
      .filter((b) => $libraryStore.positions[b.filePath]?.lastPlayed)
      .sort((a, b) => {
        const tA = $libraryStore.positions[a.filePath]?.lastPlayed || "";
        const tB = $libraryStore.positions[b.filePath]?.lastPlayed || "";
        return tB.localeCompare(tA);
      })
      .slice(0, 8),
  );

  let nowPlayingTitle = $derived(
    $audioStore.currentBook
      ? getDisplayTitle($audioStore.currentBook, $userdataStore.books[$audioStore.currentBook.filePath])
      : null,
  );

  let filteredBySearch = $derived(
    searchQuery
      ? $libraryStore.books.filter((b) => {
          const ud = $userdataStore.books[b.filePath];
          const t = (ud?.titleOverride || b.title).toLowerCase();
          const a = (ud?.authorOverride || b.author).toLowerCase();
          const q = searchQuery.toLowerCase();
          return t.includes(q) || a.includes(q);
        })
      : $libraryStore.books,
  );

  let filteredByTier = $derived(
    $userdataStore.preferences.filterTier && $defaultTierList
      ? filteredBySearch.filter(
          (b) =>
            $defaultTierList!.assignments[b.filePath] ===
            $userdataStore.preferences.filterTier,
        )
      : filteredBySearch,
  );

  let displayBooks = $derived(
    sortAndFilterBooks(
      filteredByTier,
      $userdataStore.books,
      $libraryStore.positions,
      $userdataStore.preferences,
    ),
  );

  let tierFilterOptions = $derived(
    $defaultTierList ? [...$defaultTierList.tiers].sort((a, b) => a.order - b.order) : [],
  );

  let visibleBooks = $derived(displayBooks.slice(0, renderLimit));
  let hasMore = $derived(displayBooks.length > renderLimit);

  // Reset render limit when filters/search change
  $effect(() => {
    void $userdataStore.preferences.filterStatus;
    void $userdataStore.preferences.filterCollection;
    void $userdataStore.preferences.filterTier;
    void $userdataStore.preferences.sortBy;
    void searchQuery;
    renderLimit = RENDER_BATCH;
  });

  function loadMoreAction(node: HTMLElement) {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        renderLimit = Math.min(renderLimit + RENDER_BATCH, displayBooks.length);
      }
    }, { rootMargin: "200px" });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  function openEdit(book: BookMeta) {
    editingBook = book;
  }

  async function handleExport() {
    await exportLibrary($libraryStore.books, getSavedPosition, $tierListsStore.lists);
  }

  async function handleImport() {
    try {
      const result = await importLibrary(savePosition);
      if (result.imported > 0 || result.skipped > 0) {
        // Trigger a rescan to pick up any new book data
        await rescan();
      }
    } catch (e) {
      console.error("Import failed:", e);
    }
  }

  function handleThemeToggle() {
    const next = $userdataStore.preferences.theme === "dark" ? "light" : "dark";
    setPreference("theme", next);
  }

  async function handleCollectionDrop(collectionId: string, filePath: string) {
    await addBookToCollection(filePath, collectionId);
  }

  let selectionMode = $state(false);
  let selectedBooks = $state<Set<string>>(new Set());

  function toggleSelection(filePath: string) {
    const next = new Set(selectedBooks);
    if (next.has(filePath)) next.delete(filePath);
    else next.add(filePath);
    selectedBooks = next;
    if (next.size === 0) selectionMode = false;
  }

  function clearSelection() {
    selectedBooks = new Set();
    selectionMode = false;
  }

  async function batchRemove() {
    for (const fp of selectedBooks) {
      await removeBook(fp);
    }
    clearSelection();
  }

  async function batchSetStatus(status: import("../types").BookStatus) {
    for (const fp of selectedBooks) {
      await setBookStatus(fp, status);
    }
    clearSelection();
  }

  async function batchAddToCollection(collectionId: string) {
    for (const fp of selectedBooks) {
      await addBookToCollection(fp, collectionId);
    }
    clearSelection();
  }

  let confirmRemoveBook = $state<BookMeta | null>(null);
  let confirmRemoveFolder = $state<string | null>(null);

  let folderBookCount = $derived(
    confirmRemoveFolder
      ? $libraryStore.books.filter(
          (b) => {
            const nf = confirmRemoveFolder!.replace(/[\\/]$/, "");
            return (
              b.filePath === nf ||
              b.filePath.startsWith(nf + "\\") ||
              b.filePath.startsWith(nf + "/") ||
              b.tracks.some((t) => t.filePath.startsWith(nf + "\\") || t.filePath.startsWith(nf + "/"))
            );
          },
        ).length
      : 0,
  );

  function handlePlay(book: BookMeta) {
    const current = $audioStore.currentBook;
    if (current && current.filePath === book.filePath) {
      onnavtoplayer();
    } else {
      loadBook(book);
    }
  }

  function handleRemoveRequest(book: BookMeta) {
    confirmRemoveBook = book;
  }

  async function handleConfirmRemove() {
    if (confirmRemoveBook) {
      await removeBook(confirmRemoveBook.filePath);
      confirmRemoveBook = null;
    }
  }
</script>

<div class="library" class:drop-active={dropActive}>
  <LibraryToolbar
    bind:this={toolbarRef}
    viewMode={$userdataStore.preferences.viewMode}
    sortBy={$userdataStore.preferences.sortBy}
    filterStatus={$userdataStore.preferences.filterStatus}
    filterCollection={$userdataStore.preferences.filterCollection}
    filterTier={$userdataStore.preferences.filterTier}
    tierFilterOptions={tierFilterOptions}
    collections={$userdataStore.collections}
    folders={$libraryStore.folders}
    scanning={$libraryStore.scanning}
    enriching={$libraryStore.enriching}
    hasBooks={$libraryStore.books.length > 0}
    onviewchange={(m) => setPreference("viewMode", m)}
    onsortchange={(s) => setPreference("sortBy", s)}
    onstatusfilter={(s) => setPreference("filterStatus", s)}
    oncollectionfilter={(id) => setPreference("filterCollection", id)}
    ontierfilter={(id) => setPreference("filterTier", id)}
    onselect={() => { selectionMode = !selectionMode; if (!selectionMode) clearSelection(); }}
    onsearch={(q) => (searchQuery = q)}
    onaddfolder={addFolder}
    onaddbook={() => (addBookOpen = true)}
    onremovefolder={(f) => (confirmRemoveFolder = f)}
    onrescan={rescan}
    onexport={handleExport}
    onimport={handleImport}
    onstats={() => (showStats = true)}
    onmanagecollections={() => (showCollectionManager = true)}
    ondrop={handleCollectionDrop}
    nowPlaying={nowPlayingTitle}
    onnowplaying={onnavtoplayer}
  />

  {#if recentlyPlayed.length > 0 && !searchQuery}
    <div class="recent-section">
      <h2 class="recent-heading">Recently Played</h2>
      <div class="recent-row">
        {#each recentlyPlayed as book (book.filePath)}
          <button class="recent-item" onclick={() => handlePlay(book)}>
            <div class="recent-cover">
              {#if getDisplayCover(book, $userdataStore.books[book.filePath])}
                <img src={getDisplayCover(book, $userdataStore.books[book.filePath])} alt="" />
              {:else}
                <span class="material-symbols-outlined recent-ph">auto_stories</span>
              {/if}
            </div>
            <span class="recent-title">
              {getDisplayTitle(book, $userdataStore.books[book.filePath])}
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if $libraryStore.books.length === 0 && !$libraryStore.scanning}
    <div class="empty">
      <div class="empty-illustration">
        <span class="material-symbols-outlined" style="font-size:36px; color: var(--color-primary); font-variation-settings: 'FILL' 1;">headphones</span>
        <span class="material-symbols-outlined" style="font-size:52px; color: var(--color-outline-variant); font-variation-settings: 'FILL' 0, 'wght' 200;">auto_stories</span>
      </div>
      <p class="empty-title">Your library is empty</p>
      <p class="empty-hint">Drag a folder here or click "Folders" to add audiobooks</p>
    </div>
  {:else if $libraryStore.scanning}
    <div class="grid">
      {#each Array(8) as _}
        <div class="skeleton-card">
          <div class="skeleton-cover pulse"></div>
          <div class="skeleton-info">
            <div class="skeleton-line w70 pulse"></div>
            <div class="skeleton-line w50 pulse"></div>
          </div>
        </div>
      {/each}
    </div>
  {:else if displayBooks.length === 0}
    <div class="empty">
      <p class="empty-title">No books match this filter</p>
      <p class="empty-hint">Try changing the filter or adding more books</p>
    </div>
  {:else if $userdataStore.preferences.viewMode === "grid"}
    <div class="grid">
      {#each visibleBooks as book, i (book.filePath)}
        <BookCard
          {book}
          userData={$userdataStore.books[book.filePath]}
          collections={$userdataStore.collections}
          position={$libraryStore.positions[book.filePath]}
          tier={getBookTier($defaultTierList, book.filePath)}
          {selectionMode}
          selected={selectedBooks.has(book.filePath)}
          isPlaying={$audioStore.currentBook?.filePath === book.filePath}
          focused={focusedIndex === i}
          onedit={openEdit}
          onplay={handlePlay}
          onremove={handleRemoveRequest}
          ontoggleselect={(b) => toggleSelection(b.filePath)}
        />
      {/each}
      {#if hasMore}
        <div use:loadMoreAction class="load-sentinel"></div>
      {/if}
    </div>
  {:else}
    <div class="list">
      {#each visibleBooks as book (book.filePath)}
        <BookListItem
          {book}
          userData={$userdataStore.books[book.filePath]}
          collections={$userdataStore.collections}
          position={$libraryStore.positions[book.filePath]}
          {selectionMode}
          selected={selectedBooks.has(book.filePath)}
          onedit={openEdit}
          onplay={handlePlay}
          onremove={handleRemoveRequest}
          ontoggleselect={(b) => toggleSelection(b.filePath)}
        />
      {/each}
      {#if hasMore}
        <div use:loadMoreAction class="load-sentinel"></div>
      {/if}
    </div>
  {/if}
</div>

{#if selectedBooks.size > 0}
  <BatchActionBar
    selectedCount={selectedBooks.size}
    collections={$userdataStore.collections}
    onclear={clearSelection}
    onremove={batchRemove}
    onsetstatus={batchSetStatus}
    onaddtocollection={batchAddToCollection}
  />
{/if}

{#if editingBook}
  <BookEditDialog
    mode="edit"
    book={editingBook}
    collections={$userdataStore.collections}
    existingSeriesNames={[...new Set(
      Object.values($userdataStore.books)
        .map((ud) => ud.series)
        .filter((s): s is string => !!s),
    )]}
    onclose={() => (editingBook = null)}
  />
{/if}

{#if addBookOpen}
  <BookEditDialog
    mode="create"
    collections={$userdataStore.collections}
    existingSeriesNames={[...new Set(
      Object.values($userdataStore.books)
        .map((ud) => ud.series)
        .filter((s): s is string => !!s),
    )]}
    onclose={() => (addBookOpen = false)}
  />
{/if}

{#if showCollectionManager}
  <CollectionManager
    collections={$userdataStore.collections}
    onclose={() => (showCollectionManager = false)}
  />
{/if}

{#if showStats}
  <StatsPanel onclose={() => (showStats = false)} />
{/if}

{#if confirmRemoveFolder}
  <Modal onclose={() => (confirmRemoveFolder = null)} label="Remove folder">
      <p class="confirm-title">Remove folder?</p>
      <p class="confirm-text">
        This will remove {folderBookCount} book{folderBookCount !== 1 ? "s" : ""} from your library. Files will not be deleted from disk.
      </p>
      <div class="confirm-actions">
        <button class="btn-ghost" onclick={() => (confirmRemoveFolder = null)}>Cancel</button>
        <button class="btn-danger" onclick={() => { removeFolder(confirmRemoveFolder!); confirmRemoveFolder = null; }}>Remove</button>
      </div>
  </Modal>
{/if}

{#if confirmRemoveBook}
  <Modal onclose={() => (confirmRemoveBook = null)} label="Remove from library">
      <p class="confirm-title">Remove from library?</p>
      <p class="confirm-text">
        "{getDisplayTitle(confirmRemoveBook, $userdataStore.books[confirmRemoveBook.filePath])}" will be removed from your library. The file will not be deleted.
      </p>
      <div class="confirm-actions">
        <button class="btn-ghost" onclick={() => (confirmRemoveBook = null)}>Cancel</button>
        <button class="btn-danger" onclick={handleConfirmRemove}>Remove</button>
      </div>
  </Modal>
{/if}

<style>
  .library {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-lg) var(--spacing-xl) var(--spacing-lg) var(--spacing-lg);
    background: var(--color-bg);
    position: relative;
  }

  .library.drop-active {
    outline: 3px dashed var(--color-primary);
    outline-offset: -6px;
    background: color-mix(in srgb, var(--color-primary) 5%, var(--color-bg));
  }

  .library.drop-active::after {
    content: "Drop folders here to add to library";
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
    color: var(--color-primary);
    background: color-mix(in srgb, var(--color-bg) 80%, transparent);
    z-index: 10;
    pointer-events: none;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 50vh;
    gap: var(--spacing-sm);
  }

  .empty-illustration {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-md);
    opacity: 0.8;
  }

  .empty-title {
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
    color: var(--color-text-variant);
  }

  .empty-hint {
    font-size: var(--font-size-sm);
    color: var(--color-outline);
  }

  .recent-section {
    margin-bottom: var(--spacing-lg);
  }

  .recent-heading {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-variant);
    margin-bottom: var(--spacing-sm);
  }

  .recent-row {
    display: flex;
    gap: var(--spacing-md);
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    padding-bottom: var(--spacing-sm);
  }

  .recent-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
    scroll-snap-align: start;
    flex-shrink: 0;
    width: clamp(60px, 12vw, 90px);
    transition: opacity 0.15s;
  }

  .recent-item:hover {
    opacity: 0.8;
  }

  .recent-cover {
    width: clamp(56px, 11vw, 80px);
    height: clamp(56px, 11vw, 80px);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--color-surface-high);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-card);
  }

  .recent-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .recent-ph {
    font-size: 24px;
    color: var(--color-outline-variant);
  }

  .recent-title {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-text);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(clamp(100px, 20vw, 160px), 1fr));
    gap: var(--spacing-md);
  }

  .list {
    display: flex;
    flex-direction: column;
  }

  .load-sentinel {
    height: 1px;
    width: 100%;
    grid-column: 1 / -1;
  }

  .skeleton-card {
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--color-surface-lowest);
    box-shadow: var(--shadow-card);
  }

  .skeleton-cover {
    aspect-ratio: 1;
    background: var(--color-surface-high);
  }

  .skeleton-info {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .skeleton-line {
    height: 10px;
    border-radius: 4px;
    background: var(--color-surface-high);
  }

  .skeleton-line.w70 { width: 70%; }
  .skeleton-line.w50 { width: 50%; }

  .pulse {
    background: linear-gradient(
      90deg,
      var(--color-surface-high) 25%,
      var(--color-surface-highest) 50%,
      var(--color-surface-high) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite linear;
  }

  @keyframes shimmer {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
  }

  .confirm-title {
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

  .btn-ghost {
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text-variant);
    padding: 8px 16px;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .btn-ghost:hover {
    background: var(--color-surface-highest);
  }

  .btn-danger {
    background: var(--color-error);
    border: none;
    color: #fff;
    padding: 8px 16px;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .btn-danger:hover {
    opacity: 0.9;
  }
</style>
