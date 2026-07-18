"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { LayoutGrid } from "lucide-react";
import { navModules } from "@/modules/registry";
import { cn } from "./cn";

function NavItem({
  href,
  title,
  accent,
  icon: Icon,
  active,
}: {
  href: string;
  title: string;
  accent: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  active: boolean;
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
          "relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors",
          active
            ? "text-ink"
            : "text-ink-dim hover:text-ink hover:bg-white/3",
        )}
      >
        <Icon
          className="size-4.5 shrink-0 transition-transform group-hover:scale-110"
          style={active ? { color: accent, filter: `drop-shadow(0 0 6px ${accent})` } : undefined}
        />
        <span className="font-display tracking-wide">{title}</span>
        {active && (
          <span
            className="dot ml-auto animate-pulse-soft"
            style={{ color: accent }}
          />
        )}
      </span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="glass sticky top-4 m-4 mr-0 flex h-[calc(100vh-2rem)] w-60 shrink-0 flex-col rounded-(--radius-panel) p-4">
      {/* logo */}
      <Link href="/" className="mb-8 flex items-center gap-3 px-2 pt-1">
        <span className="relative flex size-9 items-center justify-center rounded-xl border border-plasma/30 bg-plasma/10">
          <span className="font-display text-lg font-bold text-plasma text-glow">
            A
          </span>
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
      <nav className="flex flex-col gap-1">
        <NavItem
          href="/"
          title="Dashboard"
          accent="var(--color-plasma)"
          icon={LayoutGrid}
          active={pathname === "/"}
        />
        {navModules.map((m) => (
          <NavItem
            key={m.id}
            href={`/m/${m.id}`}
            title={m.title}
            accent={m.accent}
            icon={m.icon}
            active={pathname === `/m/${m.id}` || pathname.startsWith(`/m/${m.id}/`)}
          />
        ))}
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
