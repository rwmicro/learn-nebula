"use client";

// Commentaires en attente — GET /api/comments?status=pending (polled), PATCH
// to approve/delete one (`id`) or a selection (`ids`). Built for speed: tick
// several and act once, or drive the queue from the keyboard (a/d/j/k/x on a
// focused comment). Comments containing a blocked word come back `flagged` by
// the server and are marked here; the list itself is edited in BlockedWords.
// Deleting ONE comment is undoable: it leaves the list at once but the PATCH
// only goes out after UNDO_MS (or when the page is left), so a stray `d` next
// to `a` costs nothing.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  BUTTON_CLASS,
  CardHeader,
  ErrorLine,
  FOCUS_RING,
  INPUT_CLASS,
  Muted,
  NoteLink,
  RefreshButton,
  UNDO_MS,
  Unauthorized,
  adminFetch,
  fmtDateTime,
  plural,
  type AdminCardProps,
} from "./shared";
import { URLS, bump, setResource, useAdminResource } from "./store";
import { PUBLISHED_TICK } from "./PublishedComments";
import { BlockedWords } from "./BlockedWords";

export interface PendingComment {
  id: number;
  slug: string;
  name: string | null;
  body: string;
  created_at: number;
  /** Blocked words found in the name or body (absent from older servers). */
  flagged?: string[];
}
export interface PendingData {
  comments: PendingComment[];
}

const POLL_MS = 30_000;

/** The note's last two path segments — the full slug is in the tooltip. */
function shortSlug(slug: string): string {
  const parts = slug.split("/");
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : slug;
}
type Action = "approve" | "delete";

export function PendingComments({ token, onUnauthorized, onToast }: AdminCardProps) {
  const res = useAdminResource<PendingData>(URLS.pending, token, onUnauthorized, { pollMs: POLL_MS });
  const all = res.data?.comments ?? null;
  const [query, setQuery] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // Deletions waiting out their undo delay: hidden here (a poll still returns
  // them), sent when their timer fires.
  const [deferred, setDeferred] = useState<Set<number>>(new Set());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const pending = all && (deferred.size ? all.filter((c) => !deferred.has(c.id)) : all);
  const itemRefs = useRef(new Map<number, HTMLLIElement>());
  // Index to focus once the list re-renders after a keyboard action.
  const refocus = useRef<number | null>(null);

  const q = query.trim().toLowerCase();
  const flaggedCount = pending?.filter((c) => c.flagged?.length).length ?? 0;
  const filtered =
    pending?.filter(
      (c) =>
        (!onlyFlagged || !!c.flagged?.length) &&
        (!q ||
          c.slug.toLowerCase().includes(q) ||
          (c.name ?? "").toLowerCase().includes(q) ||
          c.body.toLowerCase().includes(q)),
    ) ?? [];
  // Only what's visible can be acted on in bulk.
  const selectedShown = filtered.filter((c) => selected.has(c.id)).map((c) => c.id);
  const allShownSelected = filtered.length > 0 && selectedShown.length === filtered.length;

  useEffect(() => {
    if (refocus.current === null) return;
    const i = Math.min(refocus.current, filtered.length - 1);
    refocus.current = null;
    if (i >= 0) itemRefs.current.get(filtered[i].id)?.focus();
  });

  function drop(ids: number[]) {
    const gone = new Set(ids);
    setResource<PendingData>(URLS.pending, (prev) => ({
      comments: (prev?.comments ?? []).filter((c) => !gone.has(c.id)),
    }));
    setSelected((s) => new Set([...s].filter((id) => !gone.has(id))));
  }

  function markBusy(ids: number[], on: boolean) {
    setBusyIds((s) => {
      const next = new Set(s);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  /** `focusIndex`: after a keyboard action, where focus goes once the row is gone. */
  async function moderate(ids: number[], action: Action, focusIndex?: number, quiet = false) {
    if (!ids.length) return;
    markBusy(ids, true);
    try {
      await adminFetch("/api/comments", token, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ids.length === 1 ? { id: ids[0], action } : { ids, action }),
      });
      if (focusIndex !== undefined) refocus.current = focusIndex;
      drop(ids);
      if (action === "approve") bump(PUBLISHED_TICK);
      setError(null);
      if (quiet) return;
      const n = ids.length;
      onToast(
        n === 1
          ? action === "approve"
            ? "Commentaire approuvé."
            : "Commentaire supprimé."
          : `${n} commentaires ${action === "approve" ? "approuvés" : "supprimés"}.`,
      );
    } catch (e) {
      if (e instanceof Unauthorized) onUnauthorized();
      else
        setError(
          ids.length === 1
            ? `Le commentaire #${ids[0]} n'a pas pu être ${action === "approve" ? "approuvé" : "supprimé"} — réessaie.`
            : `Action groupée impossible — réessaie.`,
        );
    } finally {
      markBusy(ids, false);
    }
  }

  const unhide = useCallback((id: number) => {
    setDeferred((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }, []);

  /** Delete one comment, undoably: see the header comment. */
  function deleteLater(id: number, focusIndex?: number) {
    if (timers.current.has(id)) return;
    if (focusIndex !== undefined) refocus.current = focusIndex;
    setDeferred((s) => new Set(s).add(id));
    setSelected((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        // Still hidden until the server answers; shown again if it fails.
        moderate([id], "delete", undefined, true).finally(() => unhide(id));
      }, UNDO_MS),
    );
    onToast("Commentaire supprimé.", {
      label: "Annuler",
      run: () => {
        const t = timers.current.get(id);
        if (!t) return;
        clearTimeout(t);
        timers.current.delete(id);
        unhide(id);
      },
    });
  }

  // Leaving the page (or disconnecting) mid-delay still sends what is due.
  useEffect(() => {
    const pendingTimers = timers.current;
    const flush = () => {
      const ids = [...pendingTimers.keys()];
      if (!ids.length) return;
      for (const t of pendingTimers.values()) clearTimeout(t);
      pendingTimers.clear();
      fetch("/api/comments", {
        method: "PATCH",
        keepalive: true,
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(ids.length === 1 ? { id: ids[0], action: "delete" } : { ids, action: "delete" }),
      }).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [token]);

  function bulk(action: Action) {
    const n = selectedShown.length;
    if (!n) return;
    const verb = action === "approve" ? "Approuver" : "Supprimer définitivement";
    if (!window.confirm(`${verb} ${plural(n, "commentaire")} ?`)) return;
    moderate(selectedShown, action);
  }

  function toggle(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((s) => {
      const next = new Set(s);
      for (const c of filtered) {
        if (allShownSelected) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });
  }

  function onItemKey(e: KeyboardEvent<HTMLLIElement>, c: PendingComment, i: number) {
    // Only when the comment itself has focus: typing in a field or pressing a
    // button inside it keeps its usual meaning.
    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
    const focusAt = (j: number) => {
      const next = filtered[Math.max(0, Math.min(filtered.length - 1, j))];
      if (next) itemRefs.current.get(next.id)?.focus();
    };
    switch (e.key.toLowerCase()) {
      case "a":
      case "d":
        e.preventDefault();
        if (busyIds.has(c.id)) return;
        if (e.key.toLowerCase() === "a") moderate([c.id], "approve", i);
        else deleteLater(c.id, i);
        break;
      case "j":
      case "arrowdown":
        e.preventDefault();
        focusAt(i + 1);
        break;
      case "k":
      case "arrowup":
        e.preventDefault();
        focusAt(i - 1);
        break;
      case "x":
      case " ":
        e.preventDefault();
        toggle(c.id);
        break;
    }
  }

  const countLabel =
    pending && pending.length > 0
      ? filtered.length !== pending.length
        ? `${filtered.length}/${pending.length}`
        : pending.length
      : undefined;

  return (
    <section id="admin-pending" className="admin-card">
      <CardHeader title="commentaires en attente" count={countLabel}>
        <RefreshButton busy={res.busy} onClick={() => res.reload()} label="Actualiser les commentaires en attente" />
      </CardHeader>

      {pending && pending.length > 0 && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrer par nom, note ou texte…"
              aria-label="Filtrer les commentaires en attente"
              className={`grow basis-56 ${INPUT_CLASS}`}
            />
            {flaggedCount > 0 && (
              <label className="admin-check text-small text-muted-warm">
                <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
                seulement les signalés ({flaggedCount})
              </label>
            )}
          </div>
          <div className="admin-bulkbar">
            <label className="admin-check text-small">
              <input
                type="checkbox"
                checked={allShownSelected}
                ref={(el) => {
                  if (el) el.indeterminate = selectedShown.length > 0 && !allShownSelected;
                }}
                onChange={toggleAll}
                disabled={!filtered.length}
              />
              {selectedShown.length ? `${plural(selectedShown.length, "sélectionné")}` : "tout sélectionner"}
            </label>
            <span className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => bulk("approve")}
                disabled={!selectedShown.length}
                className={`admin-btn-primary ${FOCUS_RING}`}
              >
                Approuver la sélection
              </button>
              <button
                type="button"
                onClick={() => bulk("delete")}
                disabled={!selectedShown.length}
                className={`${BUTTON_CLASS} admin-btn-danger`}
              >
                Supprimer
              </button>
            </span>
          </div>
        </>
      )}

      {(error || res.failed) && (
        <ErrorLine>{error ?? "Impossible de charger les commentaires en attente."}</ErrorLine>
      )}
      {pending === null && !res.failed && <Muted>Chargement…</Muted>}
      {pending?.length === 0 && <Muted>Rien en attente.</Muted>}
      {pending && pending.length > 0 && filtered.length === 0 && (
        <Muted>{q ? `Aucun commentaire ne correspond à « ${query} ».` : "Aucun commentaire signalé."}</Muted>
      )}

      {filtered.length > 0 && (
        <ul className="admin-queue" aria-label="File de modération">
          {filtered.map((c, i) => {
            const flagged = c.flagged ?? [];
            const busy = busyIds.has(c.id);
            return (
              <li
                key={c.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(c.id, el);
                  else itemRefs.current.delete(c.id);
                }}
                tabIndex={0}
                aria-label={`Commentaire de ${c.name || "anonyme"} sur ${c.slug}${flagged.length ? ", signalé" : ""}`}
                onKeyDown={(e) => onItemKey(e, c, i)}
                className={`admin-queue-item ${FOCUS_RING}${flagged.length ? " is-flagged" : ""}${
                  selected.has(c.id) ? " is-selected" : ""
                }${busy ? " is-busy" : ""}`}
              >
                <input
                  type="checkbox"
                  className="admin-queue-check"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  aria-label={`Sélectionner le commentaire de ${c.name || "anonyme"}`}
                />
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-small text-muted-warm">
                    <span className="min-w-0 break-words">
                      <strong className="text-ink">{c.name || "anonyme"}</strong> sur{" "}
                      <span title={c.slug}>
                        <NoteLink slug={c.slug}>{shortSlug(c.slug)}</NoteLink>
                      </span>
                    </span>
                    <time className="tabular-nums">{fmtDateTime(c.created_at)}</time>
                  </div>
                  {flagged.length > 0 && (
                    <p className="admin-flag m-0 mb-1 text-micro">
                      mot{flagged.length > 1 ? "s" : ""} bloqué{flagged.length > 1 ? "s" : ""} :{" "}
                      {flagged.map((w) => `« ${w} »`).join(", ")}
                    </p>
                  )}
                  <p className="m-0 mb-2 whitespace-pre-wrap break-words text-body">{c.body}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => moderate([c.id], "approve")}
                      className={`admin-btn-primary ${FOCUS_RING}`}
                    >
                      Approuver
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => deleteLater(c.id, i)}
                      className={BUTTON_CLASS}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {filtered.length > 0 && (
        <p className="admin-kbd-legend m-0 mt-3 text-micro text-muted-warm">
          Clavier, sur un commentaire (Tab pour y entrer) : <kbd>a</kbd> approuver · <kbd>d</kbd> supprimer ·{" "}
          <kbd>j</kbd>/<kbd>k</kbd> suivant/précédent · <kbd>x</kbd> sélectionner
        </p>
      )}

      <BlockedWords token={token} onUnauthorized={onUnauthorized} onToast={onToast} />
    </section>
  );
}
