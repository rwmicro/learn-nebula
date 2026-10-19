// Browser side of the passkeys (server/routes/passkey.ts): sign in from the
// e-mail field's autofill, create one after a magic-link login, list and
// delete them in /compte. Every entry point feature-detects first, and a
// browser without WebAuthn simply keeps the magic link.

import {
  WebAuthnAbortService,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

export interface Passkey {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
}

const BASE = "/api/auth/passkey";

async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body ?? {}),
  });
}

export const passkeysSupported = (): boolean => {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
};

/** Conditional create ("save a passkey?" without a dialog of ours). */
export async function canAutoRegister(): Promise<boolean> {
  try {
    const PKC = window.PublicKeyCredential as unknown as {
      getClientCapabilities?: () => Promise<Record<string, boolean>>;
    };
    if (!PKC?.getClientCapabilities) return false;
    const caps = await PKC.getClientCapabilities();
    return caps.conditionalCreate === true;
  } catch {
    return false;
  }
}

/**
 * Arms the passkey autofill on the login form's e-mail field (it needs
 * `autocomplete="username webauthn"`). Resolves true once the reader picked a
 * passkey and the server opened the session; false when unsupported,
 * dismissed or refused. `cancel()` from the effect's cleanup.
 */
export async function autofillSignIn(): Promise<boolean> {
  if (!passkeysSupported() || !(await browserSupportsWebAuthnAutofill().catch(() => false))) return false;
  const r = await post("/login/options").catch(() => null);
  if (!r?.ok) return false;
  try {
    const response = await startAuthentication({ optionsJSON: await r.json(), useBrowserAutofill: true });
    const v = await post("/login/verify", { response });
    return v.ok;
  } catch {
    return false;
  }
}

export function cancelPasskey(): void {
  try {
    WebAuthnAbortService.cancelCeremony();
  } catch {
    /* nothing pending */
  }
}

/** Creates a passkey for the signed-in reader. `auto`: conditional create,
 *  which the browser may silently decline. Returns the new list, or null. */
export async function createPasskey(auto = false): Promise<Passkey[] | null> {
  const r = await post("/register/options").catch(() => null);
  if (!r?.ok) return null;
  try {
    const response = await startRegistration({ optionsJSON: await r.json(), useAutoRegister: auto });
    const v = await post("/register/verify", { response });
    if (!v.ok) return null;
    return ((await v.json()) as { passkeys: Passkey[] }).passkeys;
  } catch {
    return null;
  }
}

export async function listPasskeys(): Promise<Passkey[] | null> {
  try {
    const r = await fetch(BASE, { cache: "no-store", credentials: "same-origin" });
    if (!r.ok) return null;
    return ((await r.json()) as { passkeys: Passkey[] }).passkeys;
  } catch {
    return null;
  }
}

export async function deletePasskey(id: string): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
    return r.ok;
  } catch {
    return false;
  }
}

/** Right after a magic-link login: if the browser can create a passkey
 *  without a dialog (conditional create) and the reader has none yet, offer
 *  one that way. Fires `gk:passkeys` when one was made; otherwise /compte's
 *  "Créer une passkey" button remains. */
export async function autoRegisterAfterLogin(): Promise<void> {
  if (!passkeysSupported() || !(await canAutoRegister())) return;
  const keys = await listPasskeys();
  if (!keys || keys.length) return;
  const made = await createPasskey(true);
  if (made) window.dispatchEvent(new CustomEvent("gk:passkeys"));
}
