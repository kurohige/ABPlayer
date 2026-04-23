<script lang="ts">
  import { audioStore, setEq, setBookGain } from "../stores/audioStore";
  import Modal from "./Modal.svelte";

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  function handleEq(band: "bass" | "mid" | "treble", e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    setEq(band, val);
  }

  function resetEq() {
    setEq("bass", 0);
    setEq("mid", 0);
    setEq("treble", 0);
  }

  function handleGain(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    setBookGain(val);
  }
</script>

<Modal {onclose} label="Equalizer" variant="bottom">
    <div class="eq-header">
      <h3>Equalizer</h3>
      <button class="eq-reset" onclick={resetEq}>Reset</button>
    </div>

    <div class="eq-bands">
      <div class="eq-band">
        <label class="eq-label" for="eq-bass">Bass</label>
        <input
          id="eq-bass"
          type="range"
          class="eq-slider"
          min="-12"
          max="12"
          step="1"
          value={$audioStore.eqBass}
          oninput={(e) => handleEq("bass", e)}
        />
        <span class="eq-value">{$audioStore.eqBass > 0 ? "+" : ""}{$audioStore.eqBass}dB</span>
      </div>
      <div class="eq-band">
        <label class="eq-label" for="eq-mid">Mid</label>
        <input
          id="eq-mid"
          type="range"
          class="eq-slider"
          min="-12"
          max="12"
          step="1"
          value={$audioStore.eqMid}
          oninput={(e) => handleEq("mid", e)}
        />
        <span class="eq-value">{$audioStore.eqMid > 0 ? "+" : ""}{$audioStore.eqMid}dB</span>
      </div>
      <div class="eq-band">
        <label class="eq-label" for="eq-treble">Treble</label>
        <input
          id="eq-treble"
          type="range"
          class="eq-slider"
          min="-12"
          max="12"
          step="1"
          value={$audioStore.eqTreble}
          oninput={(e) => handleEq("treble", e)}
        />
        <span class="eq-value">{$audioStore.eqTreble > 0 ? "+" : ""}{$audioStore.eqTreble}dB</span>
      </div>
    </div>

    {#if $audioStore.currentBook}
      <div class="eq-divider"></div>
      <div class="eq-band">
        <label class="eq-label" for="eq-gain">Book Volume</label>
        <input
          id="eq-gain"
          type="range"
          class="eq-slider"
          min="-12"
          max="12"
          step="1"
          value={$audioStore.bookGainDb}
          oninput={handleGain}
        />
        <span class="eq-value">{$audioStore.bookGainDb > 0 ? "+" : ""}{$audioStore.bookGainDb}dB</span>
      </div>
    {/if}
</Modal>

<style>
  .eq-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-md);
  }

  h3 {
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
    font-weight: 500;
  }

  .eq-reset {
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text-variant);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    padding: 4px 10px;
    border-radius: var(--radius-xl);
    cursor: pointer;
  }

  .eq-reset:hover {
    background: var(--color-surface-highest);
  }

  .eq-bands {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .eq-band {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .eq-label {
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text-variant);
    min-width: 70px;
  }

  .eq-slider {
    -webkit-appearance: none;
    appearance: none;
    flex: 1;
    height: 3px;
    background: var(--color-surface-highest);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .eq-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--color-primary);
    cursor: pointer;
    border: none;
  }

  .eq-value {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-outline);
    min-width: 40px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .eq-divider {
    height: 1px;
    background: var(--color-outline-variant);
    opacity: 0.3;
    margin: var(--spacing-md) 0;
  }
</style>
