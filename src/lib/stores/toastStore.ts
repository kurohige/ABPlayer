import { writable } from "svelte/store";

export interface ToastMessage {
  id: number;
  text: string;
  icon?: string;
}

export const toasts = writable<ToastMessage[]>([]);

let nextId = 0;

export function showToast(text: string, icon?: string, durationMs = 3000): void {
  const id = nextId++;
  toasts.update((t) => [...t, { id, text, icon }]);
  setTimeout(() => {
    toasts.update((t) => t.filter((m) => m.id !== id));
  }, durationMs);
}
