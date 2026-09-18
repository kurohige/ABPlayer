/**
 * Pointer-event drag-and-drop for in-app moves: book covers into tier rows
 * and the unranked pool, book cards onto collection chips.
 *
 * Why not HTML5 drag-and-drop: on Windows, Tauri's native drag-drop handler
 * (window `dragDropEnabled`, which the Library relies on to accept folders
 * dropped from Explorer) swaps the WebView2 drop target for one that only
 * understands OS file lists. An in-page HTML5 drag carries no file list, so
 * the page never receives `dragover` / `drop`. Pointer events never leave the
 * page and therefore work with that handler enabled, on every platform.
 *
 * Usage:
 *   <button use:bookDragSource={{ payload: { filePath } }}>…</button>
 *   <div use:bookDropZone={{ onover: (o) => (over = o), ondrop: (p) => add(p.filePath) }}>…</div>
 *
 * A press only becomes a drag after the pointer travels DRAG_THRESHOLD_PX, so
 * clicks and double-clicks on the same element keep working. A ghost copy of
 * the source follows the pointer and drop zones are found by hit-testing
 * under it. The click the browser fires after a completed drag is swallowed
 * so a drop never also triggers the source's click handler.
 */
import type { Action } from "svelte/action";

export interface DragPayload {
  filePath: string;
}

export interface DragSourceParams {
  payload: DragPayload;
  /** false renders the element without drag behaviour (read-only previews). */
  enabled?: boolean;
}

export interface DropZoneParams {
  ondrop: (payload: DragPayload) => void;
  /** true when a drag enters the zone; false when it leaves or the drag ends. */
  onover?: (active: boolean) => void;
}

/** Distance (px) the pointer must travel before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 6;
/** Added to <body> while a drag is in progress; cursor + user-select rules live in App.svelte. */
export const DRAGGING_CLASS = "ab-dragging";

const ZONE_ATTR = "data-drop-zone";
const zones = new Map<Element, DropZoneParams>();

interface ActiveDrag {
  payload: DragPayload;
  source: HTMLElement;
  ghost: HTMLElement;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  lastX: number;
  lastY: number;
  zone: Element | null;
}

let active: ActiveDrag | null = null;

/** True while a pointer drag is in progress. */
export function isDragging(): boolean {
  return active !== null;
}

function zoneAt(x: number, y: number): Element | null {
  const el = document.elementFromPoint(x, y);
  return el ? el.closest(`[${ZONE_ATTR}]`) : null;
}

function setZone(next: Element | null): void {
  if (!active || active.zone === next) return;
  if (active.zone) zones.get(active.zone)?.onover?.(false);
  active.zone = next;
  if (next) zones.get(next)?.onover?.(true);
}

function moveGhost(x: number, y: number): void {
  if (!active) return;
  active.lastX = x;
  active.lastY = y;
  active.ghost.style.transform = `translate(${x - active.offsetX}px, ${y - active.offsetY}px)`;
}

function makeGhost(source: HTMLElement, rect: DOMRect): HTMLElement {
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("data-drag-ghost", "");
  ghost.style.cssText =
    "position:fixed;left:0;top:0;margin:0;pointer-events:none;z-index:10000;" +
    "opacity:0.85;box-sizing:border-box;will-change:transform;" +
    `width:${rect.width}px;height:${rect.height}px;`;
  document.body.appendChild(ghost);
  return ghost;
}

function onDragMove(e: PointerEvent): void {
  if (!active || e.pointerId !== active.pointerId) return;
  moveGhost(e.clientX, e.clientY);
  setZone(zoneAt(e.clientX, e.clientY));
}

function onDragUp(e: PointerEvent): void {
  if (!active || e.pointerId !== active.pointerId) return;
  finish(true);
}

function onDragCancel(): void {
  finish(false);
}

function onDragKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.preventDefault();
    finish(false);
  }
}

/** Wheel-scrolling with the pointer held still moves the zones under it: re-test at the last position. */
function onDragScroll(): void {
  if (active) setZone(zoneAt(active.lastX, active.lastY));
}

function swallowClick(e: MouseEvent): void {
  e.stopPropagation();
  e.preventDefault();
}

function beginDrag(
  source: HTMLElement,
  payload: DragPayload,
  e: PointerEvent,
  pressX: number,
  pressY: number,
): void {
  const rect = source.getBoundingClientRect();
  active = {
    payload,
    source,
    ghost: makeGhost(source, rect),
    pointerId: e.pointerId,
    offsetX: pressX - rect.left,
    offsetY: pressY - rect.top,
    lastX: e.clientX,
    lastY: e.clientY,
    zone: null,
  };
  document.body.classList.add(DRAGGING_CLASS);
  window.addEventListener("pointermove", onDragMove, true);
  window.addEventListener("pointerup", onDragUp, true);
  window.addEventListener("pointercancel", onDragCancel, true);
  window.addEventListener("keydown", onDragKey, true);
  window.addEventListener("blur", onDragCancel);
  window.addEventListener("scroll", onDragScroll, true);
  moveGhost(e.clientX, e.clientY);
  setZone(zoneAt(e.clientX, e.clientY));
}

function finish(drop: boolean): void {
  if (!active) return;
  const { zone, payload, ghost } = active;
  setZone(null);
  ghost.remove();
  document.body.classList.remove(DRAGGING_CLASS);
  window.removeEventListener("pointermove", onDragMove, true);
  window.removeEventListener("pointerup", onDragUp, true);
  window.removeEventListener("pointercancel", onDragCancel, true);
  window.removeEventListener("keydown", onDragKey, true);
  window.removeEventListener("blur", onDragCancel);
  window.removeEventListener("scroll", onDragScroll, true);
  active = null;
  if (!drop) return;
  // The browser dispatches a click right after this pointerup; it must not reach the source.
  window.addEventListener("click", swallowClick, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", swallowClick, true), 0);
  if (zone) zones.get(zone)?.ondrop(payload);
}

/**
 * Makes an element a drag source. A primary-button press without modifier
 * keys arms it; the drag starts once the pointer moves DRAG_THRESHOLD_PX.
 */
export const bookDragSource: Action<HTMLElement, DragSourceParams> = (node, params) => {
  let current = params;
  let press: { x: number; y: number; pointerId: number } | null = null;

  function clearPress(): void {
    press = null;
    window.removeEventListener("pointermove", onPressMove, true);
    window.removeEventListener("pointerup", onPressEnd, true);
    window.removeEventListener("pointercancel", onPressEnd, true);
  }

  function onPointerDown(e: PointerEvent): void {
    if (current.enabled === false || active || press) return;
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    press = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    window.addEventListener("pointermove", onPressMove, true);
    window.addEventListener("pointerup", onPressEnd, true);
    window.addEventListener("pointercancel", onPressEnd, true);
  }

  function onPressMove(e: PointerEvent): void {
    if (!press || e.pointerId !== press.pointerId) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD_PX) return;
    const { x, y } = press;
    clearPress();
    beginDrag(node, current.payload, e, x, y);
  }

  function onPressEnd(e: PointerEvent): void {
    if (press && e.pointerId === press.pointerId) clearPress();
  }

  /** Images inside the source are natively draggable and would start an HTML5 drag instead. */
  function blockNativeDrag(e: Event): void {
    e.preventDefault();
  }

  node.addEventListener("pointerdown", onPointerDown);
  node.addEventListener("dragstart", blockNativeDrag);

  return {
    update(next: DragSourceParams) {
      current = next;
    },
    destroy() {
      clearPress();
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("dragstart", blockNativeDrag);
      if (active?.source === node) finish(false);
    },
  };
};

/** Makes an element a drop zone for `bookDragSource` drags. */
export const bookDropZone: Action<HTMLElement, DropZoneParams> = (node, params) => {
  node.setAttribute(ZONE_ATTR, "");
  zones.set(node, params);

  return {
    update(next: DropZoneParams) {
      zones.set(node, next);
    },
    destroy() {
      if (active?.zone === node) setZone(null);
      zones.delete(node);
      node.removeAttribute(ZONE_ATTR);
    },
  };
};
