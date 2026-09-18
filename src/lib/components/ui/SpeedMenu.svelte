<script lang="ts">
  /**
   * Playback speed picker. The whole ladder in one panel, with a check on the
   * current speed — clicking through eight steps to reach 2.5× was the thing
   * this replaces.
   *
   * The caller owns the anchor and the open state, exactly like the sleep and
   * equalizer panels next to it.
   */
  import { audioStore, setSpeed } from "../../stores/audioStore";
  import { formatSpeed, speedOptions } from "../../utils/speed";
  import Panel from "./Panel.svelte";

  interface Props {
    origin?: "top left" | "top right" | "bottom left" | "bottom right" | "bottom center";
    width?: string;
    /** Inline position for the panel, e.g. "bottom: 2.5rem; left: 0;". */
    style?: string;
    onclose: () => void;
  }

  let { origin = "bottom left", width = "9.7rem", style = "", onclose }: Props = $props();

  let current = $derived($audioStore.speed);
  let options = $derived(speedOptions(current));

  function pick(speed: number) {
    setSpeed(speed);
    onclose();
  }
</script>

<Panel label="Playback speed" {origin} {width} {style} {onclose}>
  <div class="sm" role="menu" aria-label="Playback speed">
    {#each options as speed, i (speed)}
      <button
        class="sm-item"
        class:current={speed === current}
        role="menuitemradio"
        aria-checked={speed === current}
        style="animation-delay: calc(var(--motion-stagger) * {i});"
        onclick={() => pick(speed)}
      >
        <span class="sm-check material-symbols-outlined" aria-hidden="true">
          {speed === current ? "check" : ""}
        </span>
        <span class="sm-value mono">{formatSpeed(speed)}</span>
        {#if speed === 1}<span class="sm-note">Normal</span>{/if}
      </button>
    {/each}
  </div>
</Panel>

<style>
  .sm {
    display: flex;
    flex-direction: column;
  }

  .sm-item {
    display: flex;
    align-items: center;
    gap: 0.42rem;
    width: 100%;
    height: 2.1rem;
    padding: 0 0.55rem;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: 0.76rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    animation: ab-rise var(--motion-rise) var(--ease-out) both;
  }

  .sm-item:hover {
    background: var(--color-surface-high);
  }

  .sm-item:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }

  .sm-item.current {
    font-weight: 700;
  }

  .sm-check {
    width: 1.05rem;
    font-size: 1.05rem;
    color: var(--color-text-variant);
    flex-shrink: 0;
  }

  .sm-value {
    font-size: 0.76rem;
    font-weight: inherit;
  }

  .sm-note {
    margin-left: auto;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--color-outline);
  }
</style>
