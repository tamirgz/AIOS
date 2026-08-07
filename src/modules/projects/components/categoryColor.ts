// Stable color per category name — so a category looks the same everywhere
// without a fixed enum. Picks from the app's accent palette by a simple hash.
const PALETTE = [
  "var(--color-plasma)",
  "var(--color-solar)",
  "var(--color-ion)",
  "var(--color-flare)",
  "var(--color-violet)",
  "var(--color-plasma-dim)",
] as const;

export function categoryColor(category: string): string {
  let h = 0;
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
