/**
 * Geometry for the transport morph (UI refresh, motion #1).
 *
 * Play and pause are both drawn as two 4-point subpaths on a 24×24 viewBox, so
 * the two glyphs interpolate point-by-point instead of being swapped. Kept out
 * of the component so the endpoints and the easing can be unit tested.
 */

/** m = 1 — the pause glyph: two vertical bars. */
export const PAUSE_PTS: ReadonlyArray<readonly [number, number]> = [
  [7, 5], [10, 5], [10, 19], [7, 19],
  [14, 5], [17, 5], [17, 19], [14, 19],
];

/** m = 0 — the play glyph: the same eight points collapsed into a triangle. */
export const PLAY_PTS: ReadonlyArray<readonly [number, number]> = [
  [7, 5], [13, 8.5], [13, 15.5], [7, 19],
  [13, 8.5], [19, 12], [19, 12], [13, 15.5],
];

/** Morph duration in ms. */
export const MORPH_MS = 260;

/**
 * Deadline after which the glyph is snapped to its target. Slightly longer than
 * the animation: if rAF is starved (background window, heavy load) the morph
 * must still land, or a paused player can be left showing a pause glyph.
 */
export const MORPH_SNAP_MS = 320;

/**
 * Clamp to 0-1. A non-finite input resolves to 0 (the play glyph, the safe
 * resting shape) rather than propagating NaN into the path data.
 */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Cubic ease-in-out, matching the prototype. */
export function easeInOutCubic(k: number): number {
  const t = clamp01(k);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function subpath(pts: Array<[number, number]>): string {
  const [a, b, c, d] = pts;
  return (
    `M${a[0].toFixed(2)} ${a[1].toFixed(2)}` +
    ` L${b[0].toFixed(2)} ${b[1].toFixed(2)}` +
    ` L${c[0].toFixed(2)} ${c[1].toFixed(2)}` +
    ` L${d[0].toFixed(2)} ${d[1].toFixed(2)} Z`
  );
}

/**
 * SVG path `d` for a morph position: 0 is play, 1 is pause. Values outside the
 * range are clamped so a mid-flight state update can never produce a bad shape.
 */
export function playGlyphPath(m: number): string {
  const k = clamp01(m);
  const pts = PAUSE_PTS.map((q, i) => [
    PLAY_PTS[i][0] + (q[0] - PLAY_PTS[i][0]) * k,
    PLAY_PTS[i][1] + (q[1] - PLAY_PTS[i][1]) * k,
  ]) as Array<[number, number]>;
  return `${subpath(pts.slice(0, 4))} ${subpath(pts.slice(4))}`;
}
