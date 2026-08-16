"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { ArrowUpRight, ChevronRight, LayoutGrid } from "lucide-react";
import { navModules } from "@/modules/registry";
import type { ModuleManifest } from "@/core/modules/types";
import { cn } from "./cn";

function NavItem({
  href,
  title,
  accent,
  icon: Icon,
  active,
  external = false,
}: {
  href: string;
  title: string;
  accent: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  active: boolean;
  /** A pointer-out (opens the real app) — shows an ↗ cue. */
  external?: boolean;
}) {
  return (
    <Link href={href} className="group relative block">
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-xl glass-edge bg-white/2"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      <span
        className={cn(
          "relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
          active ? "text-ink" : "text-ink-dim hover:text-ink hover:bg-white/3",
        )}
      >
        <Icon
          className="size-4.5 shrink-0 transition-transform group-hover:scale-110"
          style={active ? { color: accent, filter: `drop-shadow(0 0 6px ${accent})` } : undefined}
        />
        <span className="font-display tracking-wide">{title}</span>
        {external ? (
          <ArrowUpRight className="ml-auto size-3.5 shrink-0 text-ink-faint transition group-hover:text-ink-dim" />
        ) : active ? (
          <span className="dot ml-auto animate-pulse-soft" style={{ color: accent }} />
        ) : null}
      </span>
    </Link>
  );
}

/** True when the current route lives inside one of `items`. */
function isActiveModule(pathname: string, id: string): boolean {
  return pathname === `/m/${id}` || pathname.startsWith(`/m/${id}/`);
}

/**
 * A collapsible sidebar section (e.g. "Sources" — the read-only external feeds).
 * Collapsed by default and remembers the user's choice, BUT always shows itself
 * expanded when the current route is one of its items, so you're never on a page
 * that's hidden in a closed drawer.
 */
function NavGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: ModuleManifest[];
  pathname: string;
}) {
  const activeInside = items.some((m) => isActiveModule(pathname, m.id));
  const [open, setOpen] = useState(false); // collapsed by default
  const key = `aios-nav-group:${label}`;

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    if (stored != null) setOpen(stored === "1");
  }, [key]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(key, next ? "1" : "0");
    } catch {
      /* private mode — non-fatal */
    }
  };

  const expanded = open || activeInside;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-ink-faint transition hover:text-ink-dim"
      >
        <ChevronRight
          className={cn("size-3 shrink-0 transition-transform", expanded && "rotate-90")}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em]">{label}</span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-faint/70">
          {items.length}
        </span>
      </button>
      {expanded && (
        <div className="mt-1 flex flex-col gap-1">
          {items.map((m) => (
            <NavItem
              key={m.id}
              href={`/m/${m.id}`}
              title={m.title}
              accent={m.accent}
              icon={m.icon}
              active={isActiveModule(pathname, m.id)}
              external={m.nav.external}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  // Core = the always-visible flat list; grouped items go under section labels.
  // Settings is pinned LAST (below the group sections), as convention expects.
  const core = navModules.filter((m) => !m.nav.group && m.id !== "settings");
  const settings = navModules.find((m) => !m.nav.group && m.id === "settings");
  const groups = new Map<string, ModuleManifest[]>();
  for (const m of navModules) {
    if (!m.nav.group) continue;
    (groups.get(m.nav.group) ?? groups.set(m.nav.group, []).get(m.nav.group)!).push(m);
  }

  return (
    <aside className="glass sticky top-3 m-3 mr-0 flex h-[calc(100vh-1.5rem)] w-52 shrink-0 flex-col rounded-(--radius-panel) p-3">
      {/* logo */}
      <Link href="/" className="mb-5 flex items-center gap-3 px-2 pt-1">
        <span className="relative flex size-9 items-center justify-center rounded-xl border border-plasma/30 bg-plasma/10">
          <span className="font-display text-lg font-bold text-plasma text-glow">A</span>
          <span className="absolute -right-0.5 -top-0.5 dot text-plasma animate-pulse-soft" />
        </span>
        <span>
          <span className="block font-display text-base font-semibold tracking-[0.18em] text-ink">
            AIOS
          </span>
          <span className="block font-mono text-[10px] uppercase tracking-widest text-ink-faint">
            personal os
          </span>
        </span>
      </Link>

      {/* nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        <NavItem
          href="/"
          title="Dashboard"
          accent="var(--color-plasma)"
          icon={LayoutGrid}
          active={pathname === "/"}
        />
        {core.map((m) => (
          <NavItem
            key={m.id}
            href={`/m/${m.id}`}
            title={m.title}
            accent={m.accent}
            icon={m.icon}
            active={isActiveModule(pathname, m.id)}
          />
        ))}
        {[...groups.entries()].map(([label, items]) => (
          <NavGroup key={label} label={label} items={items} pathname={pathname} />
        ))}
        {settings && (
          <NavItem
            href={`/m/${settings.id}`}
            title={settings.title}
            accent={settings.accent}
            icon={settings.icon}
            active={isActiveModule(pathname, settings.id)}
          />
        )}
      </nav>

      {/* footer */}
      <div className="mt-auto border-t border-white/5 px-2 pt-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-ink-faint">
          aios v0.1 · local
        </p>
      </div>
    </aside>
  );
}
