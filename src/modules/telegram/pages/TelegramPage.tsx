import { listChannels, recentPosts } from "../queries";
import { TelegramView } from "../components/TelegramView";

export async function TelegramPage() {
  const channels = await listChannels();
  const active = channels[0] ?? null;
  const posts = active ? await recentPosts(active.username) : [];
  return (
    <TelegramView
      channels={channels}
      activeUsername={active?.username ?? null}
      posts={posts}
    />
  );
}
