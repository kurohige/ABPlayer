<script lang="ts">
  import { audioStore, seek, seekToChapter, goToTrack } from "../../stores/audioStore";
  import { bookmarkStore, removeBookmark } from "../../stores/bookmarkStore";
  import { formatTimeShort } from "../../utils/format";
  import { motionReduced } from "../../utils/motion";
  import type { BookMeta } from "../../types";

  /** Chapters (or tracks for multi-file books) + the bookmarks list below. */
  interface Props {
    book: BookMeta;
    /** Hide chapters already listened to (handoff 1c's toolbar pill). */
    unplayedOnly?: boolean;
  }

  let { book, unplayedOnly = false }: Props = $props();

  /** Indices kept when the filter is on: the current chapter and everything after. */
  let visibleChapterIndices = $derived(
    $audioStore.chapters
      .map((_, i) => i)
      .filter((i) => !unplayedOnly || i >= $audioStore.currentChapterIndex),
  );

  let isMultiFile = $derived(book.tracks.length > 1);
  let bookmarks = $derived($bookmarkStore[book.filePath] || []);
  let hasList = $derived(isMultiFile || $audioStore.chapters.length > 0);

  let paneEl = $state<HTMLDivElement | null>(null);
  let activeIndex = $derived(
    isMultiFile ? $audioStore.currentTrackIndex : $audioStore.currentChapterIndex,
  );
  /** "<filePath>:<index>" of the row last scrolled to, so it happens once. */
  let scrolledKey = "";

  // Opening this pane on chapter 140 of 179 should land on chapter 140, and a
  // chapter that turns over while the pane is open should stay in view. The
  // row is looked up rather than bound because only the active one matters.
  $effect(() => {
    const pane = paneEl;
    const key = `${book.filePath}:${activeIndex}`;
    const rows = isMultiFile ? book.tracks.length : visibleChapterIndices.length;
    if (!pane || rows === 0 || key === scrolledKey) return;

    const row = pane.querySelector<HTMLElement>(".pv-chapter-row.active");
    if (!row) return;

    const sameBook = scrolledKey.startsWith(`${book.filePath}:`);
    scrolledKey = key;
    row.scrollIntoView({
      block: sameBook ? "nearest" : "center",
      behavior: motionReduced() ? "auto" : "smooth",
    });
  });

  function seekToBookmark(position: number, trackIndex: number) {
    if (isMultiFile && trackIndex !== $audioStore.currentTrackIndex) {
      goToTrack(trackIndex);
      const audio = document.querySelector("audio");
      if (audio) {
        audio.addEventListener("loadedmetadata", () => {
          seek(position);
        }, { once: true });
      }
    } else {
      seek(position);
    }
  }
</script>

<div class="pv-chapters-pane" bind:this={paneEl}>
  {#if isMultiFile}
    <ul class="pv-chapter-list">
      {#each book.tracks as track, i (i)}
        {@const played = i < $audioStore.currentTrackIndex}
        {@const active = i === $audioStore.currentTrackIndex}
        <li>
          <button
            class="pv-chapter-row"
            class:played
            class:active
            onclick={() => goToTrack(i)}
          >
            <span class="pv-chapter-marker mono">
              {played ? "✓" : active ? "▸" : String(i + 1).padStart(2, "0")}
            </span>
            <span class="pv-chapter-title">{track.title}</span>
            {#if track.duration > 0}
              <span class="pv-chapter-time mono">{formatTimeShort(track.duration)}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {:else if $audioStore.chapters.length > 0}
    <ul class="pv-chapter-list">
      {#each visibleChapterIndices as i (i)}
        {@const chapter = $audioStore.chapters[i]}
        {@const played = i < $audioStore.currentChapterIndex}
        {@const active = i === $audioStore.currentChapterIndex}
        <li>
          <button
            class="pv-chapter-row"
            class:played
            class:active
            onclick={() => seekToChapter(i)}
          >
            <span class="pv-chapter-marker mono">
              {played ? "✓" : active ? "▸" : String(i + 1).padStart(2, "0")}
            </span>
            <span class="pv-chapter-title">{chapter.title}</span>
            <span class="pv-chapter-time mono">{formatTimeShort(chapter.startTimeMs / 1000)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if !hasList}
    <p class="pv-chapters-empty">
      This file carries no chapter marks. Seek with the waveform in the player,
      and drop a bookmark to come back to a spot.
    </p>
  {/if}

  {#if bookmarks.length > 0}
    <h3 class="pv-section-heading">Bookmarks</h3>
    <ul class="pv-chapter-list">
      {#each bookmarks as bm (bm.id)}
        <li class="pv-chapter-row-wrap">
          <button
            class="pv-chapter-row"
            onclick={() => seekToBookmark(bm.position, bm.trackIndex)}
          >
            <span class="material-symbols-outlined pv-chapter-marker">bookmark</span>
            <span class="pv-chapter-title">{bm.name}</span>
            <span class="pv-chapter-time mono">{formatTimeShort(bm.position)}</span>
          </button>
          <button
            class="pv-chapter-remove"
            onclick={() => removeBookmark(book.filePath, bm.id)}
            title="Remove bookmark"
            aria-label="Remove bookmark"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .pv-chapters-pane {
    padding: 0.4rem 0.9rem 1rem;
  }

  .pv-chapters-empty {
    margin: 0.7rem 0.25rem;
    max-width: 26rem;
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: var(--color-text-variant);
  }

  .pv-section-heading {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-outline);
    margin: 1rem 0.25rem 0.4rem;
  }

  .pv-chapter-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .pv-chapter-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.55rem 0.75rem;
    background: transparent;
    border: none;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    text-align: left;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .pv-chapter-row:hover {
    background: var(--color-surface);
  }

  .pv-chapter-row.played {
    color: var(--color-text-variant);
  }

  .pv-chapter-row.active {
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    color: var(--color-primary);
    font-weight: 600;
  }

  .pv-chapter-marker {
    font-size: 0.65rem;
    color: var(--color-outline);
    width: 1.35rem;
    text-align: center;
    flex-shrink: 0;
  }

  .pv-chapter-row.active .pv-chapter-marker { color: var(--color-primary); }

  .pv-chapter-marker.material-symbols-outlined {
    font-size: 0.9rem;
  }

  .pv-chapter-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pv-chapter-time {
    font-size: 0.7rem;
    color: var(--color-text-variant);
    flex-shrink: 0;
  }

  .pv-chapter-row.active .pv-chapter-time { color: var(--color-primary); }

  .pv-chapter-row-wrap {
    display: flex;
    align-items: center;
    gap: 0.15rem;
  }

  .pv-chapter-row-wrap .pv-chapter-row { flex: 1; }

  .pv-chapter-remove {
    width: 1.5rem;
    height: 1.5rem;
    background: none;
    border: none;
    color: var(--color-outline);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s, background 0.15s;
  }

  .pv-chapter-row-wrap:hover .pv-chapter-remove,
  .pv-chapter-remove:focus-visible { opacity: 1; }

  .pv-chapter-remove:hover {
    color: var(--color-error);
    background: color-mix(in srgb, var(--color-error) 10%, transparent);
  }
  .pv-chapter-remove .material-symbols-outlined { font-size: 0.85rem; }
</style>
