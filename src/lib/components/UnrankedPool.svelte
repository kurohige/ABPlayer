<script lang="ts">
  /**
   * The books not yet placed on the active list: a section label over a dashed
   * frame holding the same covers as the tier rows.
   */
  import type { BookMeta, UserBookData } from "../types";
  import MiniCover from "./MiniCover.svelte";
  import { bookDropZone } from "../utils/pointerDrag";
  import { SectionLabel } from "./ui";

  interface Props {
    books: BookMeta[];
    userData: Record<string, UserBookData>;
    justDropped?: string | null;
    /** Nothing is ranked yet: say how ranking works. */
    showHint?: boolean;
    ondropbook: (filePath: string) => void;
    oncontextbook?: (book: BookMeta, pos: { x: number; y: number }) => void;
  }

  let { books, userData, justDropped = null, showHint = false, ondropbook, oncontextbook }: Props = $props();

  /** A pool this long is worth searching. */
  const SEARCH_FROM = 13;

  let dragOver = $state(false);
  let query = $state("");

  let shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter((b) => {
      const ud = userData[b.filePath];
      const title = (ud?.titleOverride || b.title).toLowerCase();
      const author = (ud?.authorOverride || b.author).toLowerCase();
      return title.includes(q) || author.includes(q);
    });
  });
</script>

<div class="up">
  <SectionLabel
    label="Unranked pool"
    meta={`${books.length} book${books.length === 1 ? "" : "s"}`}
  />

  {#if showHint && books.length > 0}
    <p class="up-hint">
      <span class="material-symbols-outlined" aria-hidden="true">drag_pan</span>
      Every book in your library is here. Drag a cover up into a tier, or right-click it to pick one.
    </p>
  {/if}

  {#if books.length >= SEARCH_FROM || query}
    <input
      class="up-search"
      type="search"
      placeholder="Find a book in the pool…"
      aria-label="Find a book in the unranked pool"
      bind:value={query}
    />
  {/if}

  <div
    class="up-well"
    class:drag-over={dragOver}
    role="group"
    aria-label="Unranked books — drop zone"
    use:bookDropZone={{ onover: (over) => (dragOver = over), ondrop: (p) => ondropbook(p.filePath) }}
  >
    {#if books.length === 0}
      <span class="up-empty">Every book on this list is ranked.</span>
    {:else if shown.length === 0}
      <span class="up-empty">No unranked book matches "{query.trim()}".</span>
    {:else}
      {#each shown as b (b.filePath)}
        <MiniCover
          book={b}
          userData={userData[b.filePath]}
          justDropped={justDropped === b.filePath}
          oncontextmenu={oncontextbook}
        />
      {/each}
    {/if}
  </div>
</div>

<style>
  .up {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    margin-top: 0.42rem;
  }

  .up-well {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem;
    min-height: 5.4rem;
    padding: 0.83rem;
    border: 1px dashed var(--color-outline-variant);
    border-radius: var(--radius-lg);
    transition:
      background var(--motion-fast) ease,
      border-color var(--motion-fast) ease;
  }

  .up-well.drag-over {
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    border-color: var(--color-primary);
    border-style: solid;
  }

  .up-hint {
    display: flex;
    align-items: center;
    gap: 0.42rem;
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.76rem;
    line-height: 1.4;
    color: var(--color-text-variant);
  }

  .up-hint .material-symbols-outlined {
    font-size: 1.05rem;
    flex-shrink: 0;
  }

  .up-search {
    width: 100%;
    max-width: 18rem;
    height: 2.1rem;
    padding: 0 0.7rem;
    background: none;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: 0.76rem;
  }

  .up-search:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  .up-empty {
    margin: auto;
    font-family: var(--font-body);
    font-size: 0.72rem;
    font-style: italic;
    color: var(--color-text-variant);
  }
</style>
