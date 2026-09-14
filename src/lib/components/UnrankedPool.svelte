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
    ondropbook: (filePath: string) => void;
    oncontextbook?: (book: BookMeta, pos: { x: number; y: number }) => void;
  }

  let { books, userData, justDropped = null, ondropbook, oncontextbook }: Props = $props();

  let dragOver = $state(false);
</script>

<div class="up">
  <SectionLabel
    label="Unranked pool"
    meta={`${books.length} book${books.length === 1 ? "" : "s"}`}
  />

  <div
    class="up-well"
    class:drag-over={dragOver}
    role="group"
    aria-label="Unranked books — drop zone"
    use:bookDropZone={{ onover: (over) => (dragOver = over), ondrop: (p) => ondropbook(p.filePath) }}
  >
    {#if books.length === 0}
      <span class="up-empty">Every book on this list is ranked.</span>
    {:else}
      {#each books as b (b.filePath)}
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

  .up-empty {
    margin: auto;
    font-family: var(--font-body);
    font-size: 0.72rem;
    font-style: italic;
    color: var(--color-text-variant);
  }
</style>
