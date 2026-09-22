<script lang="ts">
  /**
   * Combine the selected entries into one book: a title, the playing order
   * (natural file-name order to start with) and an optional cover. A cover
   * already on one of the files, or an image in their folder, is used
   * without asking; failing that the user may pick one now or leave it for
   * later (Edit → Change cover).
   */
  import type { BookMeta } from "../../types";
  import { combineBooks } from "../../stores/libraryStore";
  import { getDisplayCover, pickCoverArtData, userdataStore } from "../../stores/userdataStore";
  import { naturalCompare } from "../../utils/sort";
  import { fileStem, titleFromLabel } from "../../utils/grouping";
  import { formatTime } from "../../utils/format";
  import Modal from "../Modal.svelte";
  import { Cover, IconButton } from "../ui";

  interface Props {
    books: BookMeta[];
    onclose: () => void;
    /** Fired with the new book's filePath once combined. */
    oncombined: (filePath: string) => void;
  }

  let { books, onclose, oncombined }: Props = $props();

  interface Row {
    path: string;
    label: string;
    duration: number;
  }

  function baseName(path: string): string {
    return (path.split(/[/\\]/).pop() || path).replace(/\.[^.]+$/, "");
  }

  // The dialog is mounted per-open, so seeding once from the props is correct.
  // svelte-ignore state_referenced_locally
  let rows = $state<Row[]>(
    books
      .flatMap((b): Row[] =>
        b.tracks.length === 0
          ? [{ path: b.filePath, label: baseName(b.filePath), duration: b.duration }]
          : b.tracks.map((t) => ({ path: t.filePath, label: baseName(t.filePath), duration: t.duration })),
      )
      .sort((a, b) => naturalCompare(a.label, b.label)),
  );

  function suggestTitle(): string {
    const album = books.find((b) => b.album)?.album;
    if (album) return album;
    const grouped = books.find((b) => b.tracks.length > 0);
    if (grouped) return grouped.title;
    // svelte-ignore state_referenced_locally
    const stem = fileStem(rows[0]?.label ?? "");
    if (stem) return titleFromLabel(stem);
    const dir = books[0]?.filePath.split(/[/\\]/).slice(-2, -1)[0];
    return dir || books[0]?.title || "";
  }

  let title = $state(suggestTitle());
  let pickedCover = $state<string | null>(null);
  let busy = $state(false);

  let foundCover = $derived(
    books.map((b) => getDisplayCover(b, $userdataStore.books[b.filePath])).find(Boolean) ?? null,
  );
  let cover = $derived(pickedCover ?? foundCover);
  let total = $derived(rows.reduce((sum, r) => sum + r.duration, 0));

  function move(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    rows = next;
  }

  function sortByName() {
    rows = [...rows].sort((a, b) => naturalCompare(a.label, b.label));
  }

  async function chooseCover() {
    const data = await pickCoverArtData();
    if (data) pickedCover = data;
  }

  async function handleCombine() {
    if (busy || rows.length < 2 || !title.trim()) return;
    busy = true;
    try {
      const filePath = await combineBooks(
        books.map((b) => b.filePath),
        title,
        rows.map((r) => r.path),
        pickedCover,
      );
      if (filePath) oncombined(filePath);
      onclose();
    } finally {
      busy = false;
    }
  }
</script>

<Modal {onclose} label="Combine into one book">
  <div class="cd">
    <h3 class="cd-h">Combine into one book</h3>

    <div class="cd-top">
      <div class="cd-cover">
        <Cover src={cover} alt="" size="5.4rem" />
        <button class="cd-link" onclick={chooseCover}>{cover ? "Change cover" : "Add cover"}</button>
      </div>

      <div class="cd-fields">
        <label class="cd-label" for="cd-title">Book title</label>
        <input id="cd-title" class="cd-input" type="text" maxlength="200" bind:value={title} />
        <p class="cd-note">
          {#if cover}
            {rows.length} files · {formatTime(total)}
          {:else}
            {rows.length} files · {formatTime(total)}. These files carry no cover. An image in their
            folder (cover.jpg, folder.png…) is used if there is one; otherwise add one now, or
            later from Edit — it is optional.
          {/if}
        </p>
      </div>
    </div>

    <div class="cd-order-head">
      <span class="cd-label">Playing order</span>
      <button class="cd-link" onclick={sortByName}>Sort by file name</button>
    </div>

    <ol class="cd-list">
      {#each rows as r, i (r.path)}
        <li class="cd-row">
          <span class="cd-num mono">{i + 1}</span>
          <span class="cd-name" title={r.path}>{r.label}</span>
          {#if r.duration > 0}<span class="cd-dur mono">{formatTime(r.duration)}</span>{/if}
          <IconButton icon="arrow_upward" label="Move up" size="1.65rem" bare disabled={i === 0} onclick={() => move(i, -1)} />
          <IconButton icon="arrow_downward" label="Move down" size="1.65rem" bare disabled={i === rows.length - 1} onclick={() => move(i, 1)} />
        </li>
      {/each}
    </ol>

    <p class="cd-note">
      The files stay where they are. You can split the book again from its right-click menu.
    </p>

    <div class="cd-actions">
      <button class="btn-ghost" onclick={onclose}>Cancel</button>
      <button class="btn-primary" onclick={handleCombine} disabled={busy || rows.length < 2 || !title.trim()}>
        Combine {rows.length} files
      </button>
    </div>
  </div>
</Modal>

<style>
  .cd {
    display: flex;
    flex-direction: column;
    gap: 0.83rem;
    width: min(32rem, 86vw);
  }

  .cd-h {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.1rem;
    color: var(--color-text);
  }

  .cd-top {
    display: flex;
    gap: 0.97rem;
  }

  .cd-cover {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.28rem;
    flex-shrink: 0;
  }

  .cd-fields {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
  }

  .cd-label {
    font-family: var(--font-label);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-variant);
  }

  .cd-input {
    height: 2.2rem;
    padding: 0 0.7rem;
    background: var(--color-surface-high);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: 0.9rem;
  }

  .cd-input:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  .cd-note {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--color-text-variant);
  }

  .cd-link {
    padding: 0;
    background: none;
    border: none;
    color: var(--color-primary);
    font-family: var(--font-label);
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
  }

  .cd-link:hover {
    text-decoration: underline;
  }

  .cd-link:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .cd-order-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  .cd-list {
    margin: 0;
    padding: 0.28rem;
    list-style: none;
    max-height: 14rem;
    overflow-y: auto;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-md);
  }

  .cd-row {
    display: flex;
    align-items: center;
    gap: 0.42rem;
    min-height: 1.9rem;
    padding: 0 0.28rem;
    border-radius: var(--radius-sm);
  }

  .cd-row:hover {
    background: var(--color-surface-high);
  }

  .cd-num {
    width: 1.6rem;
    flex-shrink: 0;
    font-size: 0.68rem;
    color: var(--color-text-variant);
    text-align: right;
  }

  .cd-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-body);
    font-size: 0.8rem;
    color: var(--color-text);
  }

  .cd-dur {
    flex-shrink: 0;
    font-size: 0.68rem;
    color: var(--color-text-variant);
  }

  .cd-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.55rem;
  }

  .btn-primary,
  .btn-ghost {
    border: none;
    padding: 0.5rem 1.2rem;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary {
    background: var(--color-ink);
    color: var(--color-on-ink);
  }

  .btn-primary:hover:not(:disabled) { opacity: 0.9; }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-ghost {
    background: var(--color-surface-high);
    color: var(--color-text-variant);
  }

  .btn-ghost:hover { background: var(--color-surface-highest); }
</style>
