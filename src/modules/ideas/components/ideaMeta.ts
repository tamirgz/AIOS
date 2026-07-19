import type { IdeaAnalysis, IdeaCategory, IdeaStage } from "../schema";

export const STAGE_META: Record<
  IdeaStage,
  { label: string; accent: string }
> = {
  spark: { label: "Sparks", accent: "var(--color-gold)" },
  exploring: { label: "Exploring", accent: "var(--color-ion)" },
  validated: { label: "Validated", accent: "var(--color-plasma)" },
  parked: { label: "Parked", accent: "var(--color-ink-faint)" },
};

export const STAGE_ORDER: IdeaStage[] = [
  "spark",
  "exploring",
  "validated",
  "parked",
];

export const CATEGORY_LABEL: Record<IdeaCategory, string> = {
  product: "product",
  business: "business",
  feature: "feature",
  experiment: "experiment",
  other: "other",
};

export const VERDICT_META: Record<
  IdeaAnalysis["verdict"],
  { label: string; color: string }
> = {
  pursue: { label: "pursue", color: "var(--color-plasma)" },
  explore: { label: "explore", color: "var(--color-solar)" },
  park: { label: "park", color: "var(--color-flare)" },
};
