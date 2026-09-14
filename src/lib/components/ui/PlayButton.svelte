<script lang="ts">
  /**
   * The transport button. One SVG path interpolates play↔pause over 260ms
   * rather than swapping two glyphs (handoff motion #1).
   *
   * The interpolation is an enhancement, never the source of truth: the state
   * is set first, and a fallback timer guarantees the glyph lands on its
   * target even if rAF is starved in a background window.
   */
  import { onDestroy, untrack } from "svelte";
  import {
    MORPH_MS,
    MORPH_SNAP_MS,
    easeInOutCubic,
    playGlyphPath,
  } from "../../utils/playGlyph";

  interface Props {
    playing: boolean;
    /** Shows a ring instead of the glyph while a file is being prepared. */
    loading?: boolean;
    /** 0–1; when set with `loading`, the ring is determinate. */
    loadProgress?: number | null;
    label?: string;
    /** Diameter in rem: 32/34/42/52/64px → 2.2/2.4/2.9/3.6/4.4rem. */
    size?: string;
    disabled?: boolean;
    class?: string;
    onclick?: (e: MouseEvent) => void;
  }

  let {
    playing,
    loading = false,
    loadProgress = null,
    label = "",
    size = "3.6rem",
    disabled = false,
    class: klass = "",
    onclick,
  }: Props = $props();


  // svelte-ignore state_referenced_locally — one-shot seed; the effect below drives it
  let m = $state(playing ? 1 : 0);
  let raf: number | null = null;
  let snap: ReturnType<typeof setTimeout> | null = null;

  function stop() {
    if (raf !== null) cancelAnimationFrame(raf);
    if (snap !== null) clearTimeout(snap);
    raf = null;
    snap = null;
  }

  function morphTo(target: number) {
    stop();
    const from = m;
    if (from === target) return;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / MORPH_MS);
      const e = easeInOutCubic(k);
      m = k < 1 ? from + (target - from) * e : target;
      raf = k < 1 ? requestAnimationFrame(step) : null;
    };
    raf = requestAnimationFrame(step);
    snap = setTimeout(() => {
      stop();
      m = target;
    }, MORPH_SNAP_MS);
  }

  // Only `playing` may re-run this. morphTo reads `m`, which changes on
  // every frame; tracked, each step would restart the morph and its snap
  // timer, and the glyph would never arrive.
  $effect(() => {
    const target = playing ? 1 : 0;
    untrack(() => morphTo(target));
  });

  onDestroy(stop);

  let d = $derived(playGlyphPath(m));
  let ariaLabel = $derived(label || (playing ? "Pause" : "Play"));
  /** Circumference of the r=10 ring in the 24×24 viewBox. */
  const RING = 2 * Math.PI * 10;
  let dash = $derived(
    loadProgress === null ? RING * 0.28 : RING * Math.max(0, Math.min(1, loadProgress)),
  );
</script>

<button
  type="button"
  class="ab-play {klass}"
  class:loading
  aria-label={ariaLabel}
  title={ariaLabel}
  {disabled}
  style="--size: {size};"
  {onclick}
>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {#if loading}
      <circle class="ring-track" cx="12" cy="12" r="10" />
      <circle
        class="ring"
        class:spin={loadProgress === null}
        cx="12"
        cy="12"
        r="10"
        stroke-dasharray="{dash} {RING}"
      />
    {:else}
      <path {d} fill="currentColor" />
    {/if}
  </svg>
</button>

<style>
  .ab-play {
    width: var(--size);
    height: var(--size);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: var(--color-ink);
    color: var(--color-on-ink);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition:
      transform var(--motion-press) var(--ease-out),
      box-shadow var(--motion-press) ease;
  }

  .ab-play:hover:not(:disabled) {
    transform: scale(1.06);
    box-shadow: var(--shadow-play);
  }

  .ab-play:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .ab-play:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
  }

  svg {
    width: calc(var(--size) * 0.46);
    height: calc(var(--size) * 0.46);
    overflow: visible;
  }

  .ring-track,
  .ring {
    fill: none;
    stroke-width: 2.4;
    transform-origin: 12px 12px;
  }

  .ring-track {
    stroke: currentColor;
    opacity: 0.22;
  }

  .ring {
    stroke: currentColor;
    stroke-linecap: round;
    transform: rotate(-90deg);
    transition: stroke-dasharray var(--motion-progress) ease-out;
  }

  /* Indeterminate: no known size yet, so the arc just spins */
  .ring.spin {
    animation: ab-spin var(--motion-spin) linear infinite;
  }
</style>
