<script lang="ts">
  /**
   * One tier row on the board (handoff 1f): a tier-coloured label cell, a
   * wrapping books well that is the drop target, and the row controls.
   */
  import type { BookMeta, Tier, UserBookData } from "../types";
  import MiniCover from "./MiniCover.svelte";
  import TierColorPicker from "./TierColorPicker.svelte";
  import { focusOnMount } from "../utils/focusOnMount";
  import { bookDropZone } from "../utils/pointerDrag";
  import { IconButton } from "./ui";

  interface Props {
    tier: Tier;
    books: BookMeta[];
    userData: Record<string, UserBookData>;
    canMoveUp: boolean;
    canMoveDown: boolean;
    /** File path of a book just dropped anywhere on the board, for the settle. */
    justDropped?: string | null;
    onrelabel: (label: string) => void;
    onrename: (name: string | null) => void;
    onrecolor: (color: string) => void;
    onmove: (delta: -1 | 1) => void;
    ondelete: () => void;
    ondropbook: (filePath: string) => void;
    oncontextbook?: (book: BookMeta, pos: { x: number; y: number }) => void;
  }

  let {
    tier,
    books,
    userData,
    canMoveUp,
    canMoveDown,
    justDropped = null,
    onrelabel,
    onrename,
    onrecolor,
    onmove,
    ondelete,
    ondropbook,
    oncontextbook,
  }: Props = $props();

  let colorOpen = $state(false);
  let dragOver = $state(false);
  let editingLabel = $state(false);
  let editingName = $state(false);
  // svelte-ignore state_referenced_locally — one-shot seed; startLabelEdit resyncs from the prop
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
</script>

<div class="tr">
  <div class="tr-label" style="--tier-color: {tier.color};">
    {#if editingLabel}
      <input
        class="tr-label-input"
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
      <button type="button" class="tr-label-big" onclick={startLabelEdit}>{tier.label}</button>
    {/if}

    {#if editingName}
      <input
        class="tr-name-input"
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
      <button type="button" class="tr-name" onclick={startNameEdit}>{tier.name || "+ Name"}</button>
    {/if}

    <button
      class="tr-swatch"
      onclick={() => (colorOpen = !colorOpen)}
      title="Change colour"
      aria-label="Change colour"
    ></button>
    {#if colorOpen}
      <div class="tr-swatch-popover">
        <TierColorPicker
          value={tier.color}
          onchange={(c) => onrecolor(c)}
          onclose={() => (colorOpen = false)}
        />
      </div>
    {/if}
  </div>

  <div
    class="tr-well"
    class:drag-over={dragOver}
    role="group"
    aria-label="Books in tier {tier.label} — drop zone"
    use:bookDropZone={{ onover: (over) => (dragOver = over), ondrop: (p) => ondropbook(p.filePath) }}
  >
    {#if books.length === 0}
      <span class="tr-empty">Drop a cover here</span>
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

  <div class="tr-controls">
    <IconButton icon="arrow_upward" label="Move tier up" size="1.9rem" bare disabled={!canMoveUp} onclick={() => onmove(-1)} />
    <IconButton icon="arrow_downward" label="Move tier down" size="1.9rem" bare disabled={!canMoveDown} onclick={() => onmove(1)} />
    <IconButton icon="delete" label="Delete tier" size="1.9rem" bare class="tr-danger" onclick={ondelete} />
  </div>
</div>

<style>
  .tr {
    display: flex;
    min-height: 9.2rem;
    background: var(--color-surface);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .tr-label {
    position: relative;
    width: 4.4rem;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    padding: 0.55rem 0.28rem;
    background: var(--tier-color);
    color: #16110f;
    user-select: none;
  }

  .tr-label-big {
    padding: 0;
    background: none;
    border: none;
    color: inherit;
    font-family: var(--font-label);
    font-weight: 800;
    font-size: 1.67rem;
    line-height: 1;
    text-align: center;
    word-break: break-all;
    cursor: text;
  }

  .tr-label-input {
    width: 100%;
    background: rgba(255, 255, 255, 0.35);
    border: none;
    outline: none;
    border-radius: var(--radius-sm);
    color: #16110f;
    font-family: var(--font-label);
    font-weight: 800;
    font-size: 1.67rem;
    line-height: 1;
    text-align: center;
  }

  .tr-name {
    max-width: 100%;
    padding: 0;
    background: none;
    border: none;
    color: inherit;
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.55rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    opacity: 0.75;
    cursor: text;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tr-name-input {
    width: 100%;
    padding: 0.1rem 0.25rem;
    background: rgba(255, 255, 255, 0.35);
    border: none;
    outline: none;
    border-radius: var(--radius-sm);
    color: #16110f;
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.55rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    text-align: center;
  }

  .tr-swatch {
    position: absolute;
    top: 0.28rem;
    right: 0.28rem;
    width: 0.55rem;
    height: 0.55rem;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.2);
    cursor: pointer;
  }

  .tr-swatch:hover {
    background: rgba(0, 0, 0, 0.35);
  }

  .tr-swatch-popover {
    position: absolute;
    top: 100%;
    left: 0.28rem;
    margin-top: 0.25rem;
    z-index: 30;
  }

  .tr-well {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 0.7rem;
    padding: 0.83rem 0.97rem;
    background: var(--color-surface);
    border-left: 1px solid var(--color-outline-variant);
    transition:
      background var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease;
  }

  /* Drop target highlight (motion #5): accent edge + 12% tint */
  .tr-well.drag-over {
    background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface));
    box-shadow: inset 0 0 0 1px var(--color-primary);
  }

  .tr-empty {
    margin: auto;
    font-family: var(--font-body);
    font-size: 0.72rem;
    font-style: italic;
    color: var(--color-outline);
  }

  .tr-controls {
    width: 2.4rem;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0.14rem;
    padding: 0.42rem 0.28rem;
    border-left: 1px solid var(--color-outline-variant);
  }

  .tr-controls > :global(.tr-danger:hover:not(:disabled)) {
    color: var(--color-error);
  }
</style>
