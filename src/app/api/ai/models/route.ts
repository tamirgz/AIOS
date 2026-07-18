import { providers } from "@/core/ai/routing";
import type { AIProviderId } from "@/core/db/schema/ai-routes";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const providerId = searchParams.get("provider") as AIProviderId | null;
  const provider = providerId ? providers[providerId] : null;
  if (!provider) {
    return Response.json({ error: "unknown provider" }, { status: 400 });
  }
  try {
    const models = await provider.listModels();
    return Response.json({ models });
  } catch (e) {
    return Response.json({ models: [], error: String(e) }, { status: 200 });
  }
}
