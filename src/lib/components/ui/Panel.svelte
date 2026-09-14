<script lang="ts">
  /**
   * Anchored popover: frame + overlay shadow, opening from its trigger corner
   * (handoff motion #4). Closes on outside pointerdown, Escape, scroll or
   * resize — the same contract every menu in the app already follows.
   *
   * The caller positions it; `origin` only picks the transform origin so the
   * open animation grows out of the right corner.
   */
  import type { Snippet } from "svelte";

  interface Props {
    label: string;
    /** Which corner the panel grows from. */
    origin?: "top left" | "top right" | "bottom left" | "bottom right" | "bottom center";
    width?: string;
    /** Menu padding (6px) vs slider padding (14px) in the handoff. */
    pad?: string;
    /** Inline position, e.g. "top: 2.5rem; left: 0;". */
    style?: string;
    onclose: () => void;
    children: Snippet;
  }

  let {
    label,
    origin = "top left",
    width = "11.7rem",
    pad = "0.42rem",
    style = "",
    onclose,
    children,
  }: Props = $props();

  let el = $state<HTMLDivElement | null>(null);

  function outside(target: EventTarget | null): boolean {
    return !!el && !(target instanceof Node && el.contains(target));
  }

  function onPointerDown(e: PointerEvent) {
    if (outside(e.target)) onclose();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onclose();
    }
  }

  function onScroll(e: Event) {
    if (outside(e.target)) onclose();
  }
</script>

<svelte:window
  onpointerdown={onPointerDown}
  onkeydown={onKeydown}
  onresize={onclose}
  onscrollcapture={onScroll}
/>

<div
  class="ab-panel"
  role="group"
  aria-label={label}
  bind:this={el}
  style="--w: {width}; --pad: {pad}; transform-origin: {origin}; {style}"
>
  {@render children()}
</div>

<style>
  .ab-panel {
    position: absolute;
    z-index: 30;
    width: var(--w);
    padding: var(--pad);
    background: var(--color-bg);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-panel);
    animation: ab-panel var(--motion-panel) var(--ease-out) both;
  }
</style>
