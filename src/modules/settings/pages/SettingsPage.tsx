import { asc } from "drizzle-orm";
import { db } from "@/core/db/client";
import { aiRoutes } from "@/core/db/schema/ai-routes";
import { ensureDefaultRoutes } from "@/core/ai/routing";
import { RoutesEditor } from "../components/RoutesEditor";

export async function SettingsPage() {
  await ensureDefaultRoutes();
  const routes = await db
    .select()
    .from(aiRoutes)
    .orderBy(asc(aiRoutes.taskKey));

  return (
    <div className="max-w-3xl">
      <RoutesEditor routes={routes} />
    </div>
  );
}
