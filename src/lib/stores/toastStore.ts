import { writable } from "svelte/store";

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastMessage {
  id: number;
  text: string;
  icon?: string;
  /** One button, e.g. Undo; the toast closes when it is used. */
  action?: ToastAction;
}

export const toasts = writable<ToastMessage[]>([]);

let nextId = 0;

export function dismissToast(id: number): void {
  toasts.update((t) => t.filter((m) => m.id !== id));
}

export function showToast(text: string, icon?: string, durationMs = 3000, action?: ToastAction): void {
  const id = nextId++;
  toasts.update((t) => [...t, { id, text, icon, action }]);
  setTimeout(() => dismissToast(id), durationMs);
}
