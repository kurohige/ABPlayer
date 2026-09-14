// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionReturn } from "svelte/action";
import {
  bookDragSource,
  bookDropZone,
  isDragging,
  DRAG_THRESHOLD_PX,
  DRAGGING_CLASS,
  type DragSourceParams,
  type DropZoneParams,
} from "./pointerDrag";

/** What `document.elementFromPoint` reports as being under the pointer. */
let hovered: Element | null = null;

function pointer(target: EventTarget, type: string, x: number, y: number, init: PointerEventInit = {}) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      button: 0,
      ...init,
    }),
  );
}

interface Fixture {
  source: HTMLButtonElement;
  zone: HTMLDivElement;
  /** A child inside the zone: hit-testing must resolve it to the zone. */
  inner: HTMLSpanElement;
  click: ReturnType<typeof vi.fn>;
  onover: ReturnType<typeof vi.fn>;
  ondrop: ReturnType<typeof vi.fn>;
  destroy: () => void;
}

function setup(sourceParams?: Partial<DragSourceParams>): Fixture {
  document.body.innerHTML = "";
  const source = document.createElement("button");
  source.textContent = "cover";
  const zone = document.createElement("div");
  const inner = document.createElement("span");
  zone.appendChild(inner);
  document.body.append(source, zone);

  const click = vi.fn();
  source.addEventListener("click", click);
  const onover = vi.fn();
  const ondrop = vi.fn();

  const src = bookDragSource(source, {
    payload: { filePath: "C:/books/a.m4b" },
    ...sourceParams,
  }) as ActionReturn<DragSourceParams>;
  const zn = bookDropZone(zone, { onover, ondrop }) as ActionReturn<DropZoneParams>;

  return {
    source,
    zone,
    inner,
    click,
    onover,
    ondrop,
    destroy() {
      src.destroy?.();
      zn.destroy?.();
    },
  };
}

/** Press on the source and move far enough to start a drag. */
function startDrag(f: Fixture) {
  pointer(f.source, "pointerdown", 10, 10);
  pointer(f.source, "pointermove", 10 + DRAG_THRESHOLD_PX + 1, 10);
}

const ghost = () => document.querySelector("[data-drag-ghost]");

beforeEach(() => {
  hovered = null;
  document.elementFromPoint = vi.fn(() => hovered);
});

afterEach(async () => {
  // Any drag left running would leak window listeners into the next test.
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  // Let the zero-delay timer that removes the click-swallow listener run.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("bookDragSource / bookDropZone", () => {
  it("a press without movement stays a plain click", () => {
    const f = setup();
    pointer(f.source, "pointerdown", 10, 10);
    pointer(f.source, "pointermove", 12, 11);
    pointer(f.source, "pointerup", 12, 11);
    f.source.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(isDragging()).toBe(false);
    expect(ghost()).toBeNull();
    expect(f.click).toHaveBeenCalledTimes(1);
    f.destroy();
  });

  it("moving past the threshold starts a drag with a ghost and a body class", () => {
    const f = setup();
    startDrag(f);

    expect(isDragging()).toBe(true);
    expect(document.body.classList.contains(DRAGGING_CLASS)).toBe(true);
    const g = ghost() as HTMLElement;
    expect(g).not.toBeNull();
    expect(g.getAttribute("aria-hidden")).toBe("true");
    expect(g.style.pointerEvents).toBe("none");
    f.destroy();
  });

  it("hovering a zone's child highlights the zone and leaving clears it", () => {
    const f = setup();
    startDrag(f);

    hovered = f.inner;
    pointer(window, "pointermove", 50, 50);
    expect(f.onover).toHaveBeenLastCalledWith(true);

    hovered = document.body;
    pointer(window, "pointermove", 60, 60);
    expect(f.onover).toHaveBeenLastCalledWith(false);
    expect(f.onover).toHaveBeenCalledTimes(2);
    f.destroy();
  });

  it("releasing over a zone delivers the payload, cleans up and swallows the trailing click", () => {
    const f = setup();
    startDrag(f);
    hovered = f.inner;
    pointer(window, "pointermove", 50, 50);
    pointer(window, "pointerup", 50, 50);
    // The browser fires this click right after pointerup; it must not reach the source.
    f.source.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(f.ondrop).toHaveBeenCalledWith({ filePath: "C:/books/a.m4b" });
    expect(f.onover).toHaveBeenLastCalledWith(false);
    expect(isDragging()).toBe(false);
    expect(ghost()).toBeNull();
    expect(document.body.classList.contains(DRAGGING_CLASS)).toBe(false);
    expect(f.click).not.toHaveBeenCalled();
    f.destroy();
  });

  it("releasing outside any zone drops nothing", () => {
    const f = setup();
    startDrag(f);
    hovered = document.body;
    pointer(window, "pointermove", 50, 50);
    pointer(window, "pointerup", 50, 50);
    f.source.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(f.ondrop).not.toHaveBeenCalled();
    expect(isDragging()).toBe(false);
    expect(ghost()).toBeNull();
    // Even a drop on nothing was a drag, not a click on the source.
    expect(f.click).not.toHaveBeenCalled();
    f.destroy();
  });

  it("Escape cancels the drag without dropping", () => {
    const f = setup();
    startDrag(f);
    hovered = f.inner;
    pointer(window, "pointermove", 50, 50);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(f.ondrop).not.toHaveBeenCalled();
    expect(f.onover).toHaveBeenLastCalledWith(false);
    expect(isDragging()).toBe(false);
    expect(ghost()).toBeNull();
    f.destroy();
  });

  it("a later click still works after a cancelled drag", () => {
    const f = setup();
    startDrag(f);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    f.source.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(f.click).toHaveBeenCalledTimes(1);
    f.destroy();
  });

  it("a disabled source never drags", () => {
    const f = setup({ enabled: false });
    startDrag(f);

    expect(isDragging()).toBe(false);
    expect(ghost()).toBeNull();
    f.destroy();
  });

  it("presses with a modifier key or a secondary button never drag", () => {
    const f = setup();
    pointer(f.source, "pointerdown", 10, 10, { ctrlKey: true });
    pointer(f.source, "pointermove", 40, 40);
    expect(isDragging()).toBe(false);

    pointer(f.source, "pointerup", 40, 40);
    pointer(f.source, "pointerdown", 10, 10, { button: 2 });
    pointer(f.source, "pointermove", 40, 40);
    expect(isDragging()).toBe(false);
    f.destroy();
  });

  it("native image drags inside a source are blocked", () => {
    const f = setup();
    const ev = new Event("dragstart", { bubbles: true, cancelable: true });
    f.source.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    f.destroy();
  });

  it("destroying a hovered zone mid-drag clears its highlight", () => {
    const f = setup();
    startDrag(f);
    hovered = f.inner;
    pointer(window, "pointermove", 50, 50);
    expect(f.onover).toHaveBeenLastCalledWith(true);

    f.destroy();
    expect(f.onover).toHaveBeenLastCalledWith(false);
    expect(f.zone.hasAttribute("data-drop-zone")).toBe(false);
  });
});
