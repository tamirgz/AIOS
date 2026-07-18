"use server";

import { revalidatePath } from "next/cache";
import { setRoute } from "@/core/ai/routing";
import type { AIProviderId } from "@/core/db/schema/ai-routes";

export async function saveRoute(
  taskKey: string,
  provider: AIProviderId,
  model: string,
) {
  if (!model.trim()) throw new Error("model is required");
  await setRoute(taskKey, provider, model);
  revalidatePath("/m/settings");
}
