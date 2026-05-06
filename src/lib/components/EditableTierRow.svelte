<script lang="ts">
  import type { BookMeta, Tier, UserBookData } from "../types";
  import MiniCover from "./MiniCover.svelte";
  import TierColorPicker from "./TierColorPicker.svelte";
  import { focusOnMount } from "../utils/focusOnMount";

  interface Props {
    tier: Tier;
    books: BookMeta[];
    userData: Record<string, UserBookData>;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onrelabel: (label: string) => void;
    onrename: (name: string | null) => void;
    onrecolor: (color: string) => void;
    onmove: (delta: -1 | 1) => void;
    ondelete: () => void;
    ondropbook: (filePath: string) => void;
  }

  let {
    tier,
    books,
    userData,
    canMoveUp,
    canMoveDown,
    onrelabel,
    onrename,
    onrecolor,
    onmove,
    ondelete,
    ondropbook,
  }: Props = $props();

  let colorOpen = $state(false);
  let dragOver = $state(false);
  let editingLabel = $state(false);
  let editingName = $state(false);
  // svelte-ignore state_referenced_locally — one-shot seed; startLabelEdit/startNameEdit resync from the current prop before entering edit mode
  let labelDraft = $state(tier.label);
  // svelte-ignore state_referenced_locally — one-shot seed; see above
  let nameDraft = $state(tier.name || "");

  function startLabelEdit() {
    labelDraft = tier.label;
    editingLabel = true;
  }

  function startNameEdit() {
    nameDraft = tier.name || "";
    editingName = true;
  }

  function commitLabel() {
    editingLabel = false;
    const v = labelDraft.trim();
    if (v && v !== tier.label) onrelabel(v);
    else labelDraft = tier.label;
  }

  function commitName() {
    editingName = false;
    const v = nameDraft.trim();
    const current = tier.name || "";
    if (v !== current) onrename(v || null);
  }

  function handleDragOver(e: DragEvent) {
    if (e.dataTransfer?.types.includes("application/x-abplayer-book")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      dragOver = true;
    }
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const fp = e.dataTransfer?.getData("text/plain");
    if (fp) ondropbook(fp);
  }
</script>

<div class="tier-row">
  <div
    class="label-cell"
    style="--tier-color: {tier.color};"
  >
    {#if editingLabel}
      <input
        class="label-input"
        bind:value={labelDraft}
        use:focusOnMount
        onblur={commitLabel}
        onkeydown={(e: KeyboardEvent) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          else if (e.key === "Escape") { labelDraft = tier.label; editingLabel = false; }
        }}
        maxlength={8}
      />
    {:else}
      <button type="button" class="label-big" onclick={startLabelEdit}>
        {tier.label}
      </button>
    {/if}
    {#if editingName}
      <input
        class="name-input"
        bind:value={nameDraft}
        use:focusOnMount
        onblur={commitName}
        onkeydown={(e: KeyboardEvent) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          else if (e.key === "Escape") { nameDraft = tier.name || ""; editingName = false; }
        }}
        placeholder="Name"
        maxlength={24}
      />
    {:else}
      <button type="button" class="name-small" onclick={startNameEdit}>
        {tier.name || "+ Name"}
      </button>
    {/if}
    <button
      class="swatch-btn"
      onclick={() => (colorOpen = !colorOpen)}
      title="Change color"
      aria-label="Change color"
    ></button>
    {#if colorOpen}
      <div class="swatch-popover">
        <TierColorPicker
          value={tier.color}
          onchange={(c) => onrecolor(c)}
          onclose={() => (colorOpen = false)}
        />
      </div>
    {/if}
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="books-well"
    class:drag-over={dragOver}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  >
    {#if books.length === 0}
      <div class="empty-placeholder">Drop books here</div>
    {:else}
      {#each books as b (b.filePath)}
        <MiniCover book={b} userData={userData[b.filePath]} />
      {/each}
    {/if}
  </div>

  <div class="row-controls">
    <button class="ctrl" disabled={!canMoveUp} onclick={() => onmove(-1)} title="Move up">
      <span class="material-symbols-outlined">arrow_upward</span>
    </button>
    <button class="ctrl" disabled={!canMoveDown} onclick={() => onmove(1)} title="Move down">
      <span class="material-symbols-outlined">arrow_downward</span>
    </button>
    <button class="ctrl danger" onclick={ondelete} title="Delete tier">
      <span class="material-symbols-outlined">delete</span>
    </button>
  </div>
</div>

<style>
  .tier-row {
    display: flex;
    background: var(--color-surface);
    border-radius: var(--radius-md);
    overflow: hidden;
    min-height: 6rem;
    box-shadow: var(--shadow-card);
  }

  .label-cell {
    width: 5rem;
    flex-shrink: 0;
    background: var(--tier-color);
    color: #1a0f0d;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 0.5rem 0.3rem;
    gap: 0.2rem;
    user-select: none;
  }

  .label-big {
    font-family: var(--font-label);
    font-weight: 800;
    font-size: 1.8rem;
    line-height: 1;
    cursor: text;
    word-break: break-all;
    text-align: center;
    background: none;
    border: none;
    color: inherit;
    padding: 0;
  }

  .label-input {
    background: rgba(255, 255, 255, 0.35);
    border: none;
    outline: none;
    color: #1a0f0d;
    font-family: var(--font-label);
    font-weight: 800;
    font-size: 1.8rem;
    line-height: 1;
    text-align: center;
    width: 100%;
    border-radius: var(--radius-sm);
  }

  .name-small {
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.75;
    cursor: text;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: none;
    border: none;
    color: inherit;
    padding: 0;
  }

  .name-input {
    background: rgba(255, 255, 255, 0.35);
    border: none;
    outline: none;
    color: #1a0f0d;
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: center;
    padding: 0.1rem 0.25rem;
    border-radius: var(--radius-sm);
    width: 100%;
  }

  .swatch-btn {
    position: absolute;
    top: 0.3rem;
    right: 0.3rem;
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.2);
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .swatch-btn:hover {
    background: rgba(0, 0, 0, 0.35);
  }

  .swatch-popover {
    position: absolute;
    top: 100%;
    left: 0.3rem;
    margin-top: 0.25rem;
    z-index: 30;
  }

  .books-well {
    flex: 1;
    padding: 0.5rem 0.6rem;
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    align-content: flex-start;
    min-height: 6rem;
    background: var(--color-surface-container);
    transition: background 0.15s;
  }

  .books-well.drag-over {
    background: color-mix(in srgb, var(--color-primary) 15%, var(--color-surface-container));
    outline: 2px dashed var(--color-primary);
    outline-offset: -4px;
  }

  .empty-placeholder {
    width: 100%;
    text-align: center;
    padding: 1.3rem 0.5rem;
    font-family: var(--font-body);
    font-size: var(--font-size-xs);
    color: var(--color-outline);
    font-style: italic;
    border: 1px dashed var(--color-outline-variant);
    border-radius: var(--radius-md);
    margin: auto;
  }

  .row-controls {
    flex-shrink: 0;
    width: 2.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.4rem 0.3rem;
    background: var(--color-surface);
    border-left: 1px solid var(--color-outline-variant);
  }

  .ctrl {
    width: 100%;
    height: 1.6rem;
    background: transparent;
    border: none;
    color: var(--color-text-variant);
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
  }

  .ctrl:hover:not(:disabled) {
    background: var(--color-surface-high);
    color: var(--color-text);
  }

  .ctrl:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .ctrl.danger:hover:not(:disabled) {
    color: var(--color-error);
  }

  .ctrl .material-symbols-outlined {
    font-size: 1rem;
  }
</style>
