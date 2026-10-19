// Passkeys for reader accounts, beside the magic link (server/routes/auth.ts),
// which stays the way in for a new device and the fallback for everything.
//
//   POST   /api/auth/passkey/register/options → creation options (signed in)
//   POST   /api/auth/passkey/register/verify { response } → { ok, passkey }
//   POST   /api/auth/passkey/login/options    → request options (discoverable)
//   POST   /api/auth/passkey/login/verify { response } → { ok } (sets gk_session)
//   GET    /api/auth/passkey                  → { passkeys: PasskeyView[] }
//   DELETE /api/auth/passkey/:id              → { ok: true }
//
// Challenges live in memory only (ChallengeStore: five minutes, single use);
// a login challenge is found again from the clientDataJSON it was signed in.
// The relying party is PUBLIC_URL / SITE_URL's host: no usable base, no
// passkeys (passkeyRp() null → 503 everywhere, and /api/auth/config says so).

import { Hono, type Context } from "hono";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { SITE_TITLE } from "../../lib/site.ts";
import { database } from "../db.ts";
import { getIp } from "../http.ts";
import { Quota } from "../ratelimit.ts";
import { createSession } from "../account-store.ts";
import { currentUser, noStore, publicBase, sameOrigin, setSessionCookie } from "../session.ts";
import {
  CHALLENGE_TTL_MS,
  ChallengeStore,
  challengeOf,
  deviceLabel,
  parseTransports,
  relyingParty,
  toCredential,
  userHandle,
  type RelyingParty,
} from "../passkeys.ts";
import {
  MAX_PASSKEYS,
  countPasskeys,
  credentialById,
  deleteCredential,
  insertCredential,
  listPasskeys,
  touchCredential,
  userCredentials,
} from "../passkey-store.ts";

/** The relying party, or null when the base URL can't carry passkeys. */
export function passkeyRp(): RelyingParty | null {
  return relyingParty(publicBase());
}

const challenges = new ChallengeStore();
const sweep = setInterval(() => challenges.sweep(), 60_000);
if (typeof sweep.unref === "function") sweep.unref();

// Same spirit as the magic link's quotas: generous for a person, a wall for a
// script. Login per IP; registration and deletion per account.
const loginQuota = new Quota(30, 10 * 60_000);
const accountQuota = new Quota(20, 60 * 60_000);

export const passkeyRoute = new Hono();
passkeyRoute.use("*", sameOrigin, noStore);
passkeyRoute.onError((e, c) => {
  console.error("passkey: request failed", e);
  return c.json({ error: "unavailable" }, 503);
});

const disabled = (c: Context) => c.json({ error: "disabled" }, 503);
const unauthenticated = (c: Context) => c.json({ error: "unauthenticated" }, 401);

async function responseOf(c: Context): Promise<{ response: unknown } | null> {
  try {
    const b = (await c.req.json()) as { response?: unknown };
    return b && typeof b.response === "object" && b.response ? { response: b.response } : null;
  } catch {
    return null;
  }
}

// --- registration (signed in) -------------------------------------------------

passkeyRoute.post("/register/options", async (c) => {
  const rp = passkeyRp();
  if (!rp) return disabled(c);
  const uid = currentUser(c);
  if (!uid) return unauthenticated(c);
  if (accountQuota.exceeded(`u:${uid}`)) return c.json({ error: "rate-limited" }, 429);
  const db = database();
  if (countPasskeys(db, uid) >= MAX_PASSKEYS) return c.json({ error: "too-many" }, 409);
  const email = (db.prepare("SELECT email FROM users WHERE id = ?").get(uid) as { email: string } | undefined)?.email;
  if (!email) return unauthenticated(c);
  const options = await generateRegistrationOptions({
    rpName: SITE_TITLE,
    rpID: rp.id,
    userName: email,
    userDisplayName: email,
    userID: userHandle(uid),
    attestationType: "none",
    excludeCredentials: userCredentials(db, uid).map((r) => ({ id: r.id, transports: parseTransports(r.transports) })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  challenges.put(`reg:${uid}`, options.challenge);
  return c.json(options);
});

passkeyRoute.post("/register/verify", async (c) => {
  const rp = passkeyRp();
  if (!rp) return disabled(c);
  const uid = currentUser(c);
  if (!uid) return unauthenticated(c);
  const body = await responseOf(c);
  if (!body) return c.json({ error: "invalid" }, 400);
  const expected = challenges.take(`reg:${uid}`);
  if (!expected) return c.json({ error: "expired" }, 400);
  let result;
  try {
    result = await verifyRegistrationResponse({
      response: body.response as RegistrationResponseJSON,
      expectedChallenge: expected,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      // A passkey made by conditional create (right after a magic-link
      // login) carries no user verification; the session already vouches.
      requireUserVerification: false,
    });
  } catch {
    return c.json({ error: "invalid" }, 400);
  }
  if (!result.verified) return c.json({ error: "invalid" }, 400);
  const { credential } = result.registrationInfo;
  const db = database();
  const label = deviceLabel(c.req.header("user-agent"));
  if (!insertCredential(db, { id: credential.id, userId: uid, publicKey: credential.publicKey, counter: credential.counter, transports: credential.transports ?? [], label })) {
    return c.json({ error: "exists" }, 409);
  }
  return c.json({ ok: true, passkeys: listPasskeys(db, uid) });
});

// --- login (discoverable credentials, no e-mail asked) -------------------------

passkeyRoute.post("/login/options", async (c) => {
  const rp = passkeyRp();
  if (!rp) return disabled(c);
  if (loginQuota.exceeded(`ip:${getIp(c)}`)) return c.json({ error: "rate-limited" }, 429);
  // The autofill waits on the open form: as long as the challenge lives.
  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: "preferred",
    timeout: CHALLENGE_TTL_MS,
  });
  challenges.put(`login:${options.challenge}`, options.challenge);
  return c.json(options);
});

passkeyRoute.post("/login/verify", async (c) => {
  const rp = passkeyRp();
  if (!rp) return disabled(c);
  if (loginQuota.exceeded(`ip:${getIp(c)}`)) return c.json({ error: "rate-limited" }, 429);
  const body = await responseOf(c);
  if (!body) return c.json({ error: "invalid" }, 400);
  const sent = challengeOf(body.response);
  const expected = sent ? challenges.take(`login:${sent}`) : null;
  if (!expected) return c.json({ error: "expired" }, 400);
  const response = body.response as AuthenticationResponseJSON;
  const db = database();
  const row = typeof response.id === "string" ? credentialById(db, response.id) : null;
  // Same answer for an unknown key and a bad signature.
  if (!row) return c.json({ error: "unknown" }, 400);
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: expected,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      credential: toCredential(row),
      requireUserVerification: false,
    });
  } catch {
    return c.json({ error: "unknown" }, 400);
  }
  if (!result.verified) return c.json({ error: "unknown" }, 400);
  touchCredential(db, row.id, result.authenticationInfo.newCounter);
  setSessionCookie(c, createSession(db, row.user_id));
  return c.json({ ok: true });
});

// --- my passkeys ----------------------------------------------------------------

passkeyRoute.get("/", (c) => {
  if (!passkeyRp()) return disabled(c);
  const uid = currentUser(c);
  if (!uid) return unauthenticated(c);
  return c.json({ passkeys: listPasskeys(database(), uid) });
});

passkeyRoute.delete("/:id", (c) => {
  const uid = currentUser(c);
  if (!uid) return unauthenticated(c);
  if (accountQuota.exceeded(`u:${uid}`)) return c.json({ error: "rate-limited" }, 429);
  const id = c.req.param("id");
  if (!deleteCredential(database(), uid, id)) return c.json({ error: "not-found" }, 404);
  return c.json({ ok: true });
});
