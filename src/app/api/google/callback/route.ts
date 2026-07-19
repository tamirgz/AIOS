import { exchangeCode } from "@/modules/calendar/google";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (err || !code) {
    return Response.redirect(
      `${url.origin}/m/settings?google=${encodeURIComponent(err ?? "no-code")}`,
      302,
    );
  }
  try {
    await exchangeCode(code, url.origin);
    return Response.redirect(`${url.origin}/m/settings?google=connected`, 302);
  } catch (e) {
    return Response.redirect(
      `${url.origin}/m/settings?google=${encodeURIComponent(String(e).slice(0, 120))}`,
      302,
    );
  }
}
