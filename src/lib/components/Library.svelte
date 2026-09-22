<script lang="ts">
  /**
   * Library, "continue first" (handoff 1a): the lead row resumes the current
   * book in one click, everything else is the All-books grid beneath it.
   */
  import { onMount } from "svelte";
  import {
    libraryStore,
    addFolder,
    addFolderPaths,
    clearProgress,
    restoreProgress,
    rescan,
    loadLibraryFromStore,
    removeBook,
    removeFolder,
    splitBook,
    startWatching,
    stopWatching,
  } from "../stores/libraryStore";
  import {
    userdataStore,
    setPreference,
    sortAndFilterBooks,
    exportLibrary,
    importLibrary,
    addBooksToCollection,
    addTagToBooks,
    removeTagFromBooks,
    createCollection,
    setBooksStatus,
    setUserBookData,
    getDisplayTitle,
  } from "../stores/userdataStore";
  import {
    tierListsStore,
    defaultTierList,
    getBookTier,
    assignBooksToTier,
  } from "../stores/tierListStore";
  import { audioStore, loadBook } from "../stores/audioStore";
  import { getSavedPosition, savePosition } from "../stores/positionStore";
  import { showToast } from "../stores/toastStore";
  import type { BookMeta, BookStatus } from "../types";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import BookCard from "./BookCard.svelte";
  import BookListItem from "./BookListItem.svelte";
  import LibraryToolbar from "./LibraryToolbar.svelte";
  import BookEditDialog from "./BookEditDialog.svelte";
  import CollectionManager from "./CollectionManager.svelte";
  import BatchActionBar from "./BatchActionBar.svelte";
  import StatsPanel from "./StatsPanel.svelte";
  import Modal from "./Modal.svelte";
  import ContinueCard from "./library/ContinueCard.svelte";
  import PickUpAgain from "./library/PickUpAgain.svelte";
  import LibraryFilters from "./library/LibraryFilters.svelte";
  import TierDropStrip from "./library/TierDropStrip.svelte";
  import CombineDialog from "./library/CombineDialog.svelte";
  import BookDetails from "./library/BookDetails.svelte";
  import { SectionLabel, SkeletonTile } from "./ui";
  import { watchBelow } from "../utils/measure";
  import { groupBySeries, seriesMeta } from "../utils/series";

  interface Props {
    onnavtoplayer: () => void;
  }

  let { onnavtoplayer }: Props = $props();

  let toolbarRef: LibraryToolbar;

  /**
   * The handoff's continue row wraps: card `flex: 1 1 460px`, panel
   * `flex: 1 1 212px; min-width: 200px`, 18px gap — so the panel drops
   * under the card once the row is narrower than 460 + 200 + 18px, 47.1rem.
   * Here the row is also docked (sticky), so the wrap is measured instead of
   * left to flex: when it happens the panel leaves the docked row and
   * scrolls with the grid, keeping the docked part to one card. Measured in
   * rem because the root font scales with the window and the font-size
   * preference.
   */
  const LEAD_STACK_REM = 47.1;
  let leadStacked = $state(false);
  /** The grid has scrolled under the docked row, which then casts a shadow. */
  let bodyScrolled = $state(false);


  onMount(() => {
    loadLibraryFromStore().then(() => startWatching());

    function handleKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        toolbarRef?.focusSearch();
        return;
      }
      if (handleSelectionKeydown(e)) return;
      handleGridKeydown(e);
    }
    window.addEventListener("keydown", handleKeydown);

    // Folders dropped from the OS file explorer are added to the library
    const unlisten = getCurrentWindow().onDragDropEvent((event) => {
      const ev = event.payload;
      if (ev.type === "over") {
        dropActive = true;
      } else if (ev.type === "drop") {
        dropActive = false;
        const paths: string[] = ev.paths;
        if (paths.length > 0) addFolderPaths(paths);
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
  let detailsBook = $state<BookMeta | null>(null);
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

    const cards = document.querySelectorAll(".tile, .list-item");
    cards[focusedIndex]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // Progressive rendering
  const RENDER_BATCH = 40;
  let renderLimit = $state(RENDER_BATCH);

  /** Most recently played first — drives both the lead card and the panel. */
  let recentlyPlayed = $derived(
    $libraryStore.books
      .filter((b) => $libraryStore.positions[b.filePath]?.lastPlayed)
      .sort((a, b) => {
        const tA = $libraryStore.positions[a.filePath]?.lastPlayed || "";
        const tB = $libraryStore.positions[b.filePath]?.lastPlayed || "";
        return tB.localeCompare(tA);
      }),
  );

  /** The loaded book if there is one, else whatever was played last. */
  let continueBook = $derived($audioStore.currentBook ?? recentlyPlayed[0] ?? null);

  let pickUpAgain = $derived(
    recentlyPlayed
      .filter((b) => b.filePath !== continueBook?.filePath)
      .filter((b) => {
        const p = $libraryStore.positions[b.filePath];
        return p && p.duration > 0 && p.position / p.duration < 0.98;
      })
      .slice(0, 3),
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

  /** Sorting by Series switches the grid for one shelf per series. */
  let shelfView = $derived($userdataStore.preferences.sortBy === "series" && !searchQuery);
  let shelves = $derived(
    shelfView
      ? groupBySeries(displayBooks, $userdataStore.books, (b) =>
          getDisplayTitle(b, $userdataStore.books[b.filePath]),
        )
      : [],
  );

  let visibleBooks = $derived(displayBooks.slice(0, renderLimit));
  let hasMore = $derived(displayBooks.length > renderLimit);

  /** The lead row only makes sense on an unfiltered, unsearched library. */
  let showLead = $derived(
    continueBook !== null && !searchQuery && $userdataStore.preferences.filterStatus === "all",
  );

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
    await exportLibrary(
      $libraryStore.books,
      getSavedPosition,
      $tierListsStore.lists,
      $libraryStore.groups ?? [],
    );
  }

  async function handleImport() {
    try {
      const result = await importLibrary(savePosition);
      const touched =
        result.imported + result.skipped + result.tierListsImported + result.filelessRestored;
      if (touched === 0) return; // dialog cancelled or empty file

      const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
      const parts = [plural(result.imported, "book")];
      if (result.tierListsImported > 0) parts.push(plural(result.tierListsImported, "tier list"));
      if (result.filelessRestored > 0) parts.push(`${result.filelessRestored} logged`);
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
      showToast(`Imported ${parts.join(", ")}`, "download_done");

      if (result.imported > 0 || result.skipped > 0) {
        await rescan();
      }
    } catch (e) {
      console.error("Import failed:", e);
    }
  }

  /** Dragging one of the selected books carries the whole selection with it. */
  function draggedSet(filePath: string): string[] {
    return selectionMode && selectedBooks.has(filePath) ? [...selectedBooks] : [filePath];
  }

  async function handleCollectionDrop(collectionId: string, filePath: string) {
    await addBooksToCollection(draggedSet(filePath), collectionId);
  }

  async function handleTierDrop(filePath: string, tierId: string) {
    if (!batchTierList) return;
    const paths = draggedSet(filePath);
    await assignBooksToTier(batchTierList.id, paths, tierId);
    const tier = batchTierList.tiers.find((t) => t.id === tierId);
    showToast(`${countLabel(paths.length)} placed in ${tier?.label ?? "tier"}`, "military_tech");
  }

  let selectionMode = $state(false);
  let selectedBooks = $state<Set<string>>(new Set());
  /** Where a shift-click range starts: the last book clicked. */
  let selectionAnchor = $state<string | null>(null);
  let confirmBatchRemove = $state(false);

  /** Books in the order they are drawn, so a shift-click range matches what is on screen. */
  let selectionOrder = $derived(
    (shelfView ? shelves.flatMap((s) => s.books) : displayBooks).map((b) => b.filePath),
  );

  function toggleSelection(filePath: string, range = false) {
    const next = new Set(selectedBooks);
    const from = range && selectionAnchor ? selectionOrder.indexOf(selectionAnchor) : -1;
    const to = selectionOrder.indexOf(filePath);
    if (from >= 0 && to >= 0) {
      for (let i = Math.min(from, to); i <= Math.max(from, to); i++) next.add(selectionOrder[i]);
    } else if (next.has(filePath)) {
      next.delete(filePath);
    } else {
      next.add(filePath);
    }
    selectedBooks = next;
    selectionAnchor = filePath;
  }

  function selectAll() {
    selectedBooks = new Set(selectionOrder);
  }

  function clearSelection() {
    selectedBooks = new Set();
    selectionAnchor = null;
    selectionMode = false;
  }

  /** Ctrl+A selects everything shown, Escape leaves; true when the key was used. */
  function handleSelectionKeydown(e: KeyboardEvent): boolean {
    if (!selectionMode || combineOpen || confirmBatchRemove) return false;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return false;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      selectAll();
      return true;
    }
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      clearSelection();
      return true;
    }
    return false;
  }

  function countLabel(n: number): string {
    return `${n} book${n === 1 ? "" : "s"}`;
  }

  let selectionTags = $derived.by(() => {
    const seen = new Map<string, string>();
    for (const fp of selectedBooks) {
      for (const t of $userdataStore.books[fp]?.tags ?? []) {
        if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  });

  let knownTags = $derived.by(() => {
    const seen = new Map<string, string>();
    for (const ud of Object.values($userdataStore.books)) {
      for (const t of ud.tags ?? []) {
        if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  });

  /** Bulk tiering writes to the default list, or the only/first list when none is set. */
  let batchTierList = $derived($defaultTierList ?? $tierListsStore.lists[0] ?? null);

  async function batchRemove() {
    confirmBatchRemove = false;
    for (const fp of selectedBooks) {
      await removeBook(fp);
    }
    clearSelection();
  }

  const STATUS_LABEL: Record<BookStatus, string> = {
    not_started: "not started",
    in_progress: "reading",
    finished: "finished",
  };

  /**
   * One status for one or many books. "Not started" also forgets where the
   * book was, so no progress line is left and it begins at the start; the
   * toast can take that back. The book in the player keeps its place, since
   * the player is holding it.
   */
  async function applyStatus(filePaths: string[], status: BookStatus, what: string) {
    const before = filePaths.map((fp) => {
      const ud = $userdataStore.books[fp];
      return { fp, status: ud?.status ?? ("not_started" as BookStatus), dateFinished: ud?.dateFinished ?? null };
    });
    await setBooksStatus(filePaths, status);

    if (status !== "not_started") {
      showToast(`${what} marked ${STATUS_LABEL[status]}`, "flag");
      return;
    }
    const loaded = $audioStore.currentBook?.filePath;
    const cleared = await clearProgress(filePaths.filter((fp) => fp !== loaded));
    const hadProgress = Object.keys(cleared).length > 0;
    showToast(
      hadProgress ? `${what} marked not started, progress cleared` : `${what} marked not started`,
      "flag",
      hadProgress ? 7000 : 3000,
      hadProgress
        ? {
            label: "Undo",
            run: async () => {
              for (const b of before) {
                await setUserBookData(b.fp, { status: b.status, dateFinished: b.dateFinished });
              }
              await restoreProgress(cleared);
            },
          }
        : undefined,
    );
  }

  function handleStatus(book: BookMeta, status: BookStatus) {
    applyStatus([book.filePath], status, `"${getDisplayTitle(book, $userdataStore.books[book.filePath])}"`);
  }

  async function batchSetStatus(status: BookStatus) {
    await applyStatus([...selectedBooks], status, countLabel(selectedBooks.size));
  }

  async function batchAddToCollection(collectionId: string) {
    await addBooksToCollection(selectedBooks, collectionId);
    const name = $userdataStore.collections.find((c) => c.id === collectionId)?.name ?? "collection";
    showToast(`${countLabel(selectedBooks.size)} added to ${name}`, "collections_bookmark");
  }

  async function batchCreateCollection(name: string) {
    const id = await createCollection(name);
    await batchAddToCollection(id);
  }

  async function batchAddTag(tag: string) {
    await addTagToBooks(selectedBooks, tag);
    showToast(`Tagged ${countLabel(selectedBooks.size)} "${tag}"`, "sell");
  }

  async function batchRemoveTag(tag: string) {
    await removeTagFromBooks(selectedBooks, tag);
  }

  async function batchAssignTier(tierId: string | null) {
    if (!batchTierList) return;
    await assignBooksToTier(batchTierList.id, selectedBooks, tierId);
    const tier = batchTierList.tiers.find((t) => t.id === tierId);
    showToast(
      tier
        ? `${countLabel(selectedBooks.size)} placed in ${tier.label}`
        : `${countLabel(selectedBooks.size)} moved to the unranked pool`,
      "military_tech",
    );
  }

  // Combining files into one book
  let combineOpen = $state(false);
  let combineBooksList = $derived(
    $libraryStore.books.filter((b) => selectedBooks.has(b.filePath) && !b.fileless),
  );
  let canCombine = $derived(
    combineBooksList.length >= 2 && combineBooksList.length === selectedBooks.size,
  );

  let confirmSplit = $state<BookMeta | null>(null);

  async function handleConfirmSplit() {
    const book = confirmSplit;
    confirmSplit = null;
    if (!book) return;
    await splitBook(book.filePath);
    showToast(`Split into ${book.tracks.length} files`, "call_split");
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
      onnavtoplayer();
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
    bookCount={$libraryStore.books.length}
    folders={$libraryStore.folders}
    scanning={$libraryStore.scanning}
    enriching={$libraryStore.enriching}
    hasBooks={$libraryStore.books.length > 0}
    selecting={selectionMode}
    onviewchange={(m) => setPreference("viewMode", m)}
    onsortchange={(s) => setPreference("sortBy", s)}
    onselect={() => { if (selectionMode) clearSelection(); else selectionMode = true; }}
    onsearch={(q) => (searchQuery = q)}
    onaddfolder={addFolder}
    onaddbook={() => (addBookOpen = true)}
    onremovefolder={(f) => (confirmRemoveFolder = f)}
    onrescan={rescan}
    onexport={handleExport}
    onimport={handleImport}
    onstats={() => (showStats = true)}
    onmanagecollections={() => (showCollectionManager = true)}
  />

  <div
    class="lib-body"
    onscroll={(e) => (bodyScrolled = (e.currentTarget as HTMLElement).scrollTop > 4)}
  >
    {#if showLead && continueBook}
      {@const lead = continueBook}
      {#snippet pickUp()}
        <PickUpAgain
          books={pickUpAgain}
          userData={$userdataStore.books}
          positions={$libraryStore.positions}
          onopen={handlePlay}
        />
      {/snippet}

      <div
        class="lib-lead-wrap"
        class:scrolled={bodyScrolled}
        use:watchBelow={{ rem: LEAD_STACK_REM, onchange: (b) => (leadStacked = b) }}
      >
        <div class="lib-lead">
          <div class="lib-lead-main">
            <!-- On a fresh launch the card shows the last-played book from
                 history, not a loaded one, so opening must load it first;
                 handlePlay is a no-op load when it is already current. -->
            <ContinueCard
              book={lead}
              userData={$userdataStore.books[lead.filePath]}
              saved={$libraryStore.positions[lead.filePath]}
              onopen={() => handlePlay(lead)}
            />
          </div>
          {#if !leadStacked}
            <div class="lib-lead-side">{@render pickUp()}</div>
          {/if}
        </div>
      </div>
      {#if leadStacked}
        <div class="lib-pickup">{@render pickUp()}</div>
      {/if}
    {/if}

    {#if $libraryStore.books.length === 0 && !$libraryStore.scanning}
      <div class="empty">
        <div class="empty-illustration">
          <span class="material-symbols-outlined" style="font-size:2.5rem; color: var(--color-primary); font-variation-settings: 'FILL' 1;">headphones</span>
          <span class="material-symbols-outlined" style="font-size:3.6rem; color: var(--color-outline-variant); font-variation-settings: 'FILL' 0, 'wght' 200;">auto_stories</span>
        </div>
        <p class="empty-title">Your library is empty</p>
        <p class="empty-hint">Drop a folder here, or use the Folder button above</p>
      </div>
    {:else}
      <div class="lib-all">
        <SectionLabel
          label="All books"
          meta={`${displayBooks.length} of ${$libraryStore.books.length}`}
        />
        <LibraryFilters
          filterStatus={$userdataStore.preferences.filterStatus}
          filterCollection={$userdataStore.preferences.filterCollection}
          filterTier={$userdataStore.preferences.filterTier}
          {tierFilterOptions}
          collections={$userdataStore.collections}
          onstatusfilter={(s) => setPreference("filterStatus", s)}
          oncollectionfilter={(id) => setPreference("filterCollection", id)}
          ontierfilter={(id) => setPreference("filterTier", id)}
          ondrop={handleCollectionDrop}
        />

        {#if $libraryStore.scanning}
          <div class="grid">
            {#each Array(10) as _, i (i)}
              <SkeletonTile size="100%" />
            {/each}
            <SkeletonTile size="100%" queued label="more queued" />
          </div>
        {:else if displayBooks.length === 0}
          <div class="empty">
            <p class="empty-title">No books match this filter</p>
            <p class="empty-hint">Try a different filter, or clear the search</p>
          </div>
        {:else if shelfView}
          <div class="shelves">
            {#each shelves as shelf (shelf.series ?? "__loose")}
              <section class="shelf">
                <SectionLabel
                  label={shelf.series ?? "Not in a series"}
                  meta={seriesMeta(shelf)}
                />
                <div class="grid">
                  {#each shelf.books as book (book.filePath)}
                    <BookCard
                      {book}
                      userData={$userdataStore.books[book.filePath]}
                      collections={$userdataStore.collections}
                      position={$libraryStore.positions[book.filePath]}
                      tier={getBookTier($defaultTierList, book.filePath)}
                      seriesNumber={$userdataStore.books[book.filePath]?.seriesOrder ?? null}
                      nextUp={shelf.nextUp === book.filePath}
                      {selectionMode}
                      selected={selectedBooks.has(book.filePath)}
                      isPlaying={$audioStore.currentBook?.filePath === book.filePath}
                      onedit={openEdit}
                      onplay={handlePlay}
                      ondetails={(b) => (detailsBook = b)}
                      onstatus={handleStatus}
                      onremove={handleRemoveRequest}
                onsplit={(b) => (confirmSplit = b)}
                      ontoggleselect={(b, range) => toggleSelection(b.filePath, range)}
                    />
                  {/each}
                </div>
              </section>
            {/each}
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
                ondetails={(b) => (detailsBook = b)}
                onstatus={handleStatus}
                onremove={handleRemoveRequest}
                onsplit={(b) => (confirmSplit = b)}
                ontoggleselect={(b, range) => toggleSelection(b.filePath, range)}
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
                ondetails={(b) => (detailsBook = b)}
                onstatus={handleStatus}
                onremove={handleRemoveRequest}
                onsplit={(b) => (confirmSplit = b)}
                ontoggleselect={(b, range) => toggleSelection(b.filePath, range)}
              />
            {/each}
            {#if hasMore}
              <div use:loadMoreAction class="load-sentinel"></div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

{#if batchTierList && batchTierList.tiers.length > 0}
  <TierDropStrip list={batchTierList} ondrop={handleTierDrop} />
{/if}

{#if selectionMode}
  <BatchActionBar
    selectedCount={selectedBooks.size}
    totalCount={selectionOrder.length}
    collections={$userdataStore.collections}
    tierList={batchTierList}
    {selectionTags}
    {knownTags}
    {canCombine}
    onclear={clearSelection}
    onselectall={selectAll}
    onremove={() => (confirmBatchRemove = true)}
    onsetstatus={batchSetStatus}
    onaddtocollection={batchAddToCollection}
    oncreatecollection={batchCreateCollection}
    onaddtag={batchAddTag}
    onremovetag={batchRemoveTag}
    onassigntier={batchAssignTier}
    oncombine={() => (combineOpen = true)}
  />
{/if}

{#if combineOpen}
  <CombineDialog
    books={combineBooksList}
    onclose={() => (combineOpen = false)}
    oncombined={() => {
      showToast("Combined into one book", "merge");
      clearSelection();
    }}
  />
{/if}

{#if confirmSplit}
  <Modal onclose={() => (confirmSplit = null)} label="Split into files">
      <p class="confirm-title">Split into {confirmSplit.tracks.length} files?</p>
      <p class="confirm-text">
        "{getDisplayTitle(confirmSplit, $userdataStore.books[confirmSplit.filePath])}" becomes one library entry per file, and stays that way on rescans. Its rating, tags and listening position are not kept. You can combine the files again with Select books.
      </p>
      <div class="confirm-actions">
        <button class="btn-ghost" onclick={() => (confirmSplit = null)}>Cancel</button>
        <button class="btn-danger" onclick={handleConfirmSplit}>Split</button>
      </div>
  </Modal>
{/if}

{#if confirmBatchRemove}
  <Modal onclose={() => (confirmBatchRemove = false)} label="Remove from library">
      <p class="confirm-title">Remove {countLabel(selectedBooks.size)}?</p>
      <p class="confirm-text">
        They will be removed from your library and stay out of it on rescans. The files will not be deleted. Settings → Removed books brings them back.
      </p>
      <div class="confirm-actions">
        <button class="btn-ghost" onclick={() => (confirmBatchRemove = false)}>Cancel</button>
        <button class="btn-danger" onclick={batchRemove}>Remove</button>
      </div>
  </Modal>
{/if}

{#if detailsBook}
  <BookDetails
    book={detailsBook}
    collections={$userdataStore.collections}
    onclose={() => (detailsBook = null)}
    onplay={handlePlay}
    onedit={openEdit}
    onstatus={handleStatus}
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
        "{getDisplayTitle(confirmRemoveBook, $userdataStore.books[confirmRemoveBook.filePath])}" will be removed from your library and stay out of it on rescans. The file will not be deleted. Settings → Removed books brings it back.
      </p>
      <div class="confirm-actions">
        <button class="btn-ghost" onclick={() => (confirmRemoveBook = null)}>Cancel</button>
        <button class="btn-danger" onclick={handleConfirmRemove}>Remove</button>
      </div>
  </Modal>
{/if}

<style>
  .library {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--color-bg);
  }

  .library.drop-active::after {
    content: "Drop folders to add them to your library";
    position: absolute;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--color-bg) 88%, transparent);
    border: 2px dashed var(--color-primary);
    border-radius: var(--radius-lg);
    font-family: var(--font-label);
    font-size: var(--font-size-md);
    font-weight: 700;
    color: var(--color-text);
  }

  .lib-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1.4rem;
  }

  /* Docked: the lead row sticks to the top of the body while the grid
     scrolls under it. The negative margins let it span the body's padding
     so nothing shows beside it; the padding puts the content back. */
  .lib-lead-wrap {
    position: sticky;
    top: 0;
    z-index: 5;
    margin: -1.4rem -1.4rem 1.4rem;
    padding: 1.4rem 1.4rem 0.97rem;
    background: var(--color-bg);
    border-bottom: 1px solid var(--color-outline-variant);
    transition: box-shadow var(--motion-fast) ease;
  }

  /* Shadows are for overlays; a docked row over scrolled content is one */
  .lib-lead-wrap.scrolled {
    box-shadow: var(--shadow-panel);
  }

  .lib-lead {
    display: flex;
    align-items: stretch;
    gap: 1.25rem;
  }

  /* Handoff: flex 1 1 460px */
  .lib-lead-main {
    flex: 1 1 32rem;
    min-width: 0;
  }

  /* Handoff: flex 1 1 212px, min 200px, max 268px */
  .lib-lead-side {
    flex: 1 1 14.7rem;
    min-width: 13.9rem;
    max-width: 18.6rem;
  }

  /* The panel once it has left the docked row: the handoff keeps it at
     panel width under the card rather than stretching it */
  .lib-pickup {
    max-width: 18.6rem;
    margin-bottom: 1.4rem;
  }

  .lib-all {
    display: flex;
    flex-direction: column;
    gap: 0.83rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.7rem, 1fr));
    gap: 0.97rem;
  }

  .shelves {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .shelf {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
  }

  .load-sentinel {
    height: 1px;
    grid-column: 1 / -1;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.42rem;
    padding: 4rem 1.4rem;
    text-align: center;
  }

  .empty-illustration {
    display: flex;
    align-items: flex-end;
    gap: 0.42rem;
    margin-bottom: 0.7rem;
  }

  .empty-title {
    margin: 0;
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
    color: var(--color-text);
  }

  .empty-hint {
    margin: 0;
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    color: var(--color-text-variant);
  }

  .confirm-title {
    margin: 0 0 0.42rem;
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
    color: var(--color-text);
  }

  .confirm-text {
    margin: 0 0 1.1rem;
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: var(--color-text-variant);
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.55rem;
  }

  .btn-ghost,
  .btn-danger {
    height: 2.1rem;
    padding: 0 0.97rem;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-md);
    background: none;
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: 0.76rem;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-ghost:hover {
    background: var(--color-surface-high);
  }

  .btn-danger {
    background: var(--color-error);
    border-color: var(--color-error);
    color: #ffffff;
  }

  .btn-danger:hover {
    opacity: 0.9;
  }
</style>
