"use client";

import { useEffect } from "react";
import { autofillSignIn, cancelPasskey } from "@/lib/passkey-client";
import { readHint, writeHint } from "@/lib/account-client";
import { nextParam } from "@/components/account/use-turnstile";

/**
 * Passkeys in the login form's e-mail autofill (conditional mediation): the
 * field must carry `autocomplete="username webauthn"`. Picking a passkey signs
 * in at once; the magic link below stays for every other case. Re-armed after
 * a refused attempt (an expired challenge, a dismissed prompt) a few times.
 */
export function usePasskeyAutofill(enabled: boolean | undefined) {
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let tries = 0;
    const arm = () => {
      void autofillSignIn().then((ok) => {
        if (!live) return;
        if (ok) {
          writeHint({ ...readHint(), in: true });
          const next = nextParam();
          if (next) location.assign(next);
          else location.reload();
        } else if (++tries < 3) window.setTimeout(arm, 1000);
      });
    };
    arm();
    return () => {
      live = false;
      cancelPasskey();
    };
  }, [enabled]);
}
