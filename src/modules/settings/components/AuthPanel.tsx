import { KeyRound, ShieldCheck, ShieldAlert } from "lucide-react";
import { authStatus, METERED_AUTH_VARS } from "@/core/ai/auth";
import { ClaudeReconnect } from "./ClaudeReconnect";

/**
 * What apOS is billing against, stated plainly. The policy is subscription or
 * local, never a metered API key — this panel shows it rather than asking you
 * to trust a comment in the source.
 */
export function AuthPanel() {
  const status = authStatus();
  const ok = status.mode === "max-subscription" && status.neutralised.length === 0;

  return (
    <section className="glass rounded-2xl p-5">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
        ai authentication
      </p>

      <div className="flex items-start gap-3">
        {ok ? (
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-plasma" />
        ) : (
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-solar" />
        )}
        <div className="flex-1">
          <p className="text-sm text-ink">
            {status.tokenPresent
              ? "Anthropic — Claude Max subscription"
              : "Anthropic — not configured"}
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            {status.tokenPresent ? (
              <>
                {status.tokenSource === "claude-cli-session" ? (
                  <>
                    Authenticated as your logged-in Claude account — the CLI
                    session in the macOS Keychain (<code className="text-ion">claude login</code>).
                    Usage counts against the Max allowance, never a per-token bill.
                  </>
                ) : (
                  <>
                    Running on your plan via{" "}
                    <code className="text-ion">CLAUDE_CODE_OAUTH_TOKEN</code> (
                    <code className="text-ion">claude setup-token</code>), read from{" "}
                    <code className="text-ion">{status.tokenSource}</code>. Usage
                    counts against the Max allowance, never a per-token bill.
                  </>
                )}
              </>
            ) : (
              <>
                Run <code className="text-ion">claude setup-token</code> and put
                the result in <code className="text-ion">.env.local</code> as{" "}
                <code className="text-ion">CLAUDE_CODE_OAUTH_TOKEN</code>.
              </>
            )}
          </p>
        </div>
      </div>

      <ClaudeReconnect />

      <div className="mt-4 flex items-start gap-3 border-t border-white/6 pt-3">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-ink-faint" />
        <div className="flex-1">
          <p className="text-sm text-ink-dim">API keys: disabled by policy</p>
          <p className="mt-1 text-xs text-ink-faint">
            {status.neutralised.length === 0 ? (
              <>
                None present. apOS strips{" "}
                <span className="font-mono text-[10px]">
                  {METERED_AUTH_VARS.slice(0, 3).join(", ")}
                </span>{" "}
                and friends from its own environment and from every executor it
                spawns, so a stray key can never start metered billing.
              </>
            ) : (
              <span className="text-solar">
                Found and neutralised: {status.neutralised.join(", ")}. apOS
                ignored them — unset them to silence this.
              </span>
            )}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-faint">
        Local models run through Ollama and cost nothing. If a paid provider is
        ever added, the same rule applies: subscription or local auth, or it
        does not ship.
      </p>
    </section>
  );
}
