"use client";

// "Do new-comment notifications still reach me?" — POST
// /api/admin/webhook-test sends one test line to COMMENT_WEBHOOK_URL (ntfy or
// any endpoint that takes a plain-text POST).

import { useState } from "react";
import { BUTTON_CLASS, CardHeader, ErrorLine, Muted, Unauthorized, authHeader, type AdminCardProps } from "./shared";

export function NotificationsCard({ token, onUnauthorized, onToast }: AdminCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function test() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/webhook-test", { method: "POST", headers: authHeader(token) });
      if (r.status === 401) throw new Unauthorized();
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      onToast("Notification de test envoyée.");
    } catch (e) {
      if (e instanceof Unauthorized) onUnauthorized();
      else setError(e instanceof Error ? e.message : "Échec de l'envoi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="admin-notifications" className="admin-card">
      <CardHeader title="notifications" />
      <Muted className="mb-3 not-italic">
        Chaque nouveau commentaire envoie une ligne à <code>COMMENT_WEBHOOK_URL</code>. Le bouton en envoie une de
        test pour vérifier qu&apos;elle arrive sur ton téléphone.
      </Muted>
      {error && <ErrorLine>{error}</ErrorLine>}
      <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={test}>
        {busy ? "Envoi…" : "Envoyer une notification de test"}
      </button>
    </section>
  );
}
