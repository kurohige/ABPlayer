<script lang="ts">
  import type { BookMeta, BookSource, BookStatus, Collection, UserBookData } from "../types";
  import {
    getUserBookData,
    setUserBookData,
    resetUserBookData,
    pickCoverArt,
    pickCoverArtData,
  } from "../stores/userdataStore";
  import { addFilelessBook, libraryStore } from "../stores/libraryStore";
  import Modal from "./Modal.svelte";

  type Mode = "edit" | "create";

  interface Props {
    mode?: Mode;
    /** Required in edit mode; ignored in create mode. */
    book?: BookMeta | null;
    collections: Collection[];
    existingSeriesNames?: string[];
    onclose: () => void;
    /** Fired after save. In create mode, passes the new book's filePath. */
    onsaved?: (filePath: string) => void;
  }

  let {
    mode = "edit",
    book = null,
    collections,
    existingSeriesNames = [],
    onclose,
    onsaved,
  }: Props = $props();

  // Dialog is mounted per-open from a parent `{#if}`, so one-shot seeding is correct —
  // `mode` and `book` never change within a single dialog instance.
  // svelte-ignore state_referenced_locally
  const seed: UserBookData =
    mode === "edit" && book
      ? getUserBookData(book.filePath)
      : {
          titleOverride: null,
          authorOverride: null,
          coverArtOverride: null,
          collections: [],
          status: "not_started",
          genre: null,
          series: null,
          seriesOrder: null,
          gainDb: null,
          dateAdded: new Date().toISOString(),
          dateFinished: null,
          narrator: null,
          description: null,
          notes: null,
          quotes: [],
          tags: [],
          yearRead: null,
          publishYear: null,
          source: null,
          axes: {},
          axisLabels: null,
        };

  // svelte-ignore state_referenced_locally
  let titleInput = $state(seed.titleOverride || "");
  let authorInput = $state(seed.authorOverride || "");
  let narratorInput = $state(seed.narrator || "");
  let genreInput = $state(seed.genre || "");
  let seriesInput = $state(seed.series || "");
  let seriesOrderInput = $state<number | "">(seed.seriesOrder ?? "");
  // svelte-ignore state_referenced_locally
  let lengthHoursInput = $state<number | "">(
    book && book.duration > 0 ? Math.round((book.duration / 3600) * 10) / 10 : "",
  );
  let yearReadInput = $state<number | "">(seed.yearRead ?? "");
  let publishYearInput = $state<number | "">(seed.publishYear ?? "");
  let sourceInput = $state<BookSource>(seed.source);
  let status = $state<BookStatus>(seed.status);
  let description = $state(seed.description || "");
  let notes = $state(seed.notes || "");
  let tagsList = $state<string[]>([...seed.tags]);
  let tagInput = $state("");
  let quotesList = $state<string[]>([...seed.quotes]);
  let quoteInput = $state("");
  let bookCollectionIds = $state<string[]>([...seed.collections]);

  // In create mode the cover lives in memory until save. In edit mode we still
  // use the existing on-disk override via pickCoverArt.
  let createCover = $state<string | null>(null);

  const GENRE_SUGGESTIONS = [
    "Fiction", "Non-Fiction", "Sci-Fi", "Fantasy", "Mystery",
    "Romance", "Horror", "Biography", "Self-Help", "History",
    "Business", "Thriller", "Young Adult", "Literary Fiction",
  ];

  const SOURCES: { value: BookSource; label: string }[] = [
    { value: null, label: "— none —" },
    { value: "Audible", label: "Audible" },
    { value: "Library", label: "Library" },
    { value: "Physical", label: "Physical" },
    { value: "Other", label: "Other" },
  ];

  // Edit-mode cover preview pulls from userdata + book; create-mode pulls from the in-memory buffer.
  let coverPreview = $derived(
    mode === "create"
      ? createCover
      : (getUserBookData(book!.filePath).coverArtOverride || (book ? book.coverArt : null)),
  );

  const MAX_INPUT_LENGTH = 500;

  function sanitizeText(value: string, max: number = MAX_INPUT_LENGTH): string | null {
    const trimmed = value.trim().slice(0, max);
    return trimmed || null;
  }

  function parseInt1Plus(value: number | ""): number | null {
    if (value === "" || typeof value !== "number") return null;
    const n = Math.floor(value);
    if (!Number.isFinite(n) || n < 1) return null;
    return n;
  }

  function parseYear(value: number | ""): number | null {
    if (value === "" || typeof value !== "number") return null;
    const n = Math.floor(value);
    if (!Number.isFinite(n) || n < 1 || n > 3000) return null;
    return n;
  }

  function parseHours(value: number | ""): number {
    if (value === "" || typeof value !== "number") return 0;
    if (!Number.isFinite(value) || value < 0) return 0;
    return value * 3600;
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !tagsList.includes(t)) {
      tagsList = [...tagsList, t];
    }
    tagInput = "";
  }

  function removeTag(t: string) {
    tagsList = tagsList.filter((x) => x !== t);
  }

  function addQuote() {
    const q = quoteInput.trim();
    if (q) {
      quotesList = [...quotesList, q];
      quoteInput = "";
    }
  }

  function removeQuote(i: number) {
    quotesList = quotesList.filter((_, idx) => idx !== i);
  }

  function toggleCollection(id: string) {
    if (bookCollectionIds.includes(id)) {
      bookCollectionIds = bookCollectionIds.filter((c) => c !== id);
    } else {
      bookCollectionIds = [...bookCollectionIds, id];
    }
  }

  async function handleChangeCover() {
    if (mode === "create") {
      const data = await pickCoverArtData();
      if (data) createCover = data;
    } else if (book) {
      await pickCoverArt(book.filePath);
      // trigger reactivity on the derived cover preview
      titleInput = titleInput;
    }
  }

  function buildUserDataPatch(): Partial<UserBookData> {
    return {
      titleOverride: sanitizeText(titleInput),
      authorOverride: sanitizeText(authorInput),
      narrator: sanitizeText(narratorInput),
      genre: sanitizeText(genreInput, 100),
      series: sanitizeText(seriesInput, 200),
      seriesOrder: seriesInput.trim() ? parseInt1Plus(seriesOrderInput) : null,
      yearRead: parseYear(yearReadInput),
      publishYear: parseYear(publishYearInput),
      source: sourceInput,
      description: sanitizeText(description, 4000),
      notes: sanitizeText(notes, 4000),
      tags: [...tagsList],
      quotes: [...quotesList],
      collections: bookCollectionIds,
      status,
      dateFinished: status === "finished" ? (seed.dateFinished || new Date().toISOString()) : null,
    };
  }

  async function handleSave() {
    if (mode === "create") {
      if (!titleInput.trim()) return;
      const filePath = await addFilelessBook({
        title: titleInput.trim(),
        author: authorInput.trim() || "Unknown Author",
        coverArt: createCover,
        userData: {
          ...buildUserDataPatch(),
          // Reflect length input as a duration hint on the book itself for display
          // (handled below via library.update since BookMeta.duration is outside userData).
        },
      });
      // Patch duration if user typed hours
      const durationSecs = parseHours(lengthHoursInput);
      if (durationSecs > 0) {
        libraryStore.update((s) => ({
          ...s,
          books: s.books.map((b) => (b.filePath === filePath ? { ...b, duration: durationSecs } : b)),
        }));
      }
      onsaved?.(filePath);
      onclose();
      return;
    }

    if (!book) return;
    await setUserBookData(book.filePath, buildUserDataPatch());
    onsaved?.(book.filePath);
    onclose();
  }

  async function handleReset() {
    if (!book || mode === "create") return;
    await resetUserBookData(book.filePath);
    onclose();
  }

  const statuses: { value: BookStatus; label: string }[] = [
    { value: "not_started", label: "Not Started" },
    { value: "in_progress", label: "In Progress" },
    { value: "finished", label: "Finished" },
  ];
</script>

<Modal {onclose} label={mode === "create" ? "Add book" : "Edit book"}>
  <h3>{mode === "create" ? "Add book" : "Edit book"}</h3>
  {#if mode === "create"}
    <p class="subtitle">Log a book you've read — no audio file required.</p>
  {/if}

  <div class="cover-section">
    <div class="cover-preview">
      {#if coverPreview}
        <img src={coverPreview} alt="" />
      {:else}
        <span class="material-symbols-outlined cover-icon">auto_stories</span>
      {/if}
    </div>
    <button class="btn-ghost btn-sm" onclick={handleChangeCover}>
      {coverPreview ? "Change Cover" : "Add Cover"}
    </button>
  </div>

  <div class="field">
    <label class="label" for="edit-title">Title {#if mode === "create"}<span class="req">*</span>{/if}</label>
    <input
      id="edit-title"
      type="text"
      class="input"
      bind:value={titleInput}
      placeholder={book ? book.title : "Book title"}
      maxlength={MAX_INPUT_LENGTH}
    />
  </div>

  <div class="row">
    <div class="field flex">
      <label class="label" for="edit-author">Author</label>
      <input
        id="edit-author"
        type="text"
        class="input"
        bind:value={authorInput}
        placeholder={book ? book.author : "Author"}
        maxlength={MAX_INPUT_LENGTH}
      />
    </div>
    <div class="field flex">
      <label class="label" for="edit-narrator">Narrator</label>
      <input
        id="edit-narrator"
        type="text"
        class="input"
        bind:value={narratorInput}
        placeholder="Narrator"
        maxlength={MAX_INPUT_LENGTH}
      />
    </div>
  </div>

  <div class="row">
    <div class="field flex">
      <label class="label" for="edit-series">Series</label>
      <input
        id="edit-series"
        type="text"
        class="input"
        list="series-suggestions"
        bind:value={seriesInput}
        placeholder="Series name"
        maxlength={200}
      />
      <datalist id="series-suggestions">
        {#each existingSeriesNames as s}
          <option value={s}></option>
        {/each}
      </datalist>
    </div>
    <div class="field narrow">
      <label class="label" for="edit-series-order">Book #</label>
      <input
        id="edit-series-order"
        type="number"
        class="input"
        bind:value={seriesOrderInput}
        placeholder="#"
        min="1"
      />
    </div>
  </div>

  <div class="row">
    <div class="field flex">
      <label class="label" for="edit-genre">Genre</label>
      <input
        id="edit-genre"
        type="text"
        class="input"
        list="genre-suggestions"
        bind:value={genreInput}
        placeholder="e.g. Fantasy"
        maxlength={100}
      />
      <datalist id="genre-suggestions">
        {#each GENRE_SUGGESTIONS as g}
          <option value={g}></option>
        {/each}
      </datalist>
    </div>
    <div class="field flex">
      <label class="label" for="edit-length">Length (hours)</label>
      <input
        id="edit-length"
        type="number"
        class="input"
        bind:value={lengthHoursInput}
        placeholder="0"
        step="0.1"
        min="0"
        disabled={mode === "edit" && !!book && book.fileless !== true}
      />
    </div>
  </div>

  <div class="row">
    <div class="field flex">
      <label class="label" for="edit-year-read">Year read</label>
      <input
        id="edit-year-read"
        type="number"
        class="input"
        bind:value={yearReadInput}
        placeholder="2024"
        min="1"
        max="3000"
      />
    </div>
    <div class="field flex">
      <label class="label" for="edit-publish-year">Publish year</label>
      <input
        id="edit-publish-year"
        type="number"
        class="input"
        bind:value={publishYearInput}
        placeholder="2007"
        min="1"
        max="3000"
      />
    </div>
    <div class="field flex">
      <label class="label" for="edit-source">Source</label>
      <select id="edit-source" class="input" bind:value={sourceInput}>
        {#each SOURCES as src}
          <option value={src.value}>{src.label}</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="field">
    <span class="label">Tags</span>
    <div class="chip-input">
      {#each tagsList as t}
        <span class="tag-chip">
          {t}
          <button class="chip-x" onclick={() => removeTag(t)} aria-label="Remove tag">×</button>
        </span>
      {/each}
      <input
        type="text"
        class="chip-input-field"
        bind:value={tagInput}
        placeholder="add tag + Enter"
        onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
        maxlength={60}
      />
    </div>
  </div>

  <div class="field">
    <label class="label" for="edit-description">Description</label>
    <textarea
      id="edit-description"
      class="input area"
      bind:value={description}
      placeholder="Back-of-book blurb"
      maxlength={4000}
    ></textarea>
  </div>

  <div class="field">
    <label class="label" for="edit-notes">Personal notes</label>
    <textarea
      id="edit-notes"
      class="input area"
      bind:value={notes}
      placeholder="Your review / thoughts"
      maxlength={4000}
    ></textarea>
  </div>

  <div class="field">
    <span class="label">Favorite quotes</span>
    <div class="quotes-list">
      {#each quotesList as q, i}
        <div class="quote-row">
          <div class="quote-text">"{q}"</div>
          <button class="chip-x" onclick={() => removeQuote(i)} aria-label="Remove quote">×</button>
        </div>
      {/each}
    </div>
    <div class="quote-add-row">
      <input
        type="text"
        class="input"
        bind:value={quoteInput}
        placeholder="Add a quote + Enter"
        onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); addQuote(); } }}
        maxlength={1000}
      />
      <button class="btn-ghost btn-sm" onclick={addQuote}>Add</button>
    </div>
  </div>

  <div class="field">
    <span class="label">Status</span>
    <div class="status-group">
      {#each statuses as s}
        <label class="radio-label">
          <input type="radio" name="status" value={s.value} bind:group={status} />
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
    {#if mode === "edit"}
      <button class="btn-ghost" onclick={handleReset}>Reset to original</button>
    {:else}
      <button class="btn-ghost" onclick={onclose}>Cancel</button>
    {/if}
    <button class="btn-primary" onclick={handleSave} disabled={mode === "create" && !titleInput.trim()}>
      {mode === "create" ? "Save" : "Save changes"}
    </button>
  </div>
</Modal>

<style>
  h3 {
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
    font-weight: 500;
    margin-bottom: 0.25rem;
  }

  .subtitle {
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
    margin-bottom: var(--spacing-md);
  }

  .cover-section {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-md);
  }

  .cover-preview {
    width: 4.5rem;
    height: 4.5rem;
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
    font-size: 2rem;
    color: var(--color-outline-variant);
  }

  .field { margin-bottom: var(--spacing-md); }
  .field.flex { flex: 1; min-width: 0; }
  .field.narrow { width: 5rem; flex-shrink: 0; }

  .row {
    display: flex;
    gap: var(--spacing-sm);
    margin-bottom: 0;
  }

  .row > .field { margin-bottom: var(--spacing-md); }

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

  .req { color: var(--color-primary); margin-left: 0.25rem; }

  .input {
    width: 100%;
    padding: 0.45rem 0.6rem;
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

  .input::placeholder { color: var(--color-outline); }

  .input:disabled { opacity: 0.5; cursor: not-allowed; }

  .input.area {
    min-height: 3.5rem;
    resize: vertical;
    font-family: var(--font-body);
    line-height: 1.45;
  }

  select.input {
    appearance: none;
    padding-right: 1.5rem;
    background-image: linear-gradient(45deg, transparent 50%, var(--color-text-variant) 50%), linear-gradient(135deg, var(--color-text-variant) 50%, transparent 50%);
    background-position: calc(100% - 0.8rem) center, calc(100% - 0.55rem) center;
    background-size: 0.3rem 0.3rem, 0.3rem 0.3rem;
    background-repeat: no-repeat;
  }

  .status-group { display: flex; gap: var(--spacing-md); }

  .radio-label {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }

  .radio-label input[type="radio"] { accent-color: var(--color-primary); }

  .radio-text {
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    color: var(--color-text);
  }

  .chip-input {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    align-items: center;
    background: var(--color-surface-high);
    border-radius: var(--radius-md);
    padding: 0.4rem;
    min-height: 2.2rem;
  }

  .tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0.2rem 0.5rem;
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
    color: var(--color-primary);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-weight: 500;
  }

  .chip-input-field {
    flex: 1;
    min-width: 6rem;
    background: transparent;
    border: none;
    outline: none;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
  }

  .chip-x {
    background: none;
    border: none;
    color: currentColor;
    opacity: 0.6;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0 2px;
  }

  .chip-x:hover { opacity: 1; }

  .quotes-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-bottom: 0.4rem;
  }

  .quote-row {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    padding: 0.4rem 0.6rem;
    background: var(--color-surface-high);
    border-left: 2px solid var(--color-primary);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
  }

  .quote-text {
    flex: 1;
    font-family: var(--font-headline);
    font-style: italic;
    font-size: var(--font-size-sm);
    line-height: 1.4;
    color: var(--color-text);
  }

  .quote-add-row {
    display: flex;
    gap: 0.4rem;
  }

  .quote-add-row .input { flex: 1; }

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

  .collection-chip:hover { background: var(--color-surface-highest); }

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
    gap: var(--spacing-sm);
  }

  .btn-primary {
    background: var(--gradient-primary);
    color: var(--color-on-primary);
    border: none;
    padding: 0.5rem 1.2rem;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary:hover:not(:disabled) { opacity: 0.9; }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-ghost {
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text-variant);
    padding: 0.5rem 1rem;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .btn-ghost:hover { background: var(--color-surface-highest); }

  .btn-sm {
    padding: 0.3rem 0.75rem;
    font-size: var(--font-size-xs);
  }
</style>
