"use client";

// Comptes lecteurs — GET /api/admin/accounts: the totals, then every account
// (e-mail, sign-up, last visit, coins, synced progress keys), most recently
// active first. Read-only; a filter narrows by address.

import { useState } from "react";
import {
  CardHeader,
  ErrorLine,
  INPUT_CLASS,
  Muted,
  RefreshButton,
  fmtDate,
  type AdminCardProps,
} from "./shared";
import { URLS, useAdminResource } from "./store";

interface Account {
  id: number;
  email: string;
  createdAt: number;
  lastSeen: number | null;
  coins: number;
  progressKeys: number;
}
export interface AccountsData {
  accounts: number;
  active7d: number;
  coinsInCirculation: number;
  /** Absent from servers older than the list. */
  list?: Account[];
}

const SHOWN = 50;
const NUM = new Intl.NumberFormat("fr-FR");

export function AccountsCard({ token, onUnauthorized }: AdminCardProps) {
  const res = useAdminResource<AccountsData>(
    URLS.accounts,
    token,
    onUnauthorized,
  );
  const data = res.data;
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);

  const q = query.trim().toLowerCase();
  const list = data?.list ?? [];
  const filtered = q ? list.filter((a) => a.email.includes(q)) : list;
  const shown = all ? filtered : filtered.slice(0, SHOWN);

  return (
    <section id="admin-accounts" className="admin-card">
      <CardHeader
        title="comptes lecteurs"
        count={data ? data.accounts : undefined}
      >
        <RefreshButton
          busy={res.busy}
          onClick={() => res.reload()}
          label="Actualiser les comptes"
        />
      </CardHeader>
      {res.failed && (
        <ErrorLine>
          {res.error ?? "Impossible de charger les comptes."}
        </ErrorLine>
      )}
      {!data && !res.failed && <Muted>Chargement…</Muted>}
      {data && (
        <>
          <dl className="admin-dl m-0 mb-3">
            <dt>Actifs sur 7 jours</dt>
            <dd className="tabular-nums">{NUM.format(data.active7d)}</dd>
            <dt>Pièces en circulation</dt>
            <dd className="tabular-nums">
              {NUM.format(data.coinsInCirculation)}
            </dd>
          </dl>
          {list.length > 0 && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrer par adresse…"
              aria-label="Filtrer les comptes par adresse"
              className={`mb-2 w-full ${INPUT_CLASS}`}
            />
          )}
          {data.accounts === 0 && (
            <Muted>Aucun compte pour l&apos;instant.</Muted>
          )}
          {list.length > 0 && filtered.length === 0 && (
            <Muted>Aucune adresse ne contient « {query} ».</Muted>
          )}
          {shown.length > 0 && (
            <ul className="admin-accounts m-0 list-none p-0">
              {shown.map((a) => (
                <li key={a.id} className="admin-row admin-account">
                  <span className="admin-subject font-semibold text-ink">
                    {a.email}
                  </span>
                  <span className="admin-account-meta text-micro text-muted-warm">
                    inscrit le {fmtDate(a.createdAt)} ·{" "}
                    {a.lastSeen
                      ? `vu le ${fmtDate(a.lastSeen)}`
                      : "jamais revu"}{" "}
                    ·{" "}
                    <span className="tabular-nums">{NUM.format(a.coins)}</span>{" "}
                    pièces ·{" "}
                    <span className="tabular-nums">
                      {NUM.format(a.progressKeys)}
                    </span>{" "}
                    clés de progression
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!all && filtered.length > SHOWN && (
            <button
              type="button"
              onClick={() => setAll(true)}
              className="mt-2 rounded text-small text-muted-warm underline underline-offset-2 hover:text-ink"
            >
              Afficher les {filtered.length} comptes
            </button>
          )}
        </>
      )}
    </section>
  );
}
