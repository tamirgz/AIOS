/**
 * Where a join link can hide.
 *
 * Google surfaces Meet calls as `hangoutLink`/`conferenceData`, but add-ons
 * behave differently: the Zoom add-on writes the join URL into the event's
 * *location* field, and some invites only mention it in the description.
 * Measured on the live calendar — a Zoom invite with a full HTML body and a
 * `us06web.zoom.us/j/…` location had no conferenceData at all.
 */
const CONFERENCE_URL =
  /https:\/\/(?:meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com|[\w.-]*webex\.com|meet\.jit\.si|whereby\.com)\/[^\s<>"'\\)]+/;

/** The first video-call URL in a blob of text (location, description…). */
export function firstConferenceUrl(
  text: string | null | undefined,
): string | null {
  if (!text) return null;
  return text.match(CONFERENCE_URL)?.[0] ?? null;
}
