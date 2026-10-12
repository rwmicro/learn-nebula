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
  fmtShort,
  fmtDateTime,
  plural,
  type AdminCardProps,
} from "./shared";
import { URLS, setResource, useAdminResource } from "./store";
import { SortTable, type Column } from "./SortTable";

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

const WHERE_LABEL: Record<string, string> = { home: "accueil", note: "page de note" };

export function SearchMissesCard({ token, onUnauthorized, onToast }: AdminCardProps) {
  const res = useAdminResource<MissesData>(URLS.searchMisses, token, onUnauthorized);
  const data = res.data;
  const error = res.failed ? (res.error ?? "Impossible de charger les recherches sans résultat.") : null;
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

  // The server sends the most frequent and the most recent; one sortable
  // table holds both.
  const rows = data
    ? [...new Map([...data.top, ...data.recent].map((m) => [`${m.where}:${m.q}`, m])).values()]
    : [];
  const columns: Column<Miss>[] = [
    {
      id: "q",
      label: "Recherche",
      sortValue: (m) => m.q,
      cell: (m) => (
        <a
          href={`/?q=${encodeURIComponent(m.q)}`}
          className={`break-words rounded text-ink underline-offset-2 hover:underline ${FOCUS_RING}`}
          title="Relancer la recherche sur l'accueil"
        >
          {m.q}
        </a>
      ),
    },
    { id: "where", label: "Où", sortValue: (m) => m.where, cell: (m) => WHERE_LABEL[m.where] ?? m.where },
    { id: "count", label: "Fois", sortValue: (m) => m.count, numeric: true, cell: (m) => m.count },
    { id: "last", label: "Dernière", sortValue: (m) => m.last_seen, numeric: true, cell: (m) => <span title={fmtDateTime(m.last_seen)}>{fmtShort(m.last_seen)}</span> },
    { id: "first", label: "Première", sortValue: (m) => m.first_seen, numeric: true, wideOnly: true, cell: (m) => <span title={fmtDateTime(m.first_seen)}>{fmtShort(m.first_seen)}</span> },
    {
      id: "act",
      label: "",
      cell: (m) => (
        <button
          type="button"
          className={`${BUTTON_CLASS} admin-btn-sm`}
          disabled={removing === `${m.where}:${m.q}`}
          onClick={() => dismiss(m)}
          aria-label={`Ignorer la recherche « ${m.q} » (${WHERE_LABEL[m.where] ?? m.where})`}
        >
          Ignorer
        </button>
      ),
    },
  ];

  return (
    <section id="admin-search-misses" className="admin-card">
      <CardHeader title="recherches sans résultat" count={data ? data.total : undefined}>
        <RefreshButton busy={res.busy} onClick={() => res.reload()} label="Recharger les recherches sans résultat" />
      </CardHeader>
      <p className="m-0 mb-3 text-small text-muted-warm">
        Recherches d&apos;au moins trois caractères restées sans aucun résultat — une note à écrire, ou
        une graphie que l&apos;index ne rattrape pas.
      </p>

      {error && <ErrorLine>{error}</ErrorLine>}
      {!data && !error && <Muted>Chargement…</Muted>}
      {data && rows.length === 0 && <Muted>Aucune recherche sans résultat pour l&apos;instant.</Muted>}
      {rows.length > 0 && (
        <SortTable
          caption="Recherches sans résultat"
          rows={rows}
          columns={columns}
          rowKey={(m) => `${m.where}:${m.q}`}
          initialSort={{ id: "count", dir: "desc" }}
        />
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
