"use client";

import { motion } from "motion/react";
import { cn } from "./cn";

/** Staggered entrance shell for dashboard widgets. */
export function WidgetFrame({
  index,
  accent,
  title,
  className,
  children,
}: {
  index: number;
  accent: string;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
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
      className={cn("glass flex flex-col rounded-(--radius-panel) p-5", className)}
    >
      <p
        className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em]"
        style={{ color: accent }}
      >
        {title}
      </p>
      <div className="min-h-0 flex-1">{children}</div>
    </motion.div>
  );
}
