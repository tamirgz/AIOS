import Link from "next/link";

/**
 * One cell in the dashboard's tier-3 "pulse strip" — a demoted passive count
 * (task load, ideas, intake…) rendered compactly instead of as a full card.
 * Mono uppercase accent label + a big value with a faint hint, linking to the
 * module. Shares the product's widget-title idiom (mono, uppercase, accent).
 */
export function StatCell({
  label,
  value,
  hint,
  href,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-1 px-4 py-3.5 transition hover:bg-white/3"
    >
      <span
        className="font-mono text-[9px] uppercase tracking-[0.2em]"
        style={{ color: accent }}
      >
        {label}
      </span>
      <span className="font-display text-2xl font-semibold tabular-nums text-ink transition group-hover:text-glow">
        {value}
        {hint && (
          <span className="ml-1.5 font-mono text-[10px] font-normal tracking-wide text-ink-faint">
            {hint}
          </span>
        )}
      </span>
    </Link>
  );
}
