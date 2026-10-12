"use client";

// Published comments — GET /api/comments?status=approved (paginated, newest
// first, server-side search). With Turnstile configured every comment is
// auto-approved and never enters the pending queue, so this is the only place
// one can be found again and deleted (PATCH action "delete", as for pending),
// or answered as the site's author (POST /api/admin/comments/:id/reply).

import { useCallback, useEffect, useState } from "react";
import {
  BUTTON_CLASS,
  CardHeader,
  ErrorLine,
  FOCUS_RING,
  INPUT_CLASS,
  Muted,
  NoteLink,
  RefreshButton,
  Unauthorized,
  adminFetch,
  fmtDateTime,
  type AdminCardProps,
} from "./shared";
import { useTick } from "./store";

/** Bump this tick (store.bump) to make the list re-read, e.g. after approvals. */
export const PUBLISHED_TICK = "published";

interface Comment {
  id: number;
  slug: string;
  name: string | null;
  body: string;
  created_at: number;
  /** 1 for a reply posted from here as the site's author. */
  author?: number;
}

const PAGE = 10;
const SEARCH_DEBOUNCE_MS = 250;

export function PublishedComments({ token, onUnauthorized, onToast }: AdminCardProps) {
  const reloadKey = useTick(PUBLISHED_TICK);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [offset, setOffset] = useState(0);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(query.trim());
      setOffset(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ status: "approved", limit: String(PAGE), offset: String(offset) });
      if (debounced) params.set("q", debounced);
      const data = await adminFetch<{ comments: Comment[]; total: number }>(
        `/api/comments?${params}`,
        token,
      );
      // Deleting the last row of the last page leaves an empty page: step back.
      if (data.comments.length === 0 && offset > 0 && data.total > 0) {
        setOffset(Math.max(0, Math.floor((data.total - 1) / PAGE) * PAGE));
        return;
      }
      setComments(data.comments);
      setTotal(data.total);
      setError(null);
    } catch (e) {
      if (e instanceof Unauthorized) onUnauthorized();
      else setError("Impossible de charger les commentaires publiés.");
    } finally {
      setBusy(false);
    }
  }, [token, offset, debounced, onUnauthorized]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  async function remove(c: Comment) {
    const who = c.name || "anonyme";
    if (!window.confirm(`Supprimer définitivement le commentaire de ${who} sur ${c.slug} ?`)) return;
    setBusyIds((s) => new Set(s).add(c.id));
    try {
      await adminFetch("/api/comments", token, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: c.id, action: "delete" }),
      });
      onToast("Commentaire supprimé.");
      await load();
    } catch (e) {
      if (e instanceof Unauthorized) onUnauthorized();
      else setError(`Le commentaire #${c.id} n'a pas pu être supprimé — réessaie.`);
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(c.id);
        return next;
      });
    }
  }

  async function sendReply(c: Comment) {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await adminFetch(`/api/admin/comments/${c.id}/reply`, token, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      setReplyTo(null);
      setDraft("");
      onToast("Réponse publiée.");
      setOffset(0);
      await load();
    } catch (e) {
      if (e instanceof Unauthorized) onUnauthorized();
      else setError("La réponse n'a pas pu être publiée — réessaie.");
    } finally {
      setSending(false);
    }
  }

  const from = total ? offset + 1 : 0;
  const to = Math.min(offset + PAGE, total);

  return (
    <section id="admin-published" className="admin-card">
      <CardHeader title="commentaires publiés" count={comments ? total : undefined}>
        <RefreshButton busy={busy} onClick={load} label="Actualiser les commentaires publiés" />
      </CardHeader>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Chercher par nom, note ou texte…"
        aria-label="Chercher dans les commentaires publiés"
        className={`mb-3 w-full ${INPUT_CLASS}`}
      />

      {error && <ErrorLine>{error}</ErrorLine>}
      {comments === null && !error && <Muted>Chargement…</Muted>}
      {comments?.length === 0 && (
        <Muted>{debounced ? `Aucun commentaire publié ne correspond à « ${debounced} ».` : "Aucun commentaire publié."}</Muted>
      )}

      <ul className="m-0 flex list-none flex-col gap-0 p-0">
        {comments?.map((c) => (
          <li key={c.id} className="admin-row py-2">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-small text-muted-warm">
              <span className="min-w-0 break-words">
                <strong className="text-ink">{c.name || "anonyme"}</strong>
                {c.author ? <span className="admin-pill ml-1">auteur</span> : null} sur <NoteLink slug={c.slug} />
              </span>
              <span className="flex items-baseline gap-3">
                <time className="tabular-nums">{fmtDateTime(c.created_at)}</time>
                {!c.author && (
                  <button
                    type="button"
                    aria-expanded={replyTo === c.id}
                    onClick={() => {
                      setReplyTo(replyTo === c.id ? null : c.id);
                      setDraft("");
                    }}
                    className={`rounded text-small text-ink underline-offset-2 hover:underline ${FOCUS_RING}`}
                  >
                    répondre
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyIds.has(c.id)}
                  onClick={() => remove(c)}
                  className={`rounded text-small text-danger underline-offset-2 hover:underline disabled:opacity-50 ${FOCUS_RING}`}
                >
                  supprimer
                </button>
              </span>
            </div>
            <p className="m-0 line-clamp-4 whitespace-pre-wrap break-words text-small text-ink">{c.body}</p>
            {replyTo === c.id && (
              <form
                className="mt-2 flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendReply(c);
                }}
              >
                <textarea
                  autoFocus
                  value={draft}
                  maxLength={4000}
                  rows={3}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setReplyTo(null);
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply(c);
                  }}
                  aria-label={`Réponse à ${c.name || "anonyme"}`}
                  placeholder="Ta réponse, publiée tout de suite avec le badge auteur…"
                  className={`w-full ${INPUT_CLASS}`}
                />
                <div className="flex gap-2">
                  <button type="submit" className={BUTTON_CLASS} disabled={sending || !draft.trim()}>
                    {sending ? "Publication…" : "Publier la réponse"}
                  </button>
                  <button type="button" className={BUTTON_CLASS} onClick={() => setReplyTo(null)}>
                    Annuler
                  </button>
                </div>
              </form>
            )}
          </li>
        ))}
      </ul>

      {total > PAGE && (
        <div className="mt-3 flex items-center justify-between gap-2 text-small text-muted-warm">
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={offset === 0 || busy}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
          >
            ← plus récents
          </button>
          <span className="tabular-nums">
            {from}–{to} sur {total}
          </span>
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={to >= total || busy}
            onClick={() => setOffset(offset + PAGE)}
          >
            plus anciens →
          </button>
        </div>
      )}
    </section>
  );
}
