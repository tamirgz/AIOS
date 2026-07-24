import { isGoogleConnected } from "@/modules/calendar/google";
import { listRecentMessages, unreadCount } from "../queries";
import { gmailAuthorized } from "../sync";

export async function GmailWidget() {
  const [connected, authorized] = await Promise.all([
    isGoogleConnected(),
    gmailAuthorized(),
  ]);

  if (!connected || !authorized) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">
        {connected ? "grant gmail access" : "connect google"}
      </p>
    );
  }

  const [unread, recent] = await Promise.all([unreadCount(), listRecentMessages(4)]);

  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">
        <span className="text-flare">{unread}</span> unread
      </p>
      <ul className="flex flex-col gap-1">
        {recent.map((m) => (
          <li
            key={m.id}
            className="truncate text-sm text-ink-dim"
            title={m.subject ?? undefined}
          >
            <span className={m.unread ? "text-ink" : ""}>
              {m.fromName ?? m.fromEmail ?? "unknown"}
            </span>
            {m.subject ? ` — ${m.subject}` : ""}
          </li>
        ))}
        {recent.length === 0 && (
          <li className="font-mono text-[10px] uppercase tracking-widest text-ink-faint">
            no recent mail
          </li>
        )}
      </ul>
    </div>
  );
}
