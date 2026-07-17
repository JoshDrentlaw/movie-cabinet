import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  authEnabled,
  checkPassword,
  isAuthorized,
  SESSION_COOKIE,
  sessionToken,
} from "../src/auth.ts";

function withPassword(password: string | null, fn: () => Promise<void>): Promise<void> {
  if (password === null) Deno.env.delete("AUTH_PASSWORD");
  else Deno.env.set("AUTH_PASSWORD", password);
  return fn().finally(() => Deno.env.delete("AUTH_PASSWORD"));
}

Deno.test("auth is disabled when no password is configured", () =>
  withPassword(null, async () => {
    assertFalse(authEnabled());
    assert(await isAuthorized(new Request("http://x/")));
    assertFalse(await checkPassword(""));
  }));

Deno.test("checkPassword accepts only the exact password", () =>
  withPassword("popcorn", async () => {
    assert(authEnabled());
    assert(await checkPassword("popcorn"));
    assertFalse(await checkPassword("Popcorn"));
    assertFalse(await checkPassword(""));
  }));

Deno.test("isAuthorized requires a valid session cookie", () =>
  withPassword("popcorn", async () => {
    assertFalse(await isAuthorized(new Request("http://x/")));
    const good = new Request("http://x/", {
      headers: { cookie: `${SESSION_COOKIE}=${await sessionToken()}` },
    });
    assert(await isAuthorized(good));
    const bad = new Request("http://x/", {
      headers: { cookie: `${SESSION_COOKIE}=deadbeef` },
    });
    assertFalse(await isAuthorized(bad));
  }));

Deno.test("changing the password invalidates old sessions", () =>
  withPassword("popcorn", async () => {
    const oldToken = await sessionToken();
    Deno.env.set("AUTH_PASSWORD", "newpassword");
    const req = new Request("http://x/", {
      headers: { cookie: `${SESSION_COOKIE}=${oldToken}` },
    });
    assertFalse(await isAuthorized(req));
    assertEquals(oldToken === (await sessionToken()), false);
  }));
