"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getModule } from "@/modules/registry";

function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return <span className="font-mono text-xs text-ink-faint">··:··:··</span>;

  return (
    <span className="font-mono text-xs tabular-nums text-ink-dim">
      {now.toLocaleDateString(undefined, {
        weekday: "short",
        day: "2-digit",
        month: "short",
      })}
      <span className="mx-2 text-ink-faint">·</span>
      <span className="text-plasma">
        {now.toLocaleTimeString(undefined, { hour12: false })}
      </span>
    </span>
  );
}

export function TopBar() {
  const pathname = usePathname();
  const moduleId = pathname.startsWith("/m/") ? pathname.split("/")[2] : null;
  const mod = moduleId ? getModule(moduleId) : null;
  const title = mod?.title ?? "Dashboard";

  return (
    <header className="mb-6 flex items-center justify-between">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
          aios /{" "}
          <span style={mod ? { color: mod.accent } : { color: "var(--color-plasma)" }}>
            {title.toLowerCase()}
          </span>
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-wide text-ink">
          {title}
        </h1>
      </div>
      <Clock />
    </header>
  );
}
