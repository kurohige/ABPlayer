<script lang="ts">
  import { audioStore, seekToChapter } from "../stores/audioStore";
  import { formatTimeShort } from "../utils/format";
</script>

<aside class="chapter-list">
  <h2>Chapters</h2>
  <ul>
    {#each $audioStore.chapters as chapter, i (i)}
      <li>
        <button
          class="chapter-item"
          class:active={i === $audioStore.currentChapterIndex}
          onclick={() => seekToChapter(i)}
        >
          <span class="chapter-title">{chapter.title}</span>
          <span class="chapter-time"
            >{formatTimeShort(chapter.startTimeMs / 1000)}</span
          >
        </button>
      </li>
    {/each}
  </ul>
</aside>

<style>
  .chapter-list {
    width: 260px;
    min-width: 260px;
    background: var(--color-surface);
    overflow-y: auto;
    padding: var(--spacing-lg) var(--spacing-md);
  }

  h2 {
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
    font-weight: 500;
    margin-bottom: var(--spacing-md);
    color: var(--color-text);
  }

  ul {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .chapter-item {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    border: none;
    background: none;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    cursor: pointer;
    border-radius: var(--radius-md);
    text-align: left;
    gap: var(--spacing-sm);
    transition: background 0.15s, color 0.15s;
  }

  .chapter-item:hover {
    background: var(--color-surface-container);
  }

  .chapter-item.active {
    background: var(--color-surface-container);
  }

  .chapter-item.active .chapter-title {
    color: var(--color-primary);
    font-weight: 600;
  }

  .chapter-title {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chapter-time {
    font-family: var(--font-label);
    color: var(--color-outline);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    font-size: var(--font-size-xs);
  }
</style>
