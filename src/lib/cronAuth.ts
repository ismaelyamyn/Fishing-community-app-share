import { timingSafeEqual } from "node:crypto";

// True only when the request carries "Authorization: Bearer <CRON_SECRET>".
// Compared in constant time so the secret cannot be guessed from response timing.
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
