"use client";

// Mots bloqués — GET/PUT /api/admin/blocked-words. One word or phrase per
// line; matching (server/blocked-words.ts) ignores case and accents and only
// hits whole words. Saving re-reads the pending queue so its flags update.

import { useEffect, useState } from "react";
import { BUTTON_CLASS, ErrorLine, FOCUS_RING, Unauthorized, adminFetch, plural, type AdminCardProps } from "./shared";
import { URLS, loadResource, setResource, useAdminResource } from "./store";

interface BlockedData {
  words: string[];
  hold: boolean;
  max?: number;
}

export function BlockedWords({ token, onUnauthorized, onToast }: AdminCardProps) {
  const res = useAdminResource<BlockedData>(URLS.blockedWords, token, onUnauthorized);
  const [text, setText] = useState("");
  const [hold, setHold] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirror the server copy into the form whenever it (re)loads.
  useEffect(() => {
    if (!res.data) return;
    setText(res.data.words.join("\n"));
    setHold(res.data.hold);
  }, [res.data]);

  const words = text
    .split("\n")
    .map((w) => w.trim())
    .filter(Boolean);
  const dirty =
    !!res.data && (words.join("\n") !== res.data.words.join("\n") || hold !== res.data.hold);

  async function save() {
    setSaving(true);
    try {
      const data = await adminFetch<BlockedData>(URLS.blockedWords, token, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ words, hold }),
      });
      setResource(URLS.blockedWords, data);
      setError(null);
      onToast(`Liste enregistrée — ${plural(data.words.length, "mot bloqué", "mots bloqués")}.`);
      await loadResource(URLS.pending, token, { silent: true });
    } catch (e) {
      if (e instanceof Unauthorized) onUnauthorized();
      else setError("Enregistrement impossible — réessaie.");
    } finally {
      setSaving(false);
    }
  }

  const count = res.data?.words.length ?? 0;

  return (
    <details className="admin-details admin-blocked mt-3">
      <summary className="text-small">
        <span className="admin-details-title text-ink">Mots bloqués</span>
        <span className="text-micro text-muted-warm">
          {res.data ? plural(count, "mot", "mots") : res.failed ? "indisponible" : "…"}
        </span>
      </summary>
      <div className="admin-details-body">
        <p className="m-0 mb-2 text-micro text-muted-warm">
          Un mot ou une expression par ligne. Les commentaires qui en contiennent sont signalés dans la file
          (mot entier, sans tenir compte des majuscules ni des accents).
        </p>
        {res.failed && <ErrorLine>Impossible de charger la liste.</ErrorLine>}
        {error && <ErrorLine>{error}</ErrorLine>}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          spellCheck={false}
          aria-label="Mots bloqués, un par ligne"
          placeholder={"casino\npilule bleue"}
          disabled={!res.data}
          className={`admin-textarea w-full rounded border border-rule-strong bg-transparent px-2 py-1 text-small ${FOCUS_RING}`}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="admin-check text-small text-muted-warm">
            <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} disabled={!res.data} />
            retenir en modération même si l&apos;anti-robot les valide
          </label>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className={`${BUTTON_CLASS} ml-auto`}
          >
            {saving ? "…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </details>
  );
}
