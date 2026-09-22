/**
 * Vitest setup: replace every Tauri module the stores touch with a stub, so
 * store logic can run under Node with no WebView and no filesystem.
 * Tests that need specific behaviour (a picked path, file contents) override
 * the relevant `vi.fn` per test.
 */
import { vi } from "vitest";

vi.mock("@tauri-apps/plugin-store", async () => {
  const { makeStore } = await import("./memoryStore");
  return { load: vi.fn(async (name: string) => makeStore(name)) };
});

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string, protocol = "asset") =>
    `https://${protocol}.localhost/${encodeURIComponent(path)}`,
  invoke: vi.fn(async () => {
    throw new Error("invoke is not mocked in this test");
  }),
}));

vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: async () => "C:\\Users\\test\\AppData\\Roaming\\com.abplayer.app",
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => {}),
  listen: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTitle: vi.fn(), onCloseRequested: vi.fn() }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: 1 },
  readFile: vi.fn(async () => new Uint8Array()),
  writeFile: vi.fn(async () => {}),
  writeTextFile: vi.fn(async () => {}),
  readDir: vi.fn(async () => []),
  exists: vi.fn(async () => true),
  mkdir: vi.fn(async () => {}),
  watch: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(async () => {}),
}));
