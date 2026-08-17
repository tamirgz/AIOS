/**
 * Theme registry — the selectable looks. Client-safe (pure data): the picker
 * renders from it and the save action validates against it. A theme is applied
 * as `<html data-theme="…">`; the CSS token sets + treatment overrides live in
 * globals.css. The default ("mission") is the base `@theme` (no data-theme attr).
 */
export interface ThemeDef {
  id: string;
  /** empty for the default = no data-theme attribute. */
  attr: string;
  label: string;
  tagline: string;
  /** [background, surface, accentA, accentB] swatch for the picker preview. */
  swatch: [string, string, string, string];
}

export const THEMES: ThemeDef[] = [
  {
    id: "mission",
    attr: "",
    label: "Mission Control",
    tagline: "Deep-space dark — plasma-teal on obsidian, glass + aurora. (default)",
    swatch: ["#04070c", "#13202f", "#00e5c7", "#ffb454"],
  },
  {
    id: "daybreak",
    attr: "daybreak",
    label: "Daybreak",
    tagline: "A true light mode — warm paper, soft shadows, calm and airy.",
    swatch: ["#f4f1ea", "#ffffff", "#0b9a86", "#c67d1e"],
  },
  {
    id: "nebula",
    attr: "nebula",
    label: "Nebula",
    tagline: "Richer cosmic dark — violet & magenta with a cyan pulse, soft bloom.",
    swatch: ["#08060f", "#211738", "#c04bff", "#38bdf8"],
  },
  {
    id: "phosphor",
    attr: "phosphor",
    label: "Phosphor",
    tagline: "Retro terminal — amber CRT, monospace, sharp edges, scanlines.",
    swatch: ["#080600", "#1c1608", "#ffb000", "#9be15d"],
  },
  {
    id: "slate",
    attr: "slate",
    label: "Slate",
    tagline: "Flat & minimal — solid panels, no glow, quiet and focused.",
    swatch: ["#15171c", "#272c38", "#7c8cf8", "#e0a458"],
  },
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME = "mission";

/** Map a stored theme id → the `data-theme` attribute value ("" = default). */
export function themeAttr(id: string | null | undefined): string {
  return THEMES.find((t) => t.id === id)?.attr ?? "";
}
