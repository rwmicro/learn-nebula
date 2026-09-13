"use client";

// Owner-only tool: comment moderation (approve/delete the pending queue) +
// a glance at the assistant's RAG index health. Both already exist server-side
// (server/routes/comments.ts, GET /healthz) — this is the missing UI; until
// now the only way to moderate was a raw `curl` with the bearer token (see
// .env.example / README). Gated purely by the same COMMENTS_ADMIN_TOKEN the
// API already checks — this page has no secrets of its own, it just calls the
// protected endpoints with whatever token the owner pastes in.

import { useEffect, useState } from "react";

const TOKEN_KEY = "gkAdminToken";

interface PendingComment {
  id: number;
  slug: string;
  name: string | null;
  body: string;
  created_at: number;
}
interface Health {
  ok: boolean;
  generate: boolean;
  rag: { state: string; chunks: number; dim: number };
}

export function AdminPanel() {
  // `token` is only ever the LAST one that actually worked; `connected` gates
  // the UI so a wrong guess doesn't lock the reader out of the input to fix it
  // (the form stays up, with the error, until a request actually succeeds).
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingComment[] | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/healthz")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setHealth)
      .catch(() => setHealthError("Impossible de joindre /healthz."));
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TOKEN_KEY);
      if (saved) {
        setTokenInput(saved);
        tryConnect(saved);
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  async function tryConnect(tok: string) {
    setPendingError(null);
    try {
      const r = await fetch("/api/comments?status=pending", {
        headers: { authorization: `Bearer ${tok}` },
      });
      if (r.status === 401) {
        setPendingError("Jeton invalide (ou modération non configurée côté serveur).");
        setConnected(false);
        try {
          localStorage.removeItem(TOKEN_KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setPending(data.comments ?? []);
      setToken(tok);
      setConnected(true);
      try {
        localStorage.setItem(TOKEN_KEY, tok);
      } catch {
        /* ignore */
      }
    } catch {
      setPendingError("Impossible de charger les commentaires en attente.");
      setConnected(false);
    }
  }

  function disconnect() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    setToken("");
    setConnected(false);
    setPending(null);
    setPendingError(null);
    setTokenInput("");
  }

  async function act(id: number, action: "approve" | "delete") {
    setBusyIds((s) => new Set(s).add(id));
    try {
      const r = await fetch("/api/comments", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, action }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setPending((list) => list?.filter((c) => c.id !== id) ?? null);
    } catch {
      setPendingError(`Échec de l'action sur le commentaire #${id} — réessaie.`);
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="mx-auto max-w-[42rem] px-6 py-10">
      <h1 className="m-0 mb-6 font-serif text-2xl font-bold text-black">Administration</h1>

      {/* --- RAG health: no token required, GET /healthz is public. --- */}
      <section className="mb-8 rounded border border-[#e4e2dd] p-4">
        <h2 className="m-0 mb-2 text-small font-semibold uppercase tracking-[0.08em] text-[#787369]">
          État de l&apos;assistant
        </h2>
        {healthError && <p className="m-0 text-small text-[#b23]">{healthError}</p>}
        {!healthError && !health && <p className="m-0 text-small italic text-[#787369]">Chargement…</p>}
        {health && (
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small">
            <dt className="text-[#787369]">Génération</dt>
            <dd className="m-0">{health.generate ? "configurée" : "désactivée (pas de clé LLM)"}</dd>
            <dt className="text-[#787369]">Index RAG</dt>
            <dd className="m-0">{health.rag.state}</dd>
            <dt className="text-[#787369]">Extraits indexés</dt>
            <dd className="m-0">{health.rag.chunks} (dimension {health.rag.dim || "—"})</dd>
          </dl>
        )}
      </section>

      {/* --- Comment moderation: gated by the admin token. --- */}
      <section>
        <h2 className="m-0 mb-2 text-small font-semibold uppercase tracking-[0.08em] text-[#787369]">
          Commentaires en attente
        </h2>

        {!connected ? (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (tokenInput.trim()) tryConnect(tokenInput.trim());
              }}
            >
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Jeton admin (COMMENTS_ADMIN_TOKEN)"
                autoComplete="off"
                className="min-w-0 flex-1 border border-[#ccc] bg-transparent px-2 py-1 text-small"
              />
              <button
                type="submit"
                className="shrink-0 rounded bg-garden px-3 py-1 text-small font-semibold text-[#fcfcfc] hover:bg-garden-dark"
              >
                Se connecter
              </button>
            </form>
            {pendingError && <p className="m-0 mt-2 text-small text-[#b23]">{pendingError}</p>}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={disconnect}
              className="mb-3 text-small text-[#787369] underline underline-offset-2 hover:text-black"
            >
              se déconnecter
            </button>

            {pendingError && <p className="m-0 mb-3 text-small text-[#b23]">{pendingError}</p>}
            {pending === null && !pendingError && (
              <p className="m-0 text-small italic text-[#787369]">Chargement…</p>
            )}
            {pending?.length === 0 && (
              <p className="m-0 text-small italic text-[#787369]">Rien en attente.</p>
            )}

            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {pending?.map((c) => (
                <li key={c.id} className="rounded border border-[#e4e2dd] p-3">
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-small text-[#787369]">
                    <span>
                      <strong className="text-black">{c.name || "anonyme"}</strong> sur{" "}
                      <a href={`/posts/${c.slug}/`} className="text-garden underline-offset-2 hover:underline">
                        {c.slug}
                      </a>
                    </span>
                    <time>{new Date(c.created_at).toLocaleString()}</time>
                  </div>
                  <p className="m-0 mb-2 whitespace-pre-wrap text-body">{c.body}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyIds.has(c.id)}
                      onClick={() => act(c.id, "approve")}
                      className="rounded bg-garden px-2 py-1 text-small font-semibold text-[#fcfcfc] hover:bg-garden-dark disabled:opacity-50"
                    >
                      Approuver
                    </button>
                    <button
                      type="button"
                      disabled={busyIds.has(c.id)}
                      onClick={() => act(c.id, "delete")}
                      className="rounded border border-[#ccc] px-2 py-1 text-small hover:bg-[#f0f0ec] disabled:opacity-50"
                    >
                      Supprimer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
