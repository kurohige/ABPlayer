<script lang="ts">
  import type { BookMeta, BookStatus, Collection, UserBookData } from "../types";
  import {
    getUserBookData,
    setUserBookData,
    resetUserBookData,
    setBookStatus,
    pickCoverArt,
    addBookToCollection,
    removeBookFromCollection,
    getDisplayCover,
  } from "../stores/userdataStore";
  import Modal from "./Modal.svelte";
  import StatusBadge from "./StatusBadge.svelte";
  import CollectionTag from "./CollectionTag.svelte";

  interface Props {
    book: BookMeta;
    collections: Collection[];
    existingSeriesNames?: string[];
    onclose: () => void;
  }

  let { book, collections, existingSeriesNames = [], onclose }: Props = $props();

  // svelte-ignore state_referenced_locally — book is stable for the lifetime of this dialog
  const initialData = getUserBookData(book.filePath);
  let userData = $state<UserBookData>(initialData);
  let titleInput = $state(initialData.titleOverride || "");
  let authorInput = $state(initialData.authorOverride || "");
  let genreInput = $state(initialData.genre || "");
  let seriesInput = $state(initialData.series || "");
  let seriesOrderInput = $state<number | "">(initialData.seriesOrder ?? "");
  let status = $state<BookStatus>(initialData.status);
  let bookCollectionIds = $state<string[]>([...initialData.collections]);

  const GENRE_SUGGESTIONS = [
    "Fiction", "Non-Fiction", "Sci-Fi", "Fantasy", "Mystery",
    "Romance", "Horror", "Biography", "Self-Help", "History",
    "Business", "Thriller", "Young Adult", "Literary Fiction",
  ];
  let coverPreview = $derived(
    userData.coverArtOverride || book.coverArt,
  );

  // Refresh userData when coverArt changes (pickCoverArt updates the store)
  function refreshUserData() {
    userData = getUserBookData(book.filePath);
  }

  const MAX_INPUT_LENGTH = 500;

  function sanitizeText(value: string): string | null {
    const trimmed = value.trim().slice(0, MAX_INPUT_LENGTH);
    return trimmed || null;
  }

  function parseSeriesOrder(value: number | ""): number | null {
    if (value === "" || typeof value !== "number") return null;
    const n = Math.floor(value);
    if (!Number.isFinite(n) || n < 1) return null;
    return n;
  }

  async function handleSave() {
    await setUserBookData(book.filePath, {
      titleOverride: sanitizeText(titleInput),
      authorOverride: sanitizeText(authorInput),
      genre: sanitizeText(genreInput),
      series: sanitizeText(seriesInput),
      seriesOrder: seriesInput.trim() ? parseSeriesOrder(seriesOrderInput) : null,
      collections: bookCollectionIds,
      status,
      dateFinished: status === "finished" ? (userData.dateFinished || new Date().toISOString()) : null,
    });
    onclose();
  }

  async function handleReset() {
    await resetUserBookData(book.filePath);
    onclose();
  }

  async function handleChangeCover() {
    await pickCoverArt(book.filePath);
    refreshUserData();
  }

  function toggleCollection(id: string) {
    if (bookCollectionIds.includes(id)) {
      bookCollectionIds = bookCollectionIds.filter((c) => c !== id);
    } else {
      bookCollectionIds = [...bookCollectionIds, id];
    }
  }

  const statuses: { value: BookStatus; label: string }[] = [
    { value: "not_started", label: "Not Started" },
    { value: "in_progress", label: "In Progress" },
    { value: "finished", label: "Finished" },
  ];
</script>

<Modal {onclose} label="Edit Book">
    <h3>Edit Book</h3>

    <div class="cover-section">
      <div class="cover-preview">
        {#if coverPreview}
          <img src={coverPreview} alt="" />
        {:else}
          <span class="material-symbols-outlined cover-icon">auto_stories</span>
        {/if}
      </div>
      <button class="btn-ghost btn-sm" onclick={handleChangeCover}>Change Cover</button>
    </div>

    <div class="field">
      <label class="label" for="edit-title">Title</label>
      <input
        id="edit-title"
        type="text"
        class="input"
        bind:value={titleInput}
        placeholder={book.title}
        maxlength={MAX_INPUT_LENGTH}
      />
    </div>

    <div class="field">
      <label class="label" for="edit-author">Author</label>
      <input
        id="edit-author"
        type="text"
        class="input"
        bind:value={authorInput}
        placeholder={book.author}
        maxlength={MAX_INPUT_LENGTH}
      />
    </div>

    <div class="field">
      <label class="label" for="edit-genre">Genre</label>
      <input
        id="edit-genre"
        type="text"
        class="input"
        list="genre-suggestions"
        bind:value={genreInput}
        placeholder="e.g. Fiction, Sci-Fi..."
        maxlength={100}
      />
      <datalist id="genre-suggestions">
        {#each GENRE_SUGGESTIONS as g}
          <option value={g}></option>
        {/each}
      </datalist>
    </div>

    <div class="field">
      <label class="label" for="edit-series">Series</label>
      <div class="series-row">
        <input
          id="edit-series"
          type="text"
          class="input"
          list="series-suggestions"
          bind:value={seriesInput}
          placeholder="e.g. Lord of the Rings"
          maxlength={200}
        />
        {#if seriesInput.trim()}
          <input
            type="number"
            class="input series-order"
            bind:value={seriesOrderInput}
            placeholder="#"
            min="1"
          />
        {/if}
      </div>
      <datalist id="series-suggestions">
        {#each existingSeriesNames as s}
          <option value={s}></option>
        {/each}
      </datalist>
    </div>

    <div class="field">
      <span class="label">Status</span>
      <div class="status-group">
        {#each statuses as s}
          <label class="radio-label">
            <input
              type="radio"
              name="status"
              value={s.value}
              bind:group={status}
            />
            <span class="radio-text">{s.label}</span>
          </label>
        {/each}
      </div>
    </div>

    {#if collections.length > 0}
      <div class="field">
        <span class="label">Collections</span>
        <div class="collection-picker">
          {#each collections as col (col.id)}
            <button
              class="collection-chip"
              class:selected={bookCollectionIds.includes(col.id)}
              onclick={() => toggleCollection(col.id)}
            >
              <span class="dot" style:background={col.color}></span>
              {col.name}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="dialog-actions">
      <button class="btn-ghost" onclick={handleReset}>Reset to Original</button>
      <button class="btn-primary" onclick={handleSave}>Save</button>
    </div>
</Modal>

<style>
  h3 {
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
    font-weight: 500;
    margin-bottom: var(--spacing-md);
  }

  .cover-section {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-md);
  }

  .cover-preview {
    width: 72px;
    height: 72px;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--color-surface-high);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .cover-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-icon {
    font-size: 32px;
    color: var(--color-outline-variant);
  }

  .field {
    margin-bottom: var(--spacing-md);
  }

  .label {
    display: block;
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-variant);
    margin-bottom: 4px;
  }

  .input {
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: var(--color-surface-high);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: var(--font-size-md);
    color: var(--color-text);
    outline: none;
    transition: box-shadow 0.15s;
  }

  .input:focus {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 25%, transparent);
  }

  .input::placeholder {
    color: var(--color-outline);
  }

  .series-row {
    display: flex;
    gap: var(--spacing-sm);
  }

  .series-row .input:first-child {
    flex: 1;
  }

  .series-order {
    width: 56px;
    text-align: center;
    flex-shrink: 0;
  }

  .status-group {
    display: flex;
    gap: var(--spacing-md);
  }

  .radio-label {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }

  .radio-label input[type="radio"] {
    accent-color: var(--color-primary);
  }

  .radio-text {
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    color: var(--color-text);
  }

  .collection-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .collection-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text-variant);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    padding: 4px 10px;
    border-radius: var(--radius-xl);
    cursor: pointer;
    transition: background 0.15s;
  }

  .collection-chip:hover {
    background: var(--color-surface-highest);
  }

  .collection-chip.selected {
    background: var(--color-primary-container);
    color: var(--color-on-primary);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dialog-actions {
    display: flex;
    justify-content: space-between;
    margin-top: var(--spacing-lg);
  }

  .btn-primary {
    background: var(--gradient-primary);
    color: var(--color-on-primary);
    border: none;
    padding: 8px 20px;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary:hover {
    opacity: 0.9;
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

  .btn-sm {
    padding: 5px 12px;
    font-size: var(--font-size-xs);
  }
</style>
