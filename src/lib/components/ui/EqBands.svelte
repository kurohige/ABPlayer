<script lang="ts">
  /**
   * The three EQ bands plus per-book gain, without a dialog around them, so
   * the Library's continue card and the Player's control tile can both open
   * them in a Panel. Rows rise with a 40ms stagger (handoff motion #4).
   *
   * Presets sit above the bands: the built-ins, then the user's own, the one
   * the bands currently match shown selected. "Save" keeps the current bands
   * under a name; the user's presets can be removed again.
   */
  import { audioStore, setEq, setBookGain, applyEqPreset } from "../../stores/audioStore";
  import { userdataStore, setPreference } from "../../stores/userdataStore";
  import {
    BUILT_IN_EQ_PRESETS,
    MAX_PRESET_NAME,
    MAX_USER_PRESETS,
    findPreset,
    isBuiltInName,
    withPreset,
    withoutPreset,
  } from "../../utils/eqPresets";
  import Pill from "./Pill.svelte";

  const BANDS: Array<{ band: "bass" | "mid" | "treble"; label: string }> = [
    { band: "bass", label: "Bass" },
    { band: "mid", label: "Mid" },
    { band: "treble", label: "Treble" },
  ];
  const STAGGER_MS = 40;

  let values = $derived({
    bass: $audioStore.eqBass,
    mid: $audioStore.eqMid,
    treble: $audioStore.eqTreble,
  });

  let userPresets = $derived($userdataStore.preferences.eqPresets);
  let current = $derived(findPreset(userPresets, values));
  let dirty = $derived(values.bass !== 0 || values.mid !== 0 || values.treble !== 0);

  let naming = $state(false);
  let draftName = $state("");
  let nameInput = $state<HTMLInputElement | null>(null);

  let draftTrimmed = $derived(draftName.trim());
  let draftProblem = $derived.by(() => {
    if (!draftTrimmed) return "";
    if (isBuiltInName(draftTrimmed)) return "That name is a built-in preset";
    const exists = userPresets.some((p) => p.name.toLowerCase() === draftTrimmed.toLowerCase());
    if (!exists && userPresets.length >= MAX_USER_PRESETS) return `Up to ${MAX_USER_PRESETS} presets`;
    return "";
  });

  function reset() {
    applyEqPreset(BUILT_IN_EQ_PRESETS[0]);
  }

  function startNaming() {
    draftName = current && !isBuiltInName(current.name) ? current.name : "";
    naming = true;
    queueMicrotask(() => nameInput?.focus());
  }

  async function savePreset() {
    if (!draftTrimmed || draftProblem) return;
    const preset = { name: draftTrimmed, ...values };
    await setPreference("eqPresets", withPreset(userPresets, preset));
    naming = false;
  }

  async function removePreset(name: string) {
    await setPreference("eqPresets", withoutPreset(userPresets, name));
  }

  function onNameKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void savePreset();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      naming = false;
    }
  }
</script>

<div class="eqb">
  <div class="eqb-head">
    <span class="eqb-title">Equalizer</span>
    <span class="eqb-actions">
      <button class="eqb-link" onclick={startNaming} disabled={naming}>Save</button>
      <button class="eqb-link" disabled={!dirty} onclick={reset}>Reset</button>
    </span>
  </div>

  <div class="eqb-presets" role="group" aria-label="Presets">
    {#each BUILT_IN_EQ_PRESETS as p (p.name)}
      <Pill
        label={p.name}
        height="1.65rem"
        selected={current?.name === p.name}
        onclick={() => applyEqPreset(p)}
      />
    {/each}
    {#each userPresets as p (p.name)}
      <span class="eqb-user">
        <Pill
          label={p.name}
          height="1.65rem"
          selected={current?.name === p.name}
          onclick={() => applyEqPreset(p)}
        />
        <button
          class="eqb-remove"
          aria-label="Remove preset {p.name}"
          title="Remove preset"
          onclick={() => removePreset(p.name)}
        >
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </span>
    {/each}
  </div>

  {#if naming}
    <form class="eqb-name" onsubmit={(e) => { e.preventDefault(); void savePreset(); }}>
      <input
        class="eqb-name-input"
        type="text"
        placeholder="Preset name"
        maxlength={MAX_PRESET_NAME}
        aria-label="Preset name"
        aria-invalid={!!draftProblem}
        bind:value={draftName}
        bind:this={nameInput}
        onkeydown={onNameKey}
      />
      <button class="eqb-link" type="submit" disabled={!draftTrimmed || !!draftProblem}>Keep</button>
      <button class="eqb-link" type="button" onclick={() => (naming = false)}>Cancel</button>
    </form>
    {#if draftProblem}
      <p class="eqb-problem" role="alert">{draftProblem}</p>
    {/if}
  {/if}

  {#each BANDS as b, i (b.band)}
    <div class="eqb-row" style="animation-delay: {i * STAGGER_MS}ms;">
      <label class="eqb-label" for="eqb-{b.band}">{b.label}</label>
      <input
        id="eqb-{b.band}"
        class="eqb-slider"
        type="range"
        min="-12"
        max="12"
        step="1"
        value={values[b.band]}
        oninput={(e) => setEq(b.band, Number((e.currentTarget as HTMLInputElement).value))}
      />
      <span class="eqb-value mono">
        {values[b.band] > 0 ? "+" : ""}{values[b.band]}
      </span>
    </div>
  {/each}

  <div class="eqb-row" style="animation-delay: {BANDS.length * STAGGER_MS}ms;">
    <label class="eqb-label" for="eqb-gain">Gain</label>
    <input
      id="eqb-gain"
      class="eqb-slider"
      type="range"
      min="-6"
      max="12"
      step="1"
      value={$audioStore.bookGainDb}
      oninput={(e) => setBookGain(Number((e.currentTarget as HTMLInputElement).value))}
    />
    <span class="eqb-value mono">
      {$audioStore.bookGainDb > 0 ? "+" : ""}{$audioStore.bookGainDb}
    </span>
  </div>

  <p class="eqb-hint">Bands and presets are remembered between sessions. Gain is per book.</p>
</div>

<style>
  .eqb {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    min-width: 0;
  }

  .eqb-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
  }

  .eqb-title {
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.66rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-outline);
  }

  .eqb-actions {
    display: inline-flex;
    gap: 0.7rem;
  }

  .eqb-link {
    padding: 0;
    background: none;
    border: none;
    color: var(--color-text-variant);
    font-family: var(--font-label);
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
  }

  .eqb-link:hover:not(:disabled) {
    color: var(--color-text);
  }

  .eqb-link:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .eqb-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.28rem;
  }

  .eqb-user {
    position: relative;
    display: inline-flex;
  }

  /* The remove control sits on the chip's corner and shows on hover/focus */
  .eqb-remove {
    position: absolute;
    top: -0.3rem;
    right: -0.3rem;
    width: 1rem;
    height: 1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-outline-variant);
    border-radius: 50%;
    color: var(--color-text-variant);
    cursor: pointer;
    opacity: 0;
    transition: opacity var(--motion-fast) ease;
  }

  .eqb-user:hover .eqb-remove,
  .eqb-remove:focus-visible {
    opacity: 1;
  }

  .eqb-remove .material-symbols-outlined {
    font-size: 0.7rem;
  }

  .eqb-name {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }

  .eqb-name-input {
    flex: 1;
    min-width: 0;
    height: 1.8rem;
    padding: 0 0.55rem;
    background: var(--color-bg);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: 0.76rem;
  }

  .eqb-name-input:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: -1px;
  }

  .eqb-problem {
    margin: -0.28rem 0 0;
    font-family: var(--font-body);
    font-size: 0.66rem;
    color: var(--color-error);
  }

  .eqb-row {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    animation: ab-rise var(--motion-rise) var(--ease-out) both;
  }

  .eqb-label {
    width: 2.9rem;
    flex-shrink: 0;
    font-family: var(--font-label);
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .eqb-slider {
    flex: 1;
    min-width: 0;
    accent-color: var(--color-primary);
  }

  .eqb-value {
    width: 2rem;
    flex-shrink: 0;
    font-size: 0.73rem;
    font-weight: 700;
    text-align: right;
    color: var(--color-text-variant);
  }

  .eqb-hint {
    margin: 0.14rem 0 0;
    font-family: var(--font-body);
    font-size: 0.66rem;
    line-height: 1.4;
    color: var(--color-outline);
  }
</style>
