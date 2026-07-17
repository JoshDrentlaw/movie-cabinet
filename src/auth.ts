/**
 * Single shared-password login for running the app on a public server.
 *
 * Designed to stay out of the way: one family password (AUTH_PASSWORD env),
 * and a successful login sets a year-long cookie so each device only ever
 * logs in once. When AUTH_PASSWORD is unset (e.g. local development), auth
 * is disabled entirely.
 */

export const SESSION_COOKIE = "cabinet_session";
const YEAR_SECONDS = 60 * 60 * 24 * 365;

export function authEnabled(): boolean {
  return Boolean(Deno.env.get("AUTH_PASSWORD"));
}

function secret(): string {
  return Deno.env.get("SESSION_SECRET") || Deno.env.get("AUTH_PASSWORD") || "";
}

async function hmacHex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Comparing HMACs under a random per-process key makes the comparison
// timing-safe without leaking anything about either input.
const compareKey = crypto.randomUUID();
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  return (await hmacHex(compareKey, a)) === (await hmacHex(compareKey, b));
}

/** The session token is derived from the secret, so changing the password logs everyone out. */
export function sessionToken(): Promise<string> {
  return hmacHex(secret(), "movie-cabinet-session-v1");
}

export async function checkPassword(password: string): Promise<boolean> {
  const expected = Deno.env.get("AUTH_PASSWORD") ?? "";
  return expected !== "" && (await timingSafeEqual(password, expected));
}

export async function isAuthorized(req: Request): Promise<boolean> {
  if (!authEnabled()) return true;
  const match = (req.headers.get("cookie") ?? "").match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([0-9a-f]+)`),
  );
  if (!match) return false;
  return timingSafeEqual(match[1], await sessionToken());
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Max-Age=${YEAR_SECONDS}; Path=/; HttpOnly; SameSite=Lax` +
    (secure ? "; Secure" : "");
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax` +
    (secure ? "; Secure" : "");
}
