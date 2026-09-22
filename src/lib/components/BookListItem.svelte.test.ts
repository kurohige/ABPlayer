// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import BookListItem from "./BookListItem.svelte";
import type { BookMeta, Collection, UserBookData } from "../types";
import { defaultUserBookData, userdataStore } from "../stores/userdataStore";

/**
 * The list row in selection mode, and its right-click menu. The circle once
 * looked like the thing to click but was the one spot that did not select.
 */

const book: BookMeta = {
  filePath: "C:\\Audiobooks\\Dune.m4b",
  title: "Dune",
  author: "Frank Herbert",
  album: "",
  duration: 3600,
  coverArt: null,
  chapters: [],
  tracks: [],
};

const collections: Collection[] = [{ id: "c1", name: "Sci-fi", color: "#4db6ac", createdAt: "" }];

let target: HTMLDivElement;
let app: ReturnType<typeof mount> | null = null;

function render(props: Record<string, unknown>) {
  target = document.createElement("div");
  document.body.appendChild(target);
  app = mount(BookListItem, {
    target,
    props: { book, collections, onedit: vi.fn(), onplay: vi.fn(), ...props },
  });
  flushSync();
}

afterEach(() => {
  if (app) unmount(app);
  app = null;
  target.remove();
});

describe("BookListItem", () => {
  it("shows no circle outside selection mode", () => {
    render({});
    expect(target.querySelector(".select-check")).toBeNull();
  });

  it("selects when the circle itself is clicked", () => {
    const ontoggleselect = vi.fn();
    render({ selectionMode: true, ontoggleselect });

    const circle = target.querySelector(".select-check .material-symbols-outlined") as HTMLElement;
    expect(circle.textContent?.trim()).toBe("radio_button_unchecked");
    circle.click();

    expect(ontoggleselect).toHaveBeenCalledWith(book, false);
  });

  it("opts out of the press-scale that moved the circle from under the pointer", () => {
    render({ selectionMode: true });
    expect(target.querySelector(".list-item-main")?.getAttribute("data-press")).toBe("none");
  });

  it("draws a ticked circle and a tinted row when selected", () => {
    render({ selectionMode: true, selected: true });
    expect(target.querySelector(".select-check")?.classList.contains("on")).toBe(true);
    expect(target.querySelector(".select-check")?.textContent?.trim()).toBe("check_circle");
    expect(target.querySelector(".list-item")?.classList.contains("selected")).toBe(true);
  });

  it("hides the progress line of a book marked not started", () => {
    const position = { position: 1800, duration: 3600 };
    const reading: UserBookData = { ...defaultUserBookData(), status: "in_progress" };
    render({ position, userData: reading });
    expect(target.querySelector(".progress-track")).not.toBeNull();

    if (app) unmount(app);
    target.remove();
    render({ position, userData: { ...reading, status: "not_started" } });
    expect(target.querySelector(".progress-track")).toBeNull();
  });

  it("opens a menu on right-click that sets the status in one click", () => {
    const onstatus = vi.fn();
    render({ onstatus });

    target.querySelector(".list-item")!.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }),
    );
    flushSync();

    const items = [...target.querySelectorAll<HTMLButtonElement>(".ctx-menu [role='menuitemradio']")];
    const finished = items.find((b) => b.textContent?.includes("Finished"))!;
    finished.click();
    flushSync();

    expect(onstatus).toHaveBeenCalledWith(book, "finished");
    expect(target.querySelector(".ctx-menu")).toBeNull();
  });

  it("ticks a collection from the menu and keeps the menu open", async () => {
    render({});
    target.querySelector(".list-item")!.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }),
    );
    flushSync();

    const item = target.querySelector<HTMLButtonElement>(".ctx-menu [role='menuitemcheckbox']")!;
    expect(item.textContent).toContain("Sci-fi");
    item.click();
    await vi.waitFor(() =>
      expect(get(userdataStore).books[book.filePath]?.collections).toEqual(["c1"]),
    );
    expect(target.querySelector(".ctx-menu")).not.toBeNull();
  });
});
