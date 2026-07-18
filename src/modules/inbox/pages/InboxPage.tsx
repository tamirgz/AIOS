import { listInbox } from "../actions";
import { InboxList } from "../components/InboxList";

export async function InboxPage() {
  const items = await listInbox();
  return <InboxList items={items} />;
}
