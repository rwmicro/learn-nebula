"use client";

// Owner-only tool: comment moderation (approve/delete the pending queue,
// search it, bulk-approve) + a glance at the assistant's RAG index health.
// Both already exist server-side (server/routes/comments.ts, GET /healthz) —
// this is the missing UI; until now the only way to moderate was a raw
// `curl` with the bearer token (see .env.example / README). Gated purely by
// the same COMMENTS_ADMIN_TOKEN the API already checks — this page has no
// secrets of its own, it just calls the protected endpoints with whatever
// token the owner pastes in.

import { useCallback, useEffect, useRef, useState } from "react";

const TOKEN_KEY = "gkAdminToken";
const POLL_MS = 30_000;

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-garden focus-visible:outline-offset-2";

interface PendingComment {
  id: number;
  slug: string;
  name: string | null;
  body: string;
  created_at: number;
}
interface QuestionLogEntry {
  id: number;
  question: string;
  scope: string | null;
  locale: string | null;
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

export function AdminPanel() {
  // `token` is only ever the LAST one that actually worked; `connected` gates
  // the UI so a wrong guess doesn't lock the reader out of the input to fix it
  // (the form stays up, with the error, until a request actually succeeds).
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [pending, setPending] = useState<PendingComment[] | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingBusy, setPendingBusy] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [questions, setQuestions] = useState<QuestionLogEntry[] | null>(null);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [questionsBusy, setQuestionsBusy] = useState(false);
  const [questionsQuery, setQuestionsQuery] = useState("");
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
      setHealthError(null);
    } catch {
      setHealthError("Impossible de joindre /healthz.");
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
      refreshQuestions(tok, { silent: true });
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

  /** Same shape as refreshPending, for the read-only questions log. */
  const refreshQuestions = useCallback(async (tok: string, opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setQuestionsBusy(true);
    try {
      const r = await fetch("/api/questions", {
        headers: { authorization: `Bearer ${tok}` },
      });
      if (r.status === 401) return; // tryConnect/refreshPending already surface this
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setQuestions(data.questions ?? []);
      if (!opts.silent) setQuestionsError(null);
    } catch {
      if (!opts.silent) setQuestionsError("Impossible de charger le journal des questions.");
    } finally {
      if (!opts.silent) setQuestionsBusy(false);
    }
  }, []);

  // Re-poll while connected, so activity from another tab/visitor shows up
  // without a manual reload. Silent: no loading flicker.
  // (Below refreshPending/refreshQuestions's own declarations — `const`s, not
  // hoisted like a function declaration, so this must come after them.)
  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => {
      refreshPending(token, { silent: true });
      refreshQuestions(token, { silent: true });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [connected, token, refreshPending, refreshQuestions]);

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
    setQuery("");
    setQuestions(null);
    setQuestionsError(null);
    setQuestionsQuery("");
  }

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

  const qq = questionsQuery.trim().toLowerCase();
  const filteredQuestions = questions?.filter(
    (r) =>
      !qq ||
      r.question.toLowerCase().includes(qq) ||
      (r.scope ?? "").toLowerCase().includes(qq),
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
    <div className="mx-auto max-w-[42rem] px-6 py-10">
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

      {/* --- RAG health: no token required, GET /healthz is public. --- */}
      <section className="admin-card">
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
        {healthError && <p className="m-0 text-small text-danger">{healthError}</p>}
        {!healthError && !health && <p className="m-0 text-small italic text-muted-warm">Chargement…</p>}
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
          {/* --- Comment moderation: things to decide. --- */}
          <section className="admin-card mt-6">
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
                    <time>{new Date(c.created_at).toLocaleString()}</time>
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

          {/* --- Questions log: an append-only record, nothing to decide. --- */}
          <section className="admin-card mt-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="admin-eyebrow m-0 text-small font-semibold text-muted-warm">
                  questions récentes
                </h2>
                {questions && questions.length > 0 && (
                  <span className="rounded-full bg-wash-2 px-2 py-px text-micro font-semibold text-ink-2">
                    {qq && filteredQuestions?.length !== questions.length
                      ? `${filteredQuestions?.length ?? 0}/${questions.length}`
                      : questions.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => refreshQuestions(token)}
                disabled={questionsBusy}
                aria-label="Actualiser le journal des questions"
                className={`rounded text-small text-muted-warm hover:text-ink disabled:opacity-40 ${FOCUS_RING}`}
              >
                {questionsBusy ? "…" : "↻"}
              </button>
            </div>
            <p className="m-0 mb-3 text-small text-muted-warm">
              Ce que les visiteurs demandent à l&apos;assistant — utile pour repérer les
              sujets mal couverts par le jardin.
            </p>

            {questions && questions.length > 3 && (
              <input
                type="search"
                value={questionsQuery}
                onChange={(e) => setQuestionsQuery(e.target.value)}
                placeholder="Filtrer par texte ou dossier…"
                className={`mb-3 w-full rounded border border-rule-strong bg-transparent px-2 py-1 text-small ${FOCUS_RING}`}
              />
            )}

            {questionsError && <p className="m-0 mb-3 text-small text-danger">{questionsError}</p>}
            {questions === null && !questionsError && (
              <p className="m-0 text-small italic text-muted-warm">Chargement…</p>
            )}
            {questions?.length === 0 && (
              <p className="m-0 text-small italic text-muted-warm">Aucune question pour l&apos;instant.</p>
            )}
            {questions && questions.length > 0 && filteredQuestions?.length === 0 && (
              <p className="m-0 text-small italic text-muted-warm">
                Aucune question ne correspond à « {questionsQuery} ».
              </p>
            )}

            <ul className="admin-log text-small">
              {filteredQuestions?.map((r) => (
                <li key={r.id}>
                  <time>{new Date(r.created_at).toLocaleString()}</time>
                  {r.scope && (
                    <span className="admin-log-scope rounded-full bg-wash-2 px-2 py-px text-micro text-ink-2">
                      {r.scope}
                    </span>
                  )}
                  <span className="admin-log-question text-ink">{r.question}</span>
                </li>
              ))}
            </ul>
          </section>
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
