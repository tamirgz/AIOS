import { eq } from "drizzle-orm";
import { db } from "@/core/db/client";
import type { ModuleRouteProps } from "@/core/modules/types.server";
import { GlassPanel } from "@/core/ui/GlassPanel";
import { IdeaDetail } from "../components/IdeaDetail";
import { ideas } from "../schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function IdeaDetailPage({ params }: ModuleRouteProps) {
  const id = params[0];
  const [idea] = UUID_RE.test(id)
    ? await db.select().from(ideas).where(eq(ideas.id, id))
    : [];

  if (!idea) {
    return (
      <GlassPanel className="px-8 py-16 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-flare">
          idea not found
        </p>
      </GlassPanel>
    );
  }
  return <IdeaDetail idea={idea} />;
}
