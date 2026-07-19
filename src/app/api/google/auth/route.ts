import { getSetting } from "@/core/app-settings";
import { buildAuthUrl, GOOGLE_KEYS } from "@/modules/calendar/google";

export async function GET(req: Request) {
  const clientId = await getSetting(GOOGLE_KEYS.clientId);
  if (!clientId) {
    return Response.json(
      { error: "Set google_client_id in Settings first" },
      { status: 400 },
    );
  }
  const origin = new URL(req.url).origin;
  return Response.redirect(buildAuthUrl(clientId, origin), 302);
}
