"use client";

// LLM spend at a glance — GET /api/admin/usage: assistant questions and
// translations over the last 24 h against ASK_DAILY_LIMIT /
// TRANSLATE_DAILY_LIMIT (the server-wide caps in server/routes/ask.ts and
// translate.ts). Counted in memory, so a restart starts from zero.

import { CardHeader, ErrorLine, Muted, RefreshButton, type AdminCardProps } from "./shared";
import { URLS, useAdminResource } from "./store";

export interface Meter {
  used: number | null;
  limit: number | null;
}

export interface UsageData {
  ask: Meter;
  translate: Meter;
}

/** From this share of the cap on, the meter (and its dashboard tile) warns. */
export const USAGE_WARN = 0.8;

export function nearCap(m: Meter | undefined): boolean {
  return !!m && m.used !== null && !!m.limit && m.used / m.limit >= USAGE_WARN;
}

const POLL_MS = 60_000;

export function UsageCard({ token, onUnauthorized }: AdminCardProps) {
  const res = useAdminResource<UsageData>(URLS.usage, token, onUnauthorized, { pollMs: POLL_MS });
  const d = res.data;
  return (
    <section id="admin-usage" className="admin-card">
      <CardHeader title="assistant · coût">
        <RefreshButton busy={res.busy} onClick={() => res.reload()} label="Actualiser la consommation" />
      </CardHeader>
      {res.failed && <ErrorLine>Impossible de lire la consommation.</ErrorLine>}
      {!d && !res.failed && <Muted>Chargement…</Muted>}
      {d && (
        <>
          <MeterRow label="Questions à l'assistant" env="ASK_DAILY_LIMIT" m={d.ask} />
          <MeterRow label="Traductions" env="TRANSLATE_DAILY_LIMIT" m={d.translate} />
          <p className="m-0 mt-2 text-micro text-muted-warm">
            Appels des dernières 24 h, comptés en mémoire depuis le dernier démarrage du serveur.
          </p>
        </>
      )}
    </section>
  );
}

function MeterRow({ label, env, m }: { label: string; env: string; m: Meter }) {
  if (m.limit === null || m.used === null) {
    return (
      <div className="admin-meter">
        <div className="admin-meter-head">
          <span>{label}</span>
          <span className="text-muted-warm">
            pas de plafond (<code>{env}</code>)
          </span>
        </div>
      </div>
    );
  }
  const share = m.limit ? Math.min(1, m.used / m.limit) : 0;
  const warn = nearCap(m);
  return (
    <div className={`admin-meter ${warn ? "is-warn" : ""}`}>
      <div className="admin-meter-head">
        <span>{label}</span>
        <span className="tabular-nums">
          <strong>{m.used.toLocaleString("fr-FR")}</strong> / {m.limit.toLocaleString("fr-FR")}
          {warn && <span className="admin-pill is-warn ml-2">{share >= 1 ? "plafond atteint" : "proche du plafond"}</span>}
        </span>
      </div>
      <div
        className="admin-meter-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={m.limit}
        aria-valuenow={m.used}
      >
        <span style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}
