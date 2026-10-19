"use client";

// Erreurs chez les lecteurs — GET /api/admin/client-errors. Uncaught
// exceptions and unhandled rejections reported by /js/error-beacon.js (and by
// the error boundaries), one row per message and place, counted. "Ignorer"
// deletes the row; it comes back if the error happens again.

import { useState } from "react";
import {
  BUTTON_CLASS,
  CardHeader,
  ErrorLine,
  Muted,
  RefreshButton,
  Unauthorized,
  adminFetch,
  fmtDateTime,
  fmtShort,
  type AdminCardProps,
} from "./shared";
import { URLS, setResource, useAdminResource } from "./store";
import { SortTable, type Column } from "./SortTable";

interface ClientError {
  key: string;
  message: string;
  source: string;
  line: number;
  stack: string;
  path: string;
  count: number;
  first_seen: number;
  last_seen: number;
}
export interface ClientErrorsData {
  errors: ClientError[];
  total: number;
}

export const CLIENT_ERRORS_ID = "admin-client-errors";

export function ClientErrorsCard({ token, onUnauthorized, onToast }: AdminCardProps) {
  const res = useAdminResource<ClientErrorsData>(URLS.clientErrors, token, onUnauthorized);
  const data = res.data;
  const error = res.failed ? (res.error ?? "Impossible de charger les erreurs.") : null;
  const [removing, setRemoving] = useState<string | null>(null);

  const dismiss = async (e: ClientError) => {
    setRemoving(e.key);
    try {
      await adminFetch(`${URLS.clientErrors}?key=${encodeURIComponent(e.key)}`, token, { method: "DELETE" });
      setResource<ClientErrorsData>(URLS.clientErrors, (d) => ({
        errors: (d?.errors ?? []).filter((x) => x.key !== e.key),
        total: Math.max(0, (d?.total ?? 1) - 1),
      }));
      onToast("Erreur ignorée.");
    } catch (err) {
      if (err instanceof Unauthorized) onUnauthorized();
      else onToast("Suppression impossible.");
    } finally {
      setRemoving(null);
    }
  };

  const columns: Column<ClientError>[] = [
    {
      id: "message",
      label: "Erreur",
      sortValue: (e) => e.message,
      cell: (e) => (
        <details>
          <summary className="cursor-pointer break-words">{e.message}</summary>
          <p className="m-0 mt-1 text-micro text-muted-warm">
            {e.source}
            {e.line ? `:${e.line}` : ""} · <a href={e.path}>{e.path}</a>
          </p>
          {e.stack && <pre className="m-0 mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-micro">{e.stack}</pre>}
        </details>
      ),
    },
    { id: "count", label: "Fois", sortValue: (e) => e.count, numeric: true, cell: (e) => e.count },
    {
      id: "last",
      label: "Dernière",
      sortValue: (e) => e.last_seen,
      numeric: true,
      cell: (e) => <span title={fmtDateTime(e.last_seen)}>{fmtShort(e.last_seen)}</span>,
    },
    {
      id: "act",
      label: "",
      cell: (e) => (
        <button
          type="button"
          className={`${BUTTON_CLASS} admin-btn-sm`}
          disabled={removing === e.key}
          onClick={() => dismiss(e)}
          aria-label={`Ignorer l'erreur ${e.message}`}
        >
          Ignorer
        </button>
      ),
    },
  ];

  return (
    <section id={CLIENT_ERRORS_ID} className="admin-card admin-card--wide">
      <CardHeader title="erreurs chez les lecteurs" count={data ? data.total : undefined}>
        <RefreshButton busy={res.busy} onClick={() => res.reload()} label="Recharger les erreurs" />
      </CardHeader>
      <p className="m-0 mb-3 text-small text-muted-warm">
        Erreurs JavaScript non rattrapées dans le navigateur des lecteurs, regroupées par message.
      </p>
      {error && <ErrorLine>{error}</ErrorLine>}
      {!data && !error && <Muted>Chargement…</Muted>}
      {data && data.errors.length === 0 && <Muted>Aucune erreur signalée.</Muted>}
      {data && data.errors.length > 0 && (
        <SortTable
          caption="Erreurs chez les lecteurs"
          rows={data.errors}
          columns={columns}
          rowKey={(e) => e.key}
          initialSort={{ id: "last", dir: "desc" }}
        />
      )}
    </section>
  );
}

export default ClientErrorsCard;
