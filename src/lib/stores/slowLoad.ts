import { derived, readable } from "svelte/store";
import { audioStore } from "./audioStore";

/**
 * True once a load has been running long enough to deserve an explanation.
 *
 * M4B files with the moov atom at the end make the player issue a long run of
 * range requests before any audio can start, which on a large file reads as a
 * hang. Anything under this threshold is not worth a message.
 */
export const SLOW_LOAD_MS = 800;

/** Ticks while a load is in flight so the derived value can cross the threshold. */
const tick = readable(0, (set) => {
  let n = 0;
  const id = setInterval(() => set(++n), 200);
  return () => clearInterval(id);
});

let loadingSince: number | null = null;

export const slowLoad = derived([audioStore, tick], ([$audio]) => {
  if (!$audio.loading) {
    loadingSince = null;
    return false;
  }
  if (loadingSince === null) loadingSince = Date.now();
  return Date.now() - loadingSince >= SLOW_LOAD_MS;
});
