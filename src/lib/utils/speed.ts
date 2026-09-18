/**
 * Playback speeds, shared by the player tile and the Library's continue card.
 *
 * The ladder used to be walked one step per click, which is a lot of clicking
 * to get from 1× to 2.5×; both places now open the whole list at once.
 */

/** The presets offered in the speed menu, slowest first. */
export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

/** "1.5×" — the mono value shown on the tile and the pill. */
export function formatSpeed(speed: number): string {
  return `${speed}×`;
}

/**
 * The presets, plus the current speed if it came from an older build (or a
 * remembered setting) and is not one of them — so the menu can always show a
 * check next to where you actually are.
 */
export function speedOptions(current: number): number[] {
  if (!Number.isFinite(current) || current <= 0 || SPEEDS.includes(current)) return SPEEDS;
  return [...SPEEDS, current].sort((a, b) => a - b);
}
