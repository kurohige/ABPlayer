import type { Tier } from "./types";
import { createId } from "./utils/id";

/** Six-color palette used as starting tiers and as the color picker swatches. */
export const TIER_PALETTE: string[] = [
  "#ff8a7a", // coral
  "#ffb86b", // amber
  "#ffd66b", // yellow
  "#6bc4a8", // teal-green
  "#6ba4d9", // blue
  "#8b8680", // slate
];

export interface TierTemplate {
  id: string;
  name: string;
  tiers: Array<{ label: string; name: string | null; color: string }>;
}

export const TIER_TEMPLATES: TierTemplate[] = [
  {
    id: "classic",
    name: "Classic S-F",
    tiers: [
      { label: "S", name: "GOAT",  color: "#ff8a7a" },
      { label: "A", name: "Great", color: "#ffb86b" },
      { label: "B", name: "Good",  color: "#ffd66b" },
      { label: "C", name: "Fine",  color: "#6bc4a8" },
      { label: "D", name: "Meh",   color: "#6ba4d9" },
      { label: "F", name: "Skip",  color: "#8b8680" },
    ],
  },
  {
    id: "stars",
    name: "Stars",
    tiers: [
      { label: "★★★★★", name: null, color: "#ff8a7a" },
      { label: "★★★★",  name: null, color: "#ffb86b" },
      { label: "★★★",   name: null, color: "#ffd66b" },
      { label: "★★",    name: null, color: "#6ba4d9" },
      { label: "★",     name: null, color: "#8b8680" },
    ],
  },
  {
    id: "goodOkaySkip",
    name: "Good / Okay / Skip",
    tiers: [
      { label: "Good", name: null, color: "#6bc4a8" },
      { label: "Okay", name: null, color: "#ffd66b" },
      { label: "Skip", name: null, color: "#8b8680" },
    ],
  },
];

export const DEFAULT_AXES: string[] = ["Story", "Narration", "Pacing"];

/** Materialize a template into a concrete Tier[] with fresh IDs + order. */
export function tiersFromTemplate(templateId: string): Tier[] {
  const tpl = TIER_TEMPLATES.find((t) => t.id === templateId) || TIER_TEMPLATES[0];
  return tpl.tiers.map((t, i) => ({
    id: createId(),
    label: t.label,
    name: t.name,
    color: t.color,
    order: i,
  }));
}
