<script lang="ts">
  import type { Tier, TierScope } from "../types";
  import { TIER_PALETTE, TIER_TEMPLATES, DEFAULT_AXES, tiersFromTemplate } from "../tierDefaults";
  import { createTierList } from "../stores/tierListStore";
  import Modal from "./Modal.svelte";

  interface Props {
    onclose: () => void;
    oncreated?: (id: string) => void;
  }

  let { onclose, oncreated }: Props = $props();

  let name = $state("");
  let description = $state("");
  let scope = $state<TierScope>("all");
  let tiers = $state<Tier[]>(tiersFromTemplate("classic"));
  let axes = $state<string[]>([...DEFAULT_AXES]);
  let newAxisInput = $state("");

  function applyTemplate(id: string) {
    tiers = tiersFromTemplate(id);
  }

  function addTierPill() {
    const id =
      Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    tiers = [
      ...tiers,
      {
        id,
        label: "New",
        name: null,
        color: TIER_PALETTE[tiers.length % TIER_PALETTE.length],
        order: tiers.length,
      },
    ];
  }

  function removeTierPill(id: string) {
    tiers = tiers.filter((t) => t.id !== id).map((t, i) => ({ ...t, order: i }));
  }

  function setLabel(id: string, label: string) {
    tiers = tiers.map((t) => (t.id === id ? { ...t, label: label.slice(0, 24) } : t));
  }

  function cycleColor(id: string) {
    tiers = tiers.map((t) => {
      if (t.id !== id) return t;
      const idx = TIER_PALETTE.findIndex((c) => c.toLowerCase() === t.color.toLowerCase());
      const next = TIER_PALETTE[(idx + 1) % TIER_PALETTE.length];
      return { ...t, color: next };
    });
  }

  function addAxis() {
    const a = newAxisInput.trim();
    if (a && !axes.includes(a)) axes = [...axes, a];
    newAxisInput = "";
  }

  function removeAxis(a: string) {
    axes = axes.filter((x) => x !== a);
  }

  async function handleCreate() {
    if (!name.trim() || tiers.length === 0) return;
    const id = await createTierList(name, {
      description: description.trim() || null,
      scope,
      tiers,
      defaultAxes: axes,
    });
    oncreated?.(id);
    onclose();
  }

  const SCOPES: { value: TierScope; label: string }[] = [
    { value: "all", label: "Entire library" },
    { value: "finished", label: "Finished only" },
    { value: "in_progress", label: "Reading only" },
  ];
</script>

<Modal {onclose} label="New tier list">
  <h3>New tier list</h3>
  <p class="subtitle">
    Create as many lists as you like. Each keeps its own tiers, colors, and rankings.
  </p>

  <div class="field">
    <label class="label" for="ntl-name">Name</label>
    <input
      id="ntl-name"
      type="text"
      class="input"
      bind:value={name}
      placeholder="e.g. Fantasy — all-time"
      maxlength={100}
    />
  </div>

  <div class="field">
    <label class="label" for="ntl-desc">Description (optional)</label>
    <textarea
      id="ntl-desc"
      class="input area"
      bind:value={description}
      placeholder="Short note about this list"
      maxlength={500}
    ></textarea>
  </div>

  <div class="field">
    <span class="label">Starting tiers</span>
    <div class="tier-row">
      {#each tiers as tier (tier.id)}
        <div class="tier-pill" style="--pill-bg: {tier.color};">
          <input
            class="pill-input"
            value={tier.label}
            oninput={(e: Event) => setLabel(tier.id, (e.target as HTMLInputElement).value)}
            maxlength={8}
          />
          <button class="pill-swatch" onclick={() => cycleColor(tier.id)} title="Change color" aria-label="Change color"></button>
          <button class="pill-remove" onclick={() => removeTierPill(tier.id)} aria-label="Remove tier">×</button>
        </div>
      {/each}
      <button class="add-pill" onclick={addTierPill}>+ Add tier</button>
    </div>
    <div class="templates-row">
      <span class="templates-label">Templates</span>
      {#each TIER_TEMPLATES as tpl}
        <button class="template-link" onclick={() => applyTemplate(tpl.id)}>{tpl.name}</button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span class="label">Default axes</span>
    <p class="axis-hint">Seeded when you rank a book in this list. Rename freely later.</p>
    <div class="axes-row">
      {#each axes as a}
        <span class="axis-chip">
          {a}
          <button class="chip-x" onclick={() => removeAxis(a)} aria-label="Remove axis">×</button>
        </span>
      {/each}
      <input
        type="text"
        class="axis-input"
        bind:value={newAxisInput}
        placeholder="add axis + Enter"
        onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); addAxis(); } }}
        maxlength={40}
      />
    </div>
  </div>

  <div class="field">
    <span class="label">Scope</span>
    <div class="scope-row">
      {#each SCOPES as s}
        <button
          class="scope-chip"
          class:active={scope === s.value}
          onclick={() => (scope = s.value)}
        >
          {s.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="dialog-actions">
    <button class="btn-ghost" onclick={onclose}>Cancel</button>
    <button class="btn-primary" onclick={handleCreate} disabled={!name.trim() || tiers.length === 0}>
      Create list
    </button>
  </div>
</Modal>

<style>
  h3 {
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
    font-weight: 500;
    margin-bottom: 0.2rem;
  }

  .subtitle {
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
    margin-bottom: var(--spacing-md);
    line-height: 1.4;
  }

  .field { margin-bottom: var(--spacing-md); }

  .label {
    display: block;
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-variant);
    margin-bottom: 0.3rem;
  }

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
  }

  .input:focus {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 25%, transparent);
  }

  .input.area {
    min-height: 2.5rem;
    resize: vertical;
  }

  .tier-row {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .tier-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.25rem 0.4rem;
    background: var(--pill-bg);
    color: #1a0f0d;
    border-radius: var(--radius-md);
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.85rem;
  }

  .pill-input {
    background: transparent;
    border: none;
    outline: none;
    color: #1a0f0d;
    font: inherit;
    font-weight: 700;
    text-align: center;
    width: 2.5rem;
    padding: 0;
  }

  .pill-swatch {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.25);
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .pill-remove {
    background: none;
    border: none;
    color: #1a0f0d;
    opacity: 0.5;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0 0.1rem;
  }

  .pill-remove:hover { opacity: 1; }

  .add-pill {
    padding: 0.3rem 0.6rem;
    background: transparent;
    border: 1px dashed var(--color-outline-variant);
    color: var(--color-text-variant);
    border-radius: var(--radius-md);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    cursor: pointer;
  }

  .add-pill:hover {
    background: var(--color-surface-high);
  }

  .templates-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
    align-items: center;
  }

  .templates-label {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-outline);
    margin-right: 0.25rem;
  }

  .template-link {
    background: none;
    border: none;
    color: var(--color-primary);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    cursor: pointer;
    padding: 0;
  }

  .template-link:hover { text-decoration: underline; }

  .axis-hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
    margin-bottom: 0.4rem;
    line-height: 1.4;
  }

  .axes-row {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
    align-items: center;
    background: var(--color-surface-high);
    border-radius: var(--radius-md);
    padding: 0.4rem;
  }

  .axis-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.2rem 0.5rem;
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
    color: var(--color-primary);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-weight: 500;
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

  .axis-input {
    flex: 1;
    min-width: 6rem;
    background: transparent;
    border: none;
    outline: none;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
  }

  .scope-row {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  .scope-chip {
    padding: 0.35rem 0.7rem;
    background: transparent;
    border: 1px solid var(--color-outline-variant);
    color: var(--color-text-variant);
    border-radius: var(--radius-md);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    cursor: pointer;
  }

  .scope-chip:hover { background: var(--color-surface-high); }

  .scope-chip.active {
    background: color-mix(in srgb, var(--color-primary) 18%, transparent);
    color: var(--color-primary);
    border-color: transparent;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-lg);
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
</style>
