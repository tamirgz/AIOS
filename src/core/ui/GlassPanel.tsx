import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function GlassPanel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("glass rounded-(--radius-panel)", className)}
      {...props}
    />
  );
}
