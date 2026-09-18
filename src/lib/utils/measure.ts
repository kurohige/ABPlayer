/**
 * Layout thresholds in root-ems, measured rather than media-queried.
 *
 * The root font-size scales with the window and the font-size preference, so
 * a breakpoint has to be re-evaluated whenever the element or the root font
 * resizes. Used where the size that changes is a component prop (a play
 * button's `size`, which row a panel renders in), which a container query
 * cannot set.
 */

/** The root font-size in px, i.e. what `1rem` is right now. */
export function remPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

export interface WatchBelowParams {
  /** Threshold in rem. */
  rem: number;
  /** Which side of the content box to compare; width unless said otherwise. */
  axis?: "width" | "height";
  /** Called with `true` while the node is below the threshold, `false` once it is not. */
  onchange: (below: boolean) => void;
}

/**
 * Svelte action: reports whether the node's content box is narrower (or
 * shorter) than `rem` root-ems, on mount and on every resize.
 */
export function watchBelow(node: Element, params: WatchBelowParams): { destroy: () => void } {
  let last: boolean | null = null;
  const ro = new ResizeObserver(([entry]) => {
    const size = params.axis === "height" ? entry.contentRect.height : entry.contentRect.width;
    const below = size < params.rem * remPx();
    if (below === last) return;
    last = below;
    params.onchange(below);
  });
  ro.observe(node);
  return { destroy: () => ro.disconnect() };
}
