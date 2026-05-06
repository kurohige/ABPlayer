<script lang="ts">
  import type { BookMeta, Tier, UserBookData } from "../types";
  import { setUserBookData } from "../stores/userdataStore";
  import {
    tierListsStore,
    defaultTierList,
    assignBookToTier,
    unassignBook,
    setDefaultTierList,
  } from "../stores/tierListStore";
  import TierBadge from "./TierBadge.svelte";
  import AxisEditor from "./AxisEditor.svelte";

  interface Props {
    book: BookMeta;
    userData: UserBookData;
    /** Optional pre-computed current tier (parent can pass to skip re-deriving). */
    currentTier?: Tier | null;
    /** How many tier lists besides the default have this book assigned. */
    otherListsCount?: number;
    /** Compact mode renders a 2-column grid with no outer card styling (used inside Rating tab). */
    compact?: boolean;
  }

  let { book, userData, currentTier: providedTier = null, otherListsCount = 0, compact = false }: Props = $props();

  let listPickerOpen = $state(false);
  let newAxisInput = $state("");

  let activeList = $derived($defaultTierList);
  let allLists = $derived($tierListsStore.lists);
  let currentTierId = $derived(activeList?.assignments[book.filePath] ?? null);
  let currentTier = $derived(
    providedTier ?? (activeList ? activeList.tiers.find((t) => t.id === currentTierId) || null : null),
  );
  let accent = $derived(currentTier?.color || "var(--color-primary)");

  let axisLabels = $derived(
    userData.axisLabels && userData.axisLabels.length > 0
      ? userData.axisLabels
      : activeList?.defaultAxes || [],
  );

  let averageScore = $derived.by(() => {
    if (axisLabels.length === 0) return null;
    const vals = axisLabels.map((l) => userData.axes[l] ?? 0);
    const sum = vals.reduce((a, v) => a + v, 0);
    return sum / vals.length;
  });

  async function pickTier(tierId: string) {
    if (!activeList) return;
    if (currentTierId === tierId) {
      await unassignBook(activeList.id, book.filePath);
    } else {
      await assignBookToTier(activeList.id, book.filePath, tierId);
    }
  }

  async function setAxisValue(label: string, value: number) {
    const axes = { ...userData.axes, [label]: value };
    await setUserBookData(book.filePath, { axes });
  }

  async function renameAxis(oldLabel: string, newLabel: string) {
    const labels = [...axisLabels];
    const idx = labels.indexOf(oldLabel);
    if (idx < 0) return;
    labels[idx] = newLabel;
    const { [oldLabel]: oldVal, ...rest } = userData.axes;
    const axes: Record<string, number> = { ...rest };
    if (typeof oldVal === "number") axes[newLabel] = oldVal;
    await setUserBookData(book.filePath, { axisLabels: labels, axes });
  }

  async function removeAxis(label: string) {
    const labels = axisLabels.filter((l) => l !== label);
    const { [label]: _removed, ...rest } = userData.axes;
    await setUserBookData(book.filePath, { axisLabels: labels, axes: rest });
  }

  async function addAxis() {
    const v = newAxisInput.trim();
    newAxisInput = "";
    if (!v || axisLabels.includes(v)) return;
    const labels = [...axisLabels, v];
    const axes = { ...userData.axes, [v]: 0 };
    await setUserBookData(book.filePath, { axisLabels: labels, axes });
  }

  async function handleSwitchList(id: string) {
    await setDefaultTierList(id);
    listPickerOpen = false;
  }
</script>

<section class="card" class:compact style="--accent: {accent};">
  {#if !activeList}
    <p class="empty-hint">Create a tier list in the Tiers tab to start ranking this book.</p>
  {:else}
    <div class="grid">
      <!-- LEFT: tier picker + caption -->
      <div>
        <div class="section-head">
          <span class="section-label">Tier</span>
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div class="list-picker">
            <button class="picker-btn" onclick={() => (listPickerOpen = !listPickerOpen)}>
              <span class="list-name">{activeList.name}</span>
              <span class="material-symbols-outlined picker-caret">expand_more</span>
            </button>
            {#if listPickerOpen}
              <div class="picker-menu">
                {#each allLists as l (l.id)}
                  <button
                    class="picker-item"
                    class:active={l.id === activeList.id}
                    onclick={() => handleSwitchList(l.id)}
                  >
                    {l.name}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <div class="tier-row">
          {#each activeList.tiers.slice().sort((a, b) => a.order - b.order) as tier (tier.id)}
            <button
              class="tier-pick"
              class:active={tier.id === currentTierId}
              style="--tc: {tier.color};"
              onclick={() => pickTier(tier.id)}
              title={tier.name ? `${tier.label} — ${tier.name}` : tier.label}
            >
              <TierBadge
                label={tier.label}
                color={tier.color}
                size={2.1}
                outlined={tier.id !== currentTierId}
              />
            </button>
          {/each}
        </div>

        <p class="tier-caption">
          {#if currentTier}
            Currently <span class="accent-inline">
              {currentTier.label}{currentTier.name ? ` · ${currentTier.name}` : ""}
            </span>
            in your <em>{activeList.name}</em> list.
          {:else}
            Not yet ranked in <em>{activeList.name}</em>.
          {/if}
          {#if otherListsCount > 0}
            <br />
            <span class="caption-dim">Also assigned in {otherListsCount} other list{otherListsCount === 1 ? "" : "s"}.</span>
          {/if}
        </p>
      </div>

      <!-- RIGHT: per-axis sliders -->
      <div>
        <div class="section-head">
          <span class="section-label">Per-axis</span>
          {#if averageScore !== null}
            <span class="avg-score mono">{averageScore.toFixed(1)} avg</span>
          {/if}
        </div>

        {#if axisLabels.length === 0}
          <p class="empty-hint subtle">
            Add an axis to score this book across different dimensions.
          </p>
        {:else}
          {#each axisLabels as label (label)}
            <AxisEditor
              {label}
              value={userData.axes[label] ?? 0}
              color={accent}
              onlabel={(next) => renameAxis(label, next)}
              onvalue={(v) => setAxisValue(label, v)}
              ondelete={() => removeAxis(label)}
            />
          {/each}
        {/if}

        <div class="add-axis-row">
          <input
            type="text"
            class="axis-input"
            bind:value={newAxisInput}
            placeholder="Add axis"
            onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); addAxis(); } }}
            maxlength={40}
          />
          <button class="add-axis-btn" onclick={addAxis} disabled={!newAxisInput.trim()} aria-label="Add axis">
            <span class="material-symbols-outlined">add</span>
          </button>
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  .card {
    background: var(--color-surface);
    border-radius: var(--radius-xl);
    padding: var(--spacing-md);
    margin-bottom: var(--spacing-md);
    box-shadow: var(--shadow-card);
  }

  .card.compact {
    background: transparent;
    padding: 0;
    margin-bottom: 0;
    box-shadow: none;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.75rem;
  }

  @media (max-width: 640px) {
    .grid { grid-template-columns: 1fr; gap: 1.25rem; }
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }

  .section-label {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-outline);
  }

  .avg-score {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.7rem;
    color: var(--color-text-variant);
  }

  .list-picker { position: relative; }

  .picker-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    background: var(--color-surface);
    border: none;
    color: var(--color-text-variant);
    font-family: var(--font-label);
    font-size: 0.65rem;
    font-weight: 600;
    padding: 0.15rem 0.45rem;
    border-radius: var(--radius-xl);
    cursor: pointer;
  }

  .picker-btn:hover { background: var(--color-surface-high); }

  .list-name {
    max-width: 9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker-caret { font-size: 0.85rem; }

  .picker-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.25rem;
    background: var(--color-surface-lowest);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-ambient), 0 6px 16px rgba(0, 0, 0, 0.25);
    padding: 0.25rem;
    z-index: 20;
    min-width: 11rem;
  }

  .picker-item {
    width: 100%;
    background: none;
    border: none;
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    padding: 0.35rem 0.6rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
  }

  .picker-item:hover { background: var(--color-surface-high); }
  .picker-item.active { color: var(--color-primary); font-weight: 600; }

  .tier-row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 0.8rem;
  }

  .tier-pick {
    background: transparent;
    border: none;
    padding: 0.15rem;
    border-radius: 50%;
    cursor: pointer;
    transition: transform 0.12s;
  }

  .tier-pick:hover { transform: scale(1.08); }

  .tier-pick.active {
    box-shadow: 0 0 0 2px var(--color-bg), 0 0 0 3px var(--tc);
  }

  .tier-caption {
    font-size: 0.7rem;
    color: var(--color-text-variant);
    line-height: 1.5;
    margin: 0;
  }

  .accent-inline {
    color: var(--accent);
    font-weight: 600;
  }

  .caption-dim {
    color: var(--color-outline);
    font-size: 0.65rem;
  }

  .empty-hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
    font-style: italic;
    line-height: 1.5;
  }

  .empty-hint.subtle { color: var(--color-outline); }

  .add-axis-row {
    display: flex;
    gap: 0.3rem;
    margin-top: 0.4rem;
  }

  .axis-input {
    flex: 1;
    background: var(--color-surface);
    border: none;
    outline: none;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: 0.75rem;
    padding: 0.3rem 0.55rem;
    border-radius: var(--radius-md);
  }

  .add-axis-btn {
    width: 1.8rem;
    height: 1.8rem;
    background: var(--color-surface);
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text-variant);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .add-axis-btn:hover:not(:disabled) {
    background: var(--color-primary);
    color: var(--color-on-primary);
  }

  .add-axis-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .add-axis-btn .material-symbols-outlined { font-size: 0.95rem; }
</style>
