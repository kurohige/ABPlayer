<script lang="ts">
  import { setUserBookData } from "../../stores/userdataStore";
  import { focusOnMount } from "../../utils/focusOnMount";
  import type { BookMeta, UserBookData } from "../../types";

  /** About / metadata grid, editable notes, and favorite quotes. */
  interface Props {
    book: BookMeta;
    userData: UserBookData;
  }

  let { book, userData }: Props = $props();

  let editingNotes = $state(false);
  let notesDraft = $state("");
  let newQuoteInput = $state("");

  function startNotesEdit() {
    notesDraft = userData.notes ?? "";
    editingNotes = true;
  }

  async function commitNotes() {
    editingNotes = false;
    const v = notesDraft.trim();
    if (v !== (userData.notes ?? "")) {
      await setUserBookData(book.filePath, { notes: v || null });
    }
  }

  async function addQuote() {
    const q = newQuoteInput.trim();
    if (!q) return;
    const quotes = [...userData.quotes, q];
    await setUserBookData(book.filePath, { quotes });
    newQuoteInput = "";
  }

  async function removeQuote(i: number) {
    const quotes = userData.quotes.filter((_, idx) => idx !== i);
    await setUserBookData(book.filePath, { quotes });
  }

  function formatDateAdded(iso: string | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
</script>

<div class="pv-details-pane">
  <div class="pv-details-grid">
    <section>
      <span class="pv-section-label">About</span>
      {#if userData.description}
        <p class="pv-about-text">{userData.description}</p>
      {:else}
        <p class="pv-empty-line">No description yet.</p>
      {/if}
    </section>
    <section>
      <span class="pv-section-label">Metadata</span>
      <div class="pv-meta-grid">
        {#if userData.narrator}
          <div class="pv-meta-row"><span class="pv-meta-k">Narrator</span><span class="pv-meta-v">{userData.narrator}</span></div>
        {/if}
        {#if book.duration > 0}
          <div class="pv-meta-row"><span class="pv-meta-k">Length</span><span class="pv-meta-v mono">{(book.duration / 3600).toFixed(1)}h</span></div>
        {/if}
        {#if book.chapters.length > 0}
          <div class="pv-meta-row"><span class="pv-meta-k">Chapters</span><span class="pv-meta-v mono">{book.chapters.length}{book.chapterSource === "sidecar" ? " · from sidecar file" : ""}</span></div>
        {/if}
        {#if userData.series}
          <div class="pv-meta-row"><span class="pv-meta-k">Series</span><span class="pv-meta-v">{userData.series}{userData.seriesOrder ? ` · Book ${userData.seriesOrder}` : ""}</span></div>
        {/if}
        {#if userData.genre}
          <div class="pv-meta-row"><span class="pv-meta-k">Genre</span><span class="pv-meta-v">{userData.genre}</span></div>
        {/if}
        <div class="pv-meta-row"><span class="pv-meta-k">Source</span><span class="pv-meta-v">{userData.source || "Local"}</span></div>
        {#if userData.yearRead}
          <div class="pv-meta-row"><span class="pv-meta-k">Year read</span><span class="pv-meta-v mono">{userData.yearRead}</span></div>
        {/if}
        {#if userData.publishYear}
          <div class="pv-meta-row"><span class="pv-meta-k">Published</span><span class="pv-meta-v mono">{userData.publishYear}</span></div>
        {/if}
        <div class="pv-meta-row"><span class="pv-meta-k">Added</span><span class="pv-meta-v">{formatDateAdded(userData.dateAdded)}</span></div>
        {#if userData.tags.length > 0}
          <div class="pv-meta-row"><span class="pv-meta-k">Tags</span><span class="pv-meta-v">{userData.tags.join(" · ")}</span></div>
        {/if}
      </div>
    </section>
  </div>

  <section class="pv-details-full">
    <div class="pv-section-head">
      <span class="pv-section-label">Your notes</span>
      {#if !editingNotes}
        <button class="pv-edit-link" onclick={startNotesEdit}>{userData.notes ? "EDIT" : "+ ADD"}</button>
      {/if}
    </div>
    {#if editingNotes}
      <textarea
        class="pv-notes-edit"
        bind:value={notesDraft}
        use:focusOnMount
        onblur={commitNotes}
        placeholder="Your thoughts, takeaways, review…"
        maxlength={4000}
      ></textarea>
    {:else if userData.notes}
      <p class="pv-notes-view">{userData.notes}</p>
    {:else}
      <p class="pv-empty-line">No notes yet.</p>
    {/if}
  </section>

  <section class="pv-details-full">
    <div class="pv-section-head">
      <span class="pv-section-label">Favorite quotes</span>
    </div>
    {#if userData.quotes.length > 0}
      <div class="pv-quotes">
        {#each userData.quotes as q, i (i + q)}
          <div class="pv-quote">
            <span class="pv-quote-text">"{q}"</span>
            <button class="pv-quote-remove" onclick={() => removeQuote(i)} title="Remove quote" aria-label="Remove quote">×</button>
          </div>
        {/each}
      </div>
    {/if}
    <div class="pv-quote-add">
      <input
        type="text"
        class="pv-quote-input"
        bind:value={newQuoteInput}
        placeholder="Add a quote + Enter"
        onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); addQuote(); } }}
        maxlength={1000}
      />
      <button class="pv-quote-add-btn" onclick={addQuote} disabled={!newQuoteInput.trim()} aria-label="Add quote">
        <span class="material-symbols-outlined">add</span>
      </button>
    </div>
  </section>
</div>

<style>
  .pv-details-pane {
    padding: 1rem 1.3rem 1.3rem;
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
  }

  .pv-details-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.75rem;
  }

  @media (max-width: 640px) {
    .pv-details-grid { grid-template-columns: 1fr; gap: 1rem; }
  }

  .pv-section-label {
    display: block;
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-outline);
    margin-bottom: 0.45rem;
  }

  .pv-section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .pv-section-head .pv-section-label { margin-bottom: 0.45rem; }

  .pv-edit-link {
    background: none;
    border: none;
    color: var(--color-primary);
    font-family: var(--font-label);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    cursor: pointer;
    padding: 0;
  }

  .pv-edit-link:hover { text-decoration: underline; }

  .pv-about-text {
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    line-height: 1.6;
    color: var(--color-text);
    margin: 0;
    text-wrap: pretty;
  }

  .pv-meta-grid {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .pv-meta-row {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: var(--font-size-sm);
  }

  .pv-meta-k {
    font-family: var(--font-label);
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--color-outline);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .pv-meta-v {
    color: var(--color-text);
    text-align: right;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pv-details-full {
    width: 100%;
  }

  .pv-notes-view {
    font-family: var(--font-headline);
    font-size: var(--font-size-sm);
    font-style: italic;
    line-height: 1.55;
    color: var(--color-text-variant);
    white-space: pre-wrap;
    margin: 0;
  }

  .pv-notes-edit {
    width: 100%;
    min-height: 5rem;
    background: var(--color-surface);
    border: none;
    outline: none;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius-md);
    resize: vertical;
  }

  .pv-empty-line {
    font-size: var(--font-size-xs);
    color: var(--color-outline);
    font-style: italic;
    margin: 0;
  }

  .pv-quotes {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-bottom: 0.4rem;
  }

  .pv-quote {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    padding: 0.55rem 0.85rem;
    border-left: 2px solid var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 4%, var(--color-surface));
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
  }

  .pv-quote-text {
    flex: 1;
    font-family: var(--font-headline);
    font-style: italic;
    font-size: 0.9rem;
    line-height: 1.45;
    color: var(--color-text);
  }

  .pv-quote-remove {
    background: none;
    border: none;
    color: var(--color-outline);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0 0.25rem;
  }

  .pv-quote-remove:hover { color: var(--color-error); }

  .pv-quote-add {
    display: flex;
    gap: 0.3rem;
  }

  .pv-quote-input {
    flex: 1;
    background: var(--color-surface);
    border: none;
    outline: none;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    padding: 0.45rem 0.65rem;
    border-radius: var(--radius-md);
  }

  .pv-quote-add-btn {
    width: 2rem;
    background: var(--color-surface);
    border: none;
    color: var(--color-text-variant);
    border-radius: var(--radius-md);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .pv-quote-add-btn:hover:not(:disabled) {
    background: var(--color-primary);
    color: var(--color-on-primary);
  }

  .pv-quote-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .pv-quote-add-btn .material-symbols-outlined { font-size: 1rem; }
</style>
