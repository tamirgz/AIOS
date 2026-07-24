import { isGoogleConnected } from "@/modules/calendar/google";
import { listRecentMessages } from "../queries";
import { gmailAuthorized } from "../sync";
import { GmailList } from "../components/GmailList";

export async function GmailPage() {
  const [connected, authorized, messages] = await Promise.all([
    isGoogleConnected(),
    gmailAuthorized(),
    listRecentMessages(50),
  ]);
  return (
    <GmailList messages={messages} connected={connected} authorized={authorized} />
  );
}
