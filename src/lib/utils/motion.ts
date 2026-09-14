/**
 * Reduced motion, as one question the whole app asks the same way.
 *
 * `data-reduce-motion="on"` is stamped on the root by App.svelte from either
 * the OS setting or Settings → Reduce motion; app.css zeroes the motion
 * tokens under it, and scripted motion (the cover flight, scrollIntoView)
 * checks here.
 */
export function motionReduced(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-reduce-motion") === "on";
}
