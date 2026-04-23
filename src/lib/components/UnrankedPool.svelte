<script lang="ts">
  import type { BookMeta, UserBookData } from "../types";
  import MiniCover from "./MiniCover.svelte";

  interface Props {
    books: BookMeta[];
    userData: Record<string, UserBookData>;
    ondropbook: (filePath: string) => void;
  }

  let { books, userData, ondropbook }: Props = $props();

  let dragOver = $state(false);

  function handleDragOver(e: DragEvent) {
    if (e.dataTransfer?.types.includes("application/x-abplayer-book")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      dragOver = true;
    }
  }

  function handleDragLeave() { dragOver = false; }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const fp = e.dataTransfer?.getData("text/plain");
    if (fp) ondropbook(fp);
  }
</script>

<div class="pool">
  <div class="pool-heading">
    <span class="pool-label">Unranked pool · drag into a tier</span>
    <span class="pool-count">{books.length} book{books.length === 1 ? "" : "s"}</span>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="pool-well"
    class:drag-over={dragOver}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  >
    {#if books.length === 0}
      <div class="empty">All books assigned 🎉</div>
    {:else}
      {#each books as b (b.filePath)}
        <MiniCover book={b} userData={userData[b.filePath]} />
      {/each}
    {/if}
  </div>
</div>

<style>
  .pool {
    margin-top: 1rem;
  }

  .pool-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .pool-label {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-outline);
  }

  .pool-count {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-outline);
  }

  .pool-well {
    background: var(--color-surface);
    border: 1px dashed var(--color-outline-variant);
    border-radius: var(--radius-md);
    padding: 0.6rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    min-height: 5.2rem;
    transition: background 0.15s;
  }

  .pool-well.drag-over {
    background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface));
    border-color: var(--color-primary);
    border-style: solid;
  }

  .empty {
    width: 100%;
    text-align: center;
    padding: 0.8rem;
    font-family: var(--font-body);
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
    font-style: italic;
  }
</style>
