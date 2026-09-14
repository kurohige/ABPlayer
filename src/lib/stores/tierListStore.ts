import { writable, derived, get } from "svelte/store";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { Tier, TierList, TierScope } from "../types";
import { createId } from "../utils/id";
import { getStore } from "./storeUtils";
import { DEFAULT_AXES, tiersFromTemplate } from "../tierDefaults";
import { userdataStore, setPreference } from "./userdataStore";

const STORE_FILE = "tierlists.json";

interface TierListsState {
  lists: TierList[];
}

export const tierListsStore = writable<TierListsState>({ lists: [] });

export async function loadTierLists(): Promise<void> {
  try {
    const s = await getStore(STORE_FILE);
    const lists = (await s.get<TierList[]>("lists")) || [];
    tierListsStore.set({ lists });
  } catch (e) {
    console.warn("Failed to load tier lists:", e);
  }
}

async function persist(): Promise<void> {
  try {
    const s = await getStore(STORE_FILE);
    await s.set("lists", get(tierListsStore).lists);
  } catch (e) {
    console.warn("Failed to persist tier lists:", e);
  }
}

// ---- Derived ----

/** The user's default tier list (by `preferences.defaultTierListId`), or null. */
export const defaultTierList = derived(
  [tierListsStore, userdataStore],
  ([$tierLists, $user]) => {
    const id = $user.preferences.defaultTierListId;
    if (!id) return null;
    return $tierLists.lists.find((l) => l.id === id) || null;
  },
);

// ---- List CRUD ----

export interface NewTierListOptions {
  description?: string | null;
  scope?: TierScope;
  template?: string;
  tiers?: Tier[];
  defaultAxes?: string[];
  /** Pre-seeded assignments (bookFilePath -> tier.id). Used by library import. */
  assignments?: Record<string, string>;
}

export async function createTierList(
  name: string,
  opts: NewTierListOptions = {},
): Promise<string> {
  const now = new Date().toISOString();
  const id = createId();
  const list: TierList = {
    id,
    name: name.trim() || "Untitled list",
    description: opts.description?.trim() || null,
    scope: opts.scope || "all",
    createdAt: now,
    updatedAt: now,
    tiers: opts.tiers && opts.tiers.length > 0 ? opts.tiers : tiersFromTemplate(opts.template || "classic"),
    assignments: opts.assignments ? { ...opts.assignments } : {},
    defaultAxes: opts.defaultAxes && opts.defaultAxes.length > 0 ? [...opts.defaultAxes] : [...DEFAULT_AXES],
  };

  tierListsStore.update((s) => ({ lists: [...s.lists, list] }));
  await persist();

  // Auto-set as default if this is the first list
  const prefs = get(userdataStore).preferences;
  if (!prefs.defaultTierListId) {
    await setPreference("defaultTierListId", id);
  }
  return id;
}

export async function renameTierList(id: string, name: string): Promise<void> {
  tierListsStore.update((s) => ({
    lists: s.lists.map((l) =>
      l.id === id ? { ...l, name: name.trim() || l.name, updatedAt: new Date().toISOString() } : l,
    ),
  }));
  await persist();
}

export async function updateListDescription(id: string, description: string | null): Promise<void> {
  const desc = description && description.trim() ? description.trim() : null;
  tierListsStore.update((s) => ({
    lists: s.lists.map((l) =>
      l.id === id ? { ...l, description: desc, updatedAt: new Date().toISOString() } : l,
    ),
  }));
  await persist();
}

export async function updateListScope(id: string, scope: TierScope): Promise<void> {
  tierListsStore.update((s) => ({
    lists: s.lists.map((l) =>
      l.id === id ? { ...l, scope, updatedAt: new Date().toISOString() } : l,
    ),
  }));
  await persist();
}

export async function deleteTierList(id: string): Promise<void> {
  tierListsStore.update((s) => ({ lists: s.lists.filter((l) => l.id !== id) }));
  await persist();

  // If the deleted list was default, promote the next available list
  const prefs = get(userdataStore).preferences;
  if (prefs.defaultTierListId === id) {
    const remaining = get(tierListsStore).lists;
    await setPreference("defaultTierListId", remaining.length > 0 ? remaining[0].id : null);
  }
}

export async function duplicateTierList(id: string): Promise<string | null> {
  const src = get(tierListsStore).lists.find((l) => l.id === id);
  if (!src) return null;

  const now = new Date().toISOString();
  const newId = createId();
  const tierIdMap: Record<string, string> = {};
  const newTiers: Tier[] = src.tiers.map((t) => {
    const fresh = createId();
    tierIdMap[t.id] = fresh;
    return { ...t, id: fresh };
  });
  const newAssignments: Record<string, string> = {};
  for (const [book, oldTierId] of Object.entries(src.assignments)) {
    const mapped = tierIdMap[oldTierId];
    if (mapped) newAssignments[book] = mapped;
  }

  const copy: TierList = {
    ...src,
    id: newId,
    name: `${src.name} (copy)`,
    createdAt: now,
    updatedAt: now,
    tiers: newTiers,
    assignments: newAssignments,
    defaultAxes: [...src.defaultAxes],
  };

  tierListsStore.update((s) => ({ lists: [...s.lists, copy] }));
  await persist();
  return newId;
}

// ---- Tier CRUD ----

export async function addTier(
  listId: string,
  opts: { label?: string; color?: string; name?: string | null } = {},
): Promise<string> {
  const id = createId();
  tierListsStore.update((s) => ({
    lists: s.lists.map((l) => {
      if (l.id !== listId) return l;
      const tier: Tier = {
        id,
        label: opts.label || "New",
        name: opts.name ?? null,
        color: opts.color || "#8b8680",
        order: l.tiers.length,
      };
      return { ...l, tiers: [...l.tiers, tier], updatedAt: new Date().toISOString() };
    }),
  }));
  await persist();
  return id;
}

export async function updateTier(
  listId: string,
  tierId: string,
  patch: Partial<Pick<Tier, "label" | "name" | "color">>,
): Promise<void> {
  tierListsStore.update((s) => ({
    lists: s.lists.map((l) =>
      l.id !== listId
        ? l
        : {
            ...l,
            tiers: l.tiers.map((t) => (t.id === tierId ? { ...t, ...patch } : t)),
            updatedAt: new Date().toISOString(),
          },
    ),
  }));
  await persist();
}

export async function removeTier(
  listId: string,
  tierId: string,
  mode: "pool" | "adjacent" = "pool",
): Promise<void> {
  tierListsStore.update((s) => ({
    lists: s.lists.map((l) => {
      if (l.id !== listId) return l;
      const idx = l.tiers.findIndex((t) => t.id === tierId);
      if (idx === -1) return l;

      const newAssignments: Record<string, string> = {};
      if (mode === "adjacent") {
        const adj = l.tiers[idx + 1] || l.tiers[idx - 1];
        for (const [book, id] of Object.entries(l.assignments)) {
          if (id === tierId) {
            if (adj) newAssignments[book] = adj.id;
          } else {
            newAssignments[book] = id;
          }
        }
      } else {
        // "pool" — drop the assignments entirely
        for (const [book, id] of Object.entries(l.assignments)) {
          if (id !== tierId) newAssignments[book] = id;
        }
      }

      const newTiers = l.tiers
        .filter((t) => t.id !== tierId)
        .map((t, i) => ({ ...t, order: i }));
      return {
        ...l,
        tiers: newTiers,
        assignments: newAssignments,
        updatedAt: new Date().toISOString(),
      };
    }),
  }));
  await persist();
}

export async function reorderTier(
  listId: string,
  tierId: string,
  delta: -1 | 1,
): Promise<void> {
  tierListsStore.update((s) => ({
    lists: s.lists.map((l) => {
      if (l.id !== listId) return l;
      const idx = l.tiers.findIndex((t) => t.id === tierId);
      const newIdx = idx + delta;
      if (idx < 0 || newIdx < 0 || newIdx >= l.tiers.length) return l;
      const reordered = [...l.tiers];
      const [moved] = reordered.splice(idx, 1);
      reordered.splice(newIdx, 0, moved);
      return {
        ...l,
        tiers: reordered.map((t, i) => ({ ...t, order: i })),
        updatedAt: new Date().toISOString(),
      };
    }),
  }));
  await persist();
}

// ---- Assignments ----

export async function assignBookToTier(
  listId: string,
  filePath: string,
  tierId: string,
): Promise<void> {
  let changed = false;
  tierListsStore.update((s) => ({
    lists: s.lists.map((l) => {
      if (l.id !== listId || l.assignments[filePath] === tierId) return l;
      changed = true;
      return {
        ...l,
        assignments: { ...l.assignments, [filePath]: tierId },
        updatedAt: new Date().toISOString(),
      };
    }),
  }));
  if (changed) await persist();
}

export async function unassignBook(listId: string, filePath: string): Promise<void> {
  tierListsStore.update((s) => ({
    lists: s.lists.map((l) => {
      if (l.id !== listId) return l;
      if (!(filePath in l.assignments)) return l;
      const { [filePath]: _removed, ...rest } = l.assignments;
      return { ...l, assignments: rest, updatedAt: new Date().toISOString() };
    }),
  }));
  await persist();
}

/** Called from libraryStore.removeBook to clean up assignments across every list. */
export async function removeBookFromAllLists(filePath: string): Promise<void> {
  let changed = false;
  tierListsStore.update((s) => ({
    lists: s.lists.map((l) => {
      if (!(filePath in l.assignments)) return l;
      changed = true;
      const { [filePath]: _removed, ...rest } = l.assignments;
      return { ...l, assignments: rest, updatedAt: new Date().toISOString() };
    }),
  }));
  if (changed) await persist();
}

// ---- Read helpers ----

export function getBookTier(list: TierList | null, filePath: string): Tier | null {
  if (!list) return null;
  const tierId = list.assignments[filePath];
  if (!tierId) return null;
  return list.tiers.find((t) => t.id === tierId) || null;
}

function getListById(id: string | null): TierList | null {
  if (!id) return null;
  return get(tierListsStore).lists.find((l) => l.id === id) || null;
}

/** Convenience: set the default tier list. */
export async function setDefaultTierList(id: string | null): Promise<void> {
  await setPreference("defaultTierListId", id);
}

// ---- Export ----

export async function exportTierList(id: string): Promise<void> {
  const list = getListById(id);
  if (!list) return;
  const path = await save({
    defaultPath: `${list.name.replace(/[^a-z0-9-_ ]/gi, "_")}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return;
  await writeTextFile(path, JSON.stringify(list, null, 2));
}


// ---- Import (from a library JSON export) ----

const VALID_SCOPES: TierScope[] = ["all", "finished", "in_progress"];

/**
 * Merge tier lists from a library export. A list whose name already exists is
 * skipped (never merged into). Tiers are validated shape-wise; assignments are
 * kept only for tiers on the list and books in `knownPaths`.
 * Returns the number of lists created.
 */
export async function importTierLists(
  raw: unknown,
  knownPaths: Set<string>,
): Promise<number> {
  if (!Array.isArray(raw)) return 0;
  const existingNames = new Set(get(tierListsStore).lists.map((l) => l.name));
  let created = 0;

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const list = item as Partial<TierList>;
    if (typeof list.name !== "string" || !list.name.trim()) continue;
    if (existingNames.has(list.name)) continue;

    const tiers: Tier[] = (Array.isArray(list.tiers) ? list.tiers : [])
      .filter(
        (t): t is Tier =>
          !!t &&
          typeof t === "object" &&
          typeof t.id === "string" &&
          typeof t.label === "string" &&
          typeof t.color === "string",
      )
      .map((t, i) => ({
        id: t.id,
        label: t.label,
        name: typeof t.name === "string" ? t.name : null,
        color: t.color,
        order: typeof t.order === "number" ? t.order : i,
      }));
    if (tiers.length === 0) continue;

    const tierIds = new Set(tiers.map((t) => t.id));
    const assignments: Record<string, string> = {};
    const rawAssignments =
      list.assignments && typeof list.assignments === "object" ? list.assignments : {};
    for (const [filePath, tierId] of Object.entries(rawAssignments)) {
      if (typeof tierId === "string" && tierIds.has(tierId) && knownPaths.has(filePath)) {
        assignments[filePath] = tierId;
      }
    }

    await createTierList(list.name, {
      description: typeof list.description === "string" ? list.description : null,
      scope: VALID_SCOPES.includes(list.scope as TierScope) ? (list.scope as TierScope) : "all",
      tiers,
      defaultAxes: Array.isArray(list.defaultAxes)
        ? list.defaultAxes.filter((a): a is string => typeof a === "string")
        : undefined,
      assignments,
    });
    existingNames.add(list.name);
    created++;
  }
  return created;
}
