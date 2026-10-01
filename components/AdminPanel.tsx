"use client";

// Owner-only tool: comment moderation (approve/delete the pending queue,
// search it, bulk-approve; browse and delete published comments), the
// assistant's RAG index health, whether the live image is behind the vault,
// the questions visitors ask (with frequent / poorly covered views) and the
// build-time vault health report. Gated purely by the same
// COMMENTS_ADMIN_TOKEN the API already checks — this page has no secrets of
// its own, it just calls the protected endpoints with whatever token the
// owner pastes in. The cards past the pending queue live in components/admin/.

import { useCallback, useEffect, useRef, useState } from "react";
import { FOCUS_RING, Muted, fmtDateTime } from "./admin/shared";
import { VersionCard } from "./admin/VersionCard";
import { PublishedComments } from "./admin/PublishedComments";
import { QuestionsCard } from "./admin/QuestionsCard";
import { VaultHealthCard } from "./admin/VaultHealthCard";

const TOKEN_KEY = "gkAdminToken";
const POLL_MS = 30_000;

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

/** Colour encodes real state, at a glance — not decoration. */
function ragDotColor(state: string): string {
  switch (state) {
    case "ready":
      return "var(--garden)";
    case "loading":
      return "var(--warn)";
    case "error":
      return "var(--danger)";
    default:
      return "var(--faint)"; // disabled / unknown
  }
}

/** In-page menu, in the order the cards are laid out once connected. */
const ADMIN_SECTIONS: [string, string][] = [
  ["admin-assistant", "assistant"],
  ["admin-version", "version"],
  ["admin-pending", "en attente"],
  ["admin-published", "publiés"],
  ["admin-questions", "questions"],
  ["admin-health", "santé du coffre"],
];

export function AdminPanel() {
  // `token` is only ever the LAST one that actually worked; `connected` gates
  // the UI so a wrong guess doesn't lock the reader out of the input to fix it
  // (the form stays up, with the error, until a request actually succeeds).
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  // Unreachable /healthz is the normal state of a static preview (no Node
  // server behind it), so it's reported neutrally, not as an error.
  const [healthDown, setHealthDown] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [pending, setPending] = useState<PendingComment[] | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingBusy, setPendingBusy] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [query, setQuery] = useState("");
  // Bumped when a pending comment is approved, so the published list reloads.
  const [publishedKey, setPublishedKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  async function loadHealth() {
    setHealthBusy(true);
    try {
      const r = await fetch("/healthz");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setHealth(await r.json());
      setHealthDown(false);
    } catch {
      setHealth(null);
      setHealthDown(true);
    } finally {
      setHealthBusy(false);
    }
  }
  useEffect(() => {
    loadHealth();
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

  /** For an already-connected session: manual refresh button, or the silent
   *  poll above. If the token stops working mid-session, disconnect cleanly
   *  instead of leaving a stale list up with no way to tell it's stale.
   *  useCallback (stable identity, no closed-over state to go stale — `tok`
   *  is always passed in fresh) so the polling effect below can list it as a
   *  dependency without re-subscribing every render. */
  const refreshPending = useCallback(async (tok: string, opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setPendingBusy(true);
    try {
      const r = await fetch("/api/comments?status=pending", {
        headers: { authorization: `Bearer ${tok}` },
      });
      if (r.status === 401) {
        disconnect();
        setPendingError("Le jeton n'est plus valide — reconnecte-toi.");
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setPending(data.comments ?? []);
      if (!opts.silent) setPendingError(null);
    } catch {
      if (!opts.silent) setPendingError("Impossible de charger les commentaires en attente.");
    } finally {
      if (!opts.silent) setPendingBusy(false);
    }
  }, []);

  // Re-poll while connected, so activity from another tab/visitor shows up
  // without a manual reload. Silent: no loading flicker.
  // (Below refreshPending's own declaration — a `const`, not
  // hoisted like a function declaration, so this must come after it.)
  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => {
      refreshPending(token, { silent: true });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [connected, token, refreshPending]);

  /** Stable identity: the cards in components/admin/ call it on a 401 and
   *  list it as an effect dependency. Touches only setters. */
  const disconnect = useCallback(() => {
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
    setQuery("");
  }, []);

  /** A card saw a 401 mid-session: same as refreshPending's handling. */
  const expired = useCallback(() => {
    disconnect();
    setPendingError("Le jeton n'est plus valide — reconnecte-toi.");
  }, [disconnect]);

  async function act(id: number, action: "approve" | "delete", opts: { silent?: boolean } = {}) {
    setBusyIds((s) => new Set(s).add(id));
    try {
      const r = await fetch("/api/comments", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, action }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setPending((list) => list?.filter((c) => c.id !== id) ?? null);
      if (action === "approve") setPublishedKey((k) => k + 1);
      if (!opts.silent) showToast(action === "approve" ? "Commentaire approuvé." : "Commentaire supprimé.");
      return true;
    } catch {
      setPendingError(`Le commentaire #${id} n'a pas pu être ${action === "approve" ? "approuvé" : "supprimé"} — réessaie.`);
      return false;
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = pending?.filter(
    (c) =>
      !q ||
      c.slug.toLowerCase().includes(q) ||
      (c.name ?? "").toLowerCase().includes(q) ||
      c.body.toLowerCase().includes(q),
  );

  async function approveAllShown() {
    if (!filtered?.length) return;
    const ids = filtered.map((c) => c.id);
    if (!window.confirm(`Approuver ${ids.length} commentaire${ids.length > 1 ? "s" : ""} ?`)) return;
    setBulkBusy(true);
    let ok = 0;
    for (const id of ids) {
      if (await act(id, "approve", { silent: true })) ok++;
    }
    setBulkBusy(false);
    showToast(`${ok}/${ids.length} commentaire${ids.length > 1 ? "s" : ""} approuvé${ok > 1 ? "s" : ""}.`);
  }

  return (
    <div className="admin-panel mx-auto max-w-[42rem] px-6 py-10">
      <h1 className="admin-title m-0 mb-6 flex items-center gap-2 text-2xl font-bold text-ink">
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="text-garden"
        >
          <path d="M7 20h10" />
          <path d="M10 20c5.5-2.5.8-6.4 3-10" />
          <path d="M9 12C6 12 4 9.5 4 6c3.5 0 5 2 5 4" />
          <path d="M15 10c3 0 5-2.5 5-6-3.5 0-5 2-5 5" />
        </svg>
        administration
      </h1>

      {connected && (
        <div className="mb-6 flex items-center gap-2 text-small text-muted-warm">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: "var(--garden)" }}
          />
          connecté
          <button
            type="button"
            onClick={disconnect}
            className={`rounded underline underline-offset-2 hover:text-ink ${FOCUS_RING}`}
          >
            se déconnecter
          </button>
        </div>
      )}

      {connected && (
        <nav aria-label="Sections de l&apos;administration" className="admin-toc">
          <ul>
            {ADMIN_SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className={`rounded ${FOCUS_RING}`}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* --- RAG health: no token required, GET /healthz is public. --- */}
      <section id="admin-assistant" className="admin-card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="admin-eyebrow m-0 text-small font-semibold text-muted-warm">
            état de l&apos;assistant
          </h2>
          <button
            type="button"
            onClick={loadHealth}
            disabled={healthBusy}
            aria-label="Rafraîchir l'état de l'assistant"
            className={`rounded text-small text-muted-warm hover:text-ink disabled:opacity-40 ${FOCUS_RING}`}
          >
            {healthBusy ? "…" : "↻"}
          </button>
        </div>
        {healthDown && <Muted>Serveur non joignable — normal en aperçu statique.</Muted>}
        {!healthDown && !health && <Muted>Chargement…</Muted>}
        {health && (
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small">
            <dt className="text-muted-warm">Génération</dt>
            <dd className="m-0">{health.generate ? "configurée" : "désactivée (pas de clé LLM)"}</dd>
            <dt className="text-muted-warm">Index RAG</dt>
            <dd className="m-0 flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: ragDotColor(health.rag.state) }}
              />
              {health.rag.state}
            </dd>
            <dt className="text-muted-warm">Extraits indexés</dt>
            <dd className="m-0">
              {health.rag.chunks} (dimension {health.rag.dim || "—"})
            </dd>
          </dl>
        )}
      </section>

      {!connected ? (
        /* --- Single auth step: unlocks both cards below. --- */
        <section className="admin-card mt-6">
          <h2 className="admin-eyebrow m-0 mb-2 text-small font-semibold text-muted-warm">
            connexion
          </h2>
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
              className={`min-w-0 flex-1 rounded border border-rule-strong bg-transparent px-2 py-1 text-small ${FOCUS_RING}`}
            />
            <button
              type="submit"
              className={`shrink-0 rounded bg-garden px-3 py-1 text-small font-semibold text-paper hover:bg-garden-dark ${FOCUS_RING}`}
            >
              Se connecter
            </button>
          </form>
          {pendingError && <p className="m-0 mt-2 text-small text-danger">{pendingError}</p>}
        </section>
      ) : (
        <>
          <VersionCard token={token} onUnauthorized={expired} />

          {/* --- Comment moderation: things to decide. --- */}
          <section id="admin-pending" className="admin-card">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="admin-eyebrow m-0 text-small font-semibold text-muted-warm">
                  commentaires en attente
                </h2>
                {pending && pending.length > 0 && (
                  <span className="rounded-full bg-wash-2 px-2 py-px text-micro font-semibold text-ink-2">
                    {/* Reflects what's actually on screen, not the unfiltered total
                        — showing "4" while a search narrows the list to 1 card
                        would read as a bug, not a filter. */}
                    {q && filtered?.length !== pending.length
                      ? `${filtered?.length ?? 0}/${pending.length}`
                      : pending.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => refreshPending(token)}
                disabled={pendingBusy}
                aria-label="Actualiser les commentaires en attente"
                className={`rounded text-small text-muted-warm hover:text-ink disabled:opacity-40 ${FOCUS_RING}`}
              >
                {pendingBusy ? "…" : "↻"}
              </button>
            </div>

            {pending && pending.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filtrer par nom, note ou texte…"
                  className={`min-w-0 flex-1 rounded border border-rule-strong bg-transparent px-2 py-1 text-small ${FOCUS_RING}`}
                />
                {pending.length > 1 && (
                  <button
                    type="button"
                    onClick={approveAllShown}
                    disabled={bulkBusy || !filtered?.length}
                    className={`shrink-0 rounded border border-rule-strong px-2 py-1 text-small hover:bg-wash-2 disabled:opacity-40 ${FOCUS_RING}`}
                  >
                    {bulkBusy ? "…" : `tout approuver${query ? " (filtré)" : ""}`}
                  </button>
                )}
              </div>
            )}

            {pendingError && <p className="m-0 mb-3 text-small text-danger">{pendingError}</p>}
            {pending === null && !pendingError && (
              <p className="m-0 text-small italic text-muted-warm">Chargement…</p>
            )}
            {pending?.length === 0 && (
              <p className="m-0 text-small italic text-muted-warm">Rien en attente.</p>
            )}
            {pending && pending.length > 0 && filtered?.length === 0 && (
              <p className="m-0 text-small italic text-muted-warm">
                Aucun commentaire ne correspond à « {query} ».
              </p>
            )}

            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {filtered?.map((c) => (
                <li key={c.id} className="rounded border border-rule p-3">
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-small text-muted-warm">
                    <span>
                      <strong className="text-ink">{c.name || "anonyme"}</strong> sur{" "}
                      <a
                        href={`/posts/${c.slug}/`}
                        className={`rounded text-garden underline-offset-2 hover:underline ${FOCUS_RING}`}
                      >
                        {c.slug}
                      </a>
                    </span>
                    <time className="tabular-nums">{fmtDateTime(c.created_at)}</time>
                  </div>
                  <p className="m-0 mb-2 whitespace-pre-wrap text-body">{c.body}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyIds.has(c.id)}
                      onClick={() => act(c.id, "approve")}
                      className={`rounded bg-garden px-2 py-1 text-small font-semibold text-paper hover:bg-garden-dark disabled:opacity-50 ${FOCUS_RING}`}
                    >
                      Approuver
                    </button>
                    <button
                      type="button"
                      disabled={busyIds.has(c.id)}
                      onClick={() => act(c.id, "delete")}
                      className={`rounded border border-rule-strong px-2 py-1 text-small hover:bg-wash-2 disabled:opacity-50 ${FOCUS_RING}`}
                    >
                      Supprimer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <PublishedComments
            token={token}
            onUnauthorized={expired}
            onToast={showToast}
            reloadKey={publishedKey}
          />

          {/* --- Questions log: an append-only record, nothing to decide. --- */}
          <QuestionsCard token={token} onUnauthorized={expired} />

          <VaultHealthCard token={token} onUnauthorized={expired} />
        </>
      )}

      {toast && (
        <div
          role="status"
          className="admin-toast fixed bottom-6 left-1/2 -translate-x-1/2 rounded bg-ink px-3 py-2 text-small text-paper shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
