"use client";

// Published comments — GET /api/comments?status=approved (paginated, newest
// first, server-side search). With Turnstile configured every comment is
// auto-approved and never enters the pending queue, so this is the only place
// one can be found again and deleted (PATCH action "delete", as for pending).

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
} from "./shared";

interface Comment {
  id: number;
  slug: string;
  name: string | null;
  body: string;
  created_at: number;
}

const PAGE = 10;
const SEARCH_DEBOUNCE_MS = 250;

export function PublishedComments({
  token,
  onUnauthorized,
  onToast,
  reloadKey,
}: {
  token: string;
  onUnauthorized: () => void;
  onToast: (msg: string) => void;
  /** Bumped by the panel when a pending comment gets approved. */
  reloadKey: number;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [offset, setOffset] = useState(0);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

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
                <strong className="text-ink">{c.name || "anonyme"}</strong> sur <NoteLink slug={c.slug} />
              </span>
              <span className="flex items-baseline gap-3">
                <time className="tabular-nums">{fmtDateTime(c.created_at)}</time>
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
