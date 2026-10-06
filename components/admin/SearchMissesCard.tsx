"use client";

// Recherches sans résultat — GET /api/admin/search-misses. Queries that
// settled on zero results in the home search or the note drawer search
// (lib/search-miss.ts → POST /api/search-miss), counted per place. A note
// nobody wrote yet, or a spelling the index misses. "Ignorer" deletes the row
// (DELETE /api/admin/search-misses); it comes back if people keep missing.

import { useState } from "react";
import {
  BUTTON_CLASS,
  CardHeader,
  ErrorLine,
  FOCUS_RING,
  Muted,
  RefreshButton,
  Unauthorized,
  adminFetch,
  fmtDate,
  fmtDateTime,
  plural,
  type AdminCardProps,
} from "./shared";
import { URLS, setResource, useAdminResource } from "./store";

interface Miss {
  q: string;
  where: "home" | "note";
  count: number;
  first_seen: number;
  last_seen: number;
}
export interface MissesData {
  top: Miss[];
  recent: Miss[];
  total: number;
}

type View = "top" | "recent";
const VIEWS: { id: View; label: string }[] = [
  { id: "top", label: "fréquentes" },
  { id: "recent", label: "récentes" },
];
const WHERE_LABEL: Record<string, string> = { home: "accueil", note: "page de note" };

export function SearchMissesCard({ token, onUnauthorized, onToast }: AdminCardProps) {
  const res = useAdminResource<MissesData>(URLS.searchMisses, token, onUnauthorized);
  const data = res.data;
  const error = res.failed ? (res.error ?? "Impossible de charger les recherches sans résultat.") : null;
  const [view, setView] = useState<View>("top");
  const [removing, setRemoving] = useState<string | null>(null);

  const dismiss = async (m: Miss) => {
    const key = `${m.where}:${m.q}`;
    setRemoving(key);
    try {
      await adminFetch(
        `${URLS.searchMisses}?q=${encodeURIComponent(m.q)}&where=${m.where}`,
        token,
        { method: "DELETE" },
      );
      setResource<MissesData>(URLS.searchMisses, (d) => ({
        top: (d?.top ?? []).filter((x) => `${x.where}:${x.q}` !== key),
        recent: (d?.recent ?? []).filter((x) => `${x.where}:${x.q}` !== key),
        total: Math.max(0, (d?.total ?? 1) - 1),
      }));
      onToast(`« ${m.q} » ignorée.`);
    } catch (e) {
      if (e instanceof Unauthorized) onUnauthorized();
      else onToast("Suppression impossible.");
    } finally {
      setRemoving(null);
    }
  };

  const rows = data ? (view === "top" ? data.top : data.recent) : [];

  return (
    <section id="admin-search-misses" className="admin-card">
      <CardHeader title="recherches sans résultat" count={data ? data.total : undefined}>
        <RefreshButton busy={res.busy} onClick={() => res.reload()} label="Recharger les recherches sans résultat" />
      </CardHeader>
      <p className="m-0 mb-3 text-small text-muted-warm">
        Recherches d&apos;au moins trois caractères restées sans aucun résultat — une note à écrire, ou
        une graphie que l&apos;index ne rattrape pas.
      </p>

      <div role="group" aria-label="Ordre des recherches" className="admin-tabs mb-3">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={view === v.id}
            onClick={() => setView(v.id)}
            className={`admin-tab ${FOCUS_RING}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {error && <ErrorLine>{error}</ErrorLine>}
      {!data && !error && <Muted>Chargement…</Muted>}
      {data && rows.length === 0 && <Muted>Aucune recherche sans résultat pour l&apos;instant.</Muted>}
      {rows.length > 0 && (
        <ol className="admin-groups m-0 list-none p-0 text-small">
          {rows.map((m) => {
            const key = `${m.where}:${m.q}`;
            return (
              <li key={key}>
                <span className="admin-group-count tabular-nums">{m.count}×</span>
                <span className="flex min-w-0 items-start justify-between gap-3">
                  <span className="min-w-0 flex-1">
                    <a
                      href={`/?q=${encodeURIComponent(m.q)}`}
                      className={`block break-words rounded text-ink underline-offset-2 hover:underline ${FOCUS_RING}`}
                      title="Relancer la recherche sur l'accueil"
                    >
                      {m.q}
                    </a>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-muted-warm">
                      <span className="rounded-full bg-wash-2 px-2 py-px text-ink-2">
                        {WHERE_LABEL[m.where] ?? m.where}
                      </span>
                      <span>dernière : {fmtDateTime(m.last_seen)}</span>
                      {m.count > 1 && <span>première : {fmtDate(m.first_seen)}</span>}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={BUTTON_CLASS}
                    disabled={removing === key}
                    onClick={() => dismiss(m)}
                    aria-label={`Ignorer la recherche « ${m.q} » (${WHERE_LABEL[m.where] ?? m.where})`}
                  >
                    Ignorer
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {data && data.total > rows.length && (
        <p className="m-0 mt-3 text-micro text-muted-warm">
          {plural(rows.length, "recherche affichée", "recherches affichées")} sur {data.total}.
        </p>
      )}
    </section>
  );
}

export default SearchMissesCard;
