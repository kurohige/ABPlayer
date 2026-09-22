/**
 * EQ presets (plan B2): five built-ins and up to twelve of the user's own,
 * kept in `preferences.eqPresets`. A preset is app-wide; per-book gain is a
 * separate control and stays out of it.
 */
import type { EqPreset } from "../types";

export const EQ_MIN_DB = -12;
export const EQ_MAX_DB = 12;
export const MAX_USER_PRESETS = 12;
export const MAX_PRESET_NAME = 40;

export const BUILT_IN_EQ_PRESETS: readonly EqPreset[] = [
  { name: "Flat", bass: 0, mid: 0, treble: 0 },
  { name: "Voice Boost", bass: -2, mid: 4, treble: 2 },
  { name: "Bass Reduce", bass: -6, mid: 0, treble: 1 },
  { name: "Clarity", bass: 0, mid: 2, treble: 5 },
  { name: "Podcast", bass: -3, mid: 3, treble: 3 },
];

export interface EqValues {
  bass: number;
  mid: number;
  treble: number;
}

function clampDb(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.round(Math.max(EQ_MIN_DB, Math.min(EQ_MAX_DB, n)));
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function isBuiltInName(name: string): boolean {
  return BUILT_IN_EQ_PRESETS.some((p) => sameName(p.name, name));
}

/** True when the three bands sit exactly on the preset. */
export function presetMatches(preset: EqValues, values: EqValues): boolean {
  return preset.bass === values.bass && preset.mid === values.mid && preset.treble === values.treble;
}

/** The first preset (built-in first, then the user's) matching `values`, if any. */
export function findPreset(userPresets: readonly EqPreset[], values: EqValues): EqPreset | null {
  return (
    BUILT_IN_EQ_PRESETS.find((p) => presetMatches(p, values)) ??
    userPresets.find((p) => presetMatches(p, values)) ??
    null
  );
}

/**
 * The stored list, made safe: a real array of well-formed presets, names
 * trimmed and unique (case-insensitively) and never one of the built-in
 * names, gains rounded and clamped, at most MAX_USER_PRESETS of them.
 */
export function normalizeEqPresets(raw: unknown): EqPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: EqPreset[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, MAX_PRESET_NAME) : "";
    const bass = clampDb(r.bass);
    const mid = clampDb(r.mid);
    const treble = clampDb(r.treble);
    if (!name || bass === null || mid === null || treble === null) continue;
    if (isBuiltInName(name) || out.some((p) => sameName(p.name, name))) continue;
    out.push({ name, bass, mid, treble });
    if (out.length >= MAX_USER_PRESETS) break;
  }
  return out;
}

/** `list` with `preset` added, or replaced if a preset of that name exists. */
export function withPreset(list: readonly EqPreset[], preset: EqPreset): EqPreset[] {
  const i = list.findIndex((p) => sameName(p.name, preset.name));
  if (i >= 0) return list.map((p, j) => (j === i ? preset : p));
  return [...list, preset];
}

export function withoutPreset(list: readonly EqPreset[], name: string): EqPreset[] {
  return list.filter((p) => !sameName(p.name, name));
}
