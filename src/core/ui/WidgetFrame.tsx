"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "./cn";

/** Staggered entrance shell for dashboard widgets. */
export function WidgetFrame({
  index,
  accent,
  title,
  href,
  className,
  children,
}: {
  index: number;
  accent: string;
  title: string;
  /** When set, the card header links to this route (opens the module). */
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const header = (
    <p
      className="font-mono text-[10px] uppercase tracking-[0.25em]"
      style={{ color: accent }}
    >
      {title}
    </p>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 340,
        damping: 30,
        delay: index * 0.07,
      }}
      className={cn("glass flex flex-col rounded-(--radius-panel) p-4", className)}
    >
      {href ? (
        <Link
          href={href}
          aria-label={`Open ${title}`}
          className="group mb-2 -m-1 flex items-center gap-1.5 rounded-md p-1 transition hover:bg-white/5"
        >
          {header}
          <ArrowUpRight
            className="size-3 opacity-0 transition group-hover:opacity-100"
            style={{ color: accent }}
          />
        </Link>
      ) : (
        <div className="mb-2">{header}</div>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </motion.div>
  );
}
