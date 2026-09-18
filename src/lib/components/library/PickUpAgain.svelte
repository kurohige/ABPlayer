<script lang="ts">
  /**
   * The narrow panel beside the continue card: the next few part-read books,
   * each a small cover, title, progress bar and mono time remaining.
   */
  import type { BookMeta, UserBookData } from "../../types";
  import { getDisplayTitle, getDisplayCover } from "../../stores/userdataStore";
  import { formatTimeShort } from "../../utils/format";
  import { Cover, Frame, SectionLabel } from "../ui";

  interface Props {
    books: BookMeta[];
    userData: Record<string, UserBookData>;
    positions: Record<string, { position: number; duration: number; lastPlayed: string }>;
    onopen: (book: BookMeta) => void;
  }

  let { books, userData, positions, onopen }: Props = $props();

  function pct(book: BookMeta): number {
    const p = positions[book.filePath];
    if (!p || p.duration <= 0) return 0;
    return Math.min(100, Math.max(0, (p.position / p.duration) * 100));
  }

  function remaining(book: BookMeta): string {
    const p = positions[book.filePath];
    if (!p || p.duration <= 0) return "";
    return `${formatTimeShort(Math.max(0, p.duration - p.position))} left`;
  }
</script>

<Frame class="pua" pad="0.97rem">
  <SectionLabel label="Pick up again" />
  <div class="pua-list">
    {#each books as book (book.filePath)}
      <button class="pua-row" onclick={() => onopen(book)} title={getDisplayTitle(book, userData[book.filePath])}>
        <Cover
          src={getDisplayCover(book, userData[book.filePath])}
          alt=""
          size="2.6rem"
          progress={pct(book)}
        />
        <span class="pua-text">
          <span class="pua-title">{getDisplayTitle(book, userData[book.filePath])}</span>
          <span class="pua-meta mono">{remaining(book)}</span>
        </span>
      </button>
    {/each}
    {#if books.length === 0}
      <p class="pua-empty">Nothing in progress yet.</p>
    {/if}
  </div>
</Frame>

<style>
  .pua-list {
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
    margin-top: 0.7rem;
  }

  .pua-row {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    width: 100%;
    padding: 0.28rem;
    background: none;
    border: none;
    border-radius: var(--radius-md);
    text-align: left;
    cursor: pointer;
    transition: background var(--motion-fast) ease;
  }

  .pua-row:hover {
    background: var(--color-surface-high);
  }

  .pua-row:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }

  .pua-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.14rem;
  }

  .pua-title {
    font-family: var(--font-headline);
    font-size: 0.87rem;
    font-weight: 500;
    line-height: 1.2;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pua-meta {
    font-size: 0.69rem;
    color: var(--color-outline);
  }

  .pua-empty {
    margin: 0.42rem 0 0;
    font-family: var(--font-body);
    font-size: 0.72rem;
    color: var(--color-outline);
  }
</style>
