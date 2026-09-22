/**
 * Shared-element open (handoff motion #3): the cover appears to fly from the
 * library tile into the player hero.
 *
 * The two ends live in different views, so the source publishes its rect here
 * and the destination claims it when it mounts. A pending flight is dropped
 * after PENDING_TTL_MS so a stale rect can never animate into a later,
 * unrelated navigation.
 */

import { motionReduced } from "./motion";

export interface FlightSource {
  /** Viewport rect of the tile's cover at the moment of the click. */
  rect: { top: number; left: number; width: number; height: number };
  /** Resolved cover URL, or null for the placeholder. */
  src: string | null;
  /** Which book, so the destination only claims its own flight. */
  filePath: string;
  at: number;
}

export const FLIGHT_MS = 460;
export const FLIGHT_EASE = "cubic-bezier(0.2, 0.85, 0.2, 1)";
/** A pending flight older than this is stale — the view never opened. */
export const PENDING_TTL_MS = 1200;

let pending: FlightSource | null = null;

/** Called by the library tile. Records where the cover was. */
export function startFlight(el: Element | null, src: string | null, filePath: string): void {
  if (!el) {
    pending = null;
    return;
  }
  const r = el.getBoundingClientRect();
  pending = {
    rect: { top: r.top, left: r.left, width: r.width, height: r.height },
    src,
    filePath,
    at: Date.now(),
  };
}

/**
 * Called by the destination. Returns the pending flight once, and only if it
 * is for this book and still fresh.
 */
export function claimFlight(filePath: string): FlightSource | null {
  const p = pending;
  pending = null;
  if (!p || p.filePath !== filePath) return null;
  if (Date.now() - p.at > PENDING_TTL_MS) return null;
  return p;
}

/** Forget any pending flight (navigation cancelled, reduced motion). */
export function clearFlight(): void {
  pending = null;
}

/**
 * Animate a clone of the cover from `from` to the live `target` element.
 * Resolves when the clone has been removed. A no-op under reduced motion.
 */
export function runFlight(from: FlightSource, target: Element | null): Promise<void> {
  if (!target || motionReduced() || typeof document === "undefined") return Promise.resolve();

  const to = target.getBoundingClientRect();
  if (to.width === 0 || from.rect.width === 0) return Promise.resolve();

  const ghost = document.createElement("div");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.cssText = [
    "position:fixed",
    "z-index:9999",
    "pointer-events:none",
    "box-sizing:border-box",
    "border:1px solid var(--color-outline-variant)",
    "border-radius:var(--radius-md)",
    "overflow:hidden",
    "background:var(--color-surface-high)",
    `top:${from.rect.top}px`,
    `left:${from.rect.left}px`,
    `width:${from.rect.width}px`,
    `height:${from.rect.height}px`,
    "transform-origin:top left",
    "will-change:transform",
  ].join(";");

  if (from.src) {
    const img = document.createElement("img");
    img.src = from.src;
    img.alt = "";
    img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block";
    ghost.appendChild(img);
  }

  document.body.appendChild(ghost);

  const dx = to.left - from.rect.left;
  const dy = to.top - from.rect.top;
  const scale = to.width / from.rect.width;

  return new Promise((resolve) => {
    const done = () => {
      ghost.remove();
      resolve();
    };
    // Guarantee cleanup even if the animation never fires (tab hidden, etc.)
    const guard = setTimeout(done, FLIGHT_MS + 200);
    const anim = ghost.animate(
      [
        { transform: "translate(0px, 0px) scale(1)" },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
      ],
      { duration: FLIGHT_MS, easing: FLIGHT_EASE, fill: "forwards" },
    );
    anim.onfinish = () => {
      clearTimeout(guard);
      done();
    };
    anim.oncancel = () => {
      clearTimeout(guard);
      done();
    };
  });
}
