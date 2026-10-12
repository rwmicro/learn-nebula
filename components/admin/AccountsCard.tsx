"use client";

// Comptes lecteurs — GET /api/admin/accounts: the totals, then every account
// in a sortable table (e-mail, sign-up, last visit, coins, coins over 24 h,
// synced progress). An account that earned at least `coinAlert24h` coins in
// the last 24 hours is flagged "à vérifier": the daily caps make that rare
// for a real reader, and progress sync trusts what the browser reports.

import { useState } from "react";
import { CardHeader, ErrorLine, INPUT_CLASS, Muted, RefreshButton, fmtDate, fmtShort, type AdminCardProps } from "./shared";
import { URLS, useAdminResource } from "./store";
import { SortTable, type Column } from "./SortTable";

export interface Account {
  id: number;
  email: string;
  createdAt: number;
  lastSeen: number | null;
  coins: number;
  coins24h?: number;
  progressKeys: number;
}
export interface AccountsData {
  accounts: number;
  active7d: number;
  coinsInCirculation: number;
  /** Absent from servers older than the list. */
  list?: Account[];
  /** 0 = no alert. */
  coinAlert24h?: number;
}

const NUM = new Intl.NumberFormat("fr-FR");

/** Accounts over the 24 h coin threshold (the dashboard tile counts these). */
export function flaggedAccounts(d: AccountsData | null): Account[] {
  const limit = d?.coinAlert24h ?? 0;
  if (!d?.list || limit <= 0) return [];
  return d.list.filter((a) => (a.coins24h ?? 0) >= limit);
}

export const ACCOUNTS_FLAGGED_ID = "admin-accounts-flagged";

export function AccountsCard({ token, onUnauthorized }: AdminCardProps) {
  const res = useAdminResource<AccountsData>(URLS.accounts, token, onUnauthorized);
  const data = res.data;
  const [query, setQuery] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const limit = data?.coinAlert24h ?? 0;
  const isFlagged = (a: Account) => limit > 0 && (a.coins24h ?? 0) >= limit;
  const flagged = flaggedAccounts(data);
  const q = query.trim().toLowerCase();
  const list = data?.list ?? [];
  const rows = list.filter((a) => (!q || a.email.includes(q)) && (!onlyFlagged || isFlagged(a)));

  const columns: Column<Account>[] = [
    {
      id: "email",
      label: "Adresse",
      sortValue: (a) => a.email,
      cell: (a) => (
        <span className="admin-subject">
          {a.email}
          {isFlagged(a) && <span className="admin-pill is-warn">à vérifier</span>}
        </span>
      ),
    },
    { id: "created", label: "Inscrit", sortValue: (a) => a.createdAt, numeric: true, wideOnly: true, cell: (a) => <span title={fmtDate(a.createdAt)}>{fmtShort(a.createdAt)}</span> },
    { id: "seen", label: "Vu", sortValue: (a) => a.lastSeen, numeric: true, cell: (a) => <span title={fmtDate(a.lastSeen)}>{fmtShort(a.lastSeen)}</span> },
    { id: "coins", label: "Pièces", sortValue: (a) => a.coins, numeric: true, cell: (a) => NUM.format(a.coins) },
    {
      id: "coins24h",
      label: "24 h",
      sortValue: (a) => a.coins24h ?? 0,
      numeric: true,
      cell: (a) => (a.coins24h ? `+${NUM.format(a.coins24h)}` : "—"),
    },
    {
      id: "progress",
      label: "Progression",
      sortValue: (a) => a.progressKeys,
      numeric: true,
      wideOnly: true,
      cell: (a) => NUM.format(a.progressKeys),
    },
  ];

  return (
    <section id="admin-accounts" className="admin-card admin-card--wide">
      <CardHeader title="comptes lecteurs" count={data ? data.accounts : undefined}>
        <RefreshButton busy={res.busy} onClick={() => res.reload()} label="Actualiser les comptes" />
      </CardHeader>
      {res.failed && <ErrorLine>{res.error ?? "Impossible de charger les comptes."}</ErrorLine>}
      {!data && !res.failed && <Muted>Chargement…</Muted>}
      {data && (
        <>
          <dl className="admin-stats">
            <div>
              <dt>comptes</dt>
              <dd>{NUM.format(data.accounts)}</dd>
            </div>
            <div>
              <dt>actifs sur 7 jours</dt>
              <dd>{NUM.format(data.active7d)}</dd>
            </div>
            <div>
              <dt>pièces en circulation</dt>
              <dd>{NUM.format(data.coinsInCirculation)}</dd>
            </div>
            <div>
              <dt>à vérifier</dt>
              <dd className={flagged.length ? "admin-warn-text" : undefined}>{NUM.format(flagged.length)}</dd>
            </div>
          </dl>
          {list.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrer par adresse…"
                aria-label="Filtrer les comptes par adresse"
                className={`grow basis-56 ${INPUT_CLASS}`}
              />
              {limit > 0 && (
                <label id={ACCOUNTS_FLAGGED_ID} className="admin-check text-small text-muted-warm">
                  <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
                  seulement à vérifier ({flagged.length})
                </label>
              )}
            </div>
          )}
          {limit > 0 && (
            <p className="m-0 mb-2 text-micro text-muted-warm">
              « À vérifier » : au moins {NUM.format(limit)} pièces gagnées en 24 h (réglable avec{" "}
              <code>COIN_ALERT_24H</code>).
            </p>
          )}
          {data.accounts === 0 && <Muted>Aucun compte pour l&apos;instant.</Muted>}
          {list.length > 0 && rows.length === 0 && <Muted>Aucun compte ne correspond.</Muted>}
          {rows.length > 0 && (
            <SortTable
              caption="Comptes lecteurs"
              rows={rows}
              columns={columns}
              rowKey={(a) => a.id}
              initialSort={{ id: "seen", dir: "desc" }}
              rowClass={(a) => (isFlagged(a) ? "is-warn" : "")}
            />
          )}
        </>
      )}
    </section>
  );
}
