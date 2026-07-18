// Client-safe module contract: METADATA ONLY. No component imports here —
// this file is consumed by client components (sidebar, command bar), so any
// component referenced here would be pulled into the browser bundle.
// Components (routes, widgets) live in the server manifest (types.server.ts).
import type { LucideIcon } from "lucide-react";

export interface ModuleCommand {
  id: string;
  title: string;
  keywords: string[];
  /** Navigation target, e.g. "/m/tasks" or "/m/tasks/new". */
  href: string;
}

export interface ModuleManifest {
  /** Unique id — also the URL segment under /m/. */
  id: string;
  title: string;
  icon: LucideIcon;
  /** CSS color used for nav glow / accent highlights. */
  accent: string;
  nav: { order: number };
  /** ⌘K entries contributed by this module. */
  commands: ModuleCommand[];
}
