import { GlassPanel } from "@/core/ui/GlassPanel";
import { isentryConfigured } from "../db";

/**
 * Investments landing. apOS is the INSIGHT/chat layer over iSentry — the actual
 * portfolio (holdings, positions) lives in iSentry, so this page intentionally
 * does NOT re-list it. It points at ⌘K chat and the insight agent.
 */
export async function InvestmentsPage() {
  const connected = isentryConfigured();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg text-ink">Investments</h1>
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-faint">
          {connected ? "connected to iSentry" : "not connected"}
        </span>
      </div>

      {connected ? (
        <GlassPanel className="flex flex-col gap-3 px-8 py-10 text-sm text-ink-dim">
          <p className="text-ink">
            Your portfolio lives in iSentry — apOS is the insight layer over it.
          </p>
          <p>
            Ask <span className="font-mono text-ink">⌘K</span> about your
            investments — e.g. “summarize my portfolio”, “what are my biggest
            positions”, “how am I doing this month”. The Investment-insight agent
            also writes periodic reads into memory.
          </p>
        </GlassPanel>
      ) : (
        <GlassPanel className="px-8 py-16 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-flare">
            iSentry not connected
          </p>
          <p className="mx-auto mt-4 max-w-md text-sm text-ink-dim">
            Set <code className="text-ink">ISENTRY_DATABASE_URL</code> (a read-only
            Supabase connection string) in{" "}
            <code className="text-ink">.env.local</code> and restart.
          </p>
        </GlassPanel>
      )}
    </div>
  );
}
