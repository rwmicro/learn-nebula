"use client";

// État de l'assistant — GET /healthz with the admin token: whether generation
// is configured and the RAG index's state. Without the token the server only
// answers { ok: true }, so this card lives behind the login (Site tab) and
// treats a reply without `rag` as "no detail" rather than crashing on it.

import { CardHeader, Dot, Muted, RefreshButton } from "./shared";
import { URLS, useAdminResource } from "./store";

export interface Health {
  ok: boolean;
  /** Both absent from the public (tokenless) reply. */
  generate?: boolean;
  rag?: { state: string; chunks: number; dim: number };
}

/** Colour encodes real state, at a glance — not decoration. */
const RAG_STATE: Record<string, { label: string; color: string }> = {
  ready: { label: "prêt", color: "var(--garden)" },
  loading: { label: "en cours de chargement", color: "var(--warn)" },
  error: { label: "en erreur", color: "var(--danger)" },
  disabled: { label: "désactivé (pas de point d'accès d'embeddings)", color: "var(--faint)" },
};

const noop = () => {};

export function AssistantCard({ token }: { token: string }) {
  const res = useAdminResource<Health>(URLS.health, token, noop);
  const health = res.data?.rag ? res.data : null;
  const rag = health?.rag ? (RAG_STATE[health.rag.state] ?? { label: health.rag.state, color: "var(--faint)" }) : null;

  return (
    <section id="admin-assistant" className="admin-card">
      <CardHeader title="état de l'assistant">
        <RefreshButton busy={res.busy} onClick={() => res.reload()} label="Rafraîchir l'état de l'assistant" />
      </CardHeader>
      {(res.failed || res.missing) && <Muted>Serveur non joignable — normal en aperçu statique.</Muted>}
      {!res.settled && !health && <Muted>Chargement…</Muted>}
      {res.settled && res.data && !health && <Muted>Le serveur n&apos;a pas donné le détail (jeton refusé ?).</Muted>}
      {health?.rag && rag && (
        <dl className="admin-dl m-0">
          <dt>Génération</dt>
          <dd className="flex items-center gap-2">
            <Dot color={health.generate ? "var(--garden)" : "var(--faint)"} />
            {health.generate ? "configurée" : "désactivée (pas de clé LLM)"}
          </dd>
          <dt>Index RAG</dt>
          <dd className="flex items-center gap-2">
            <Dot color={rag.color} />
            {rag.label}
          </dd>
          <dt>Extraits indexés</dt>
          <dd>
            <strong className="tabular-nums">{health.rag.chunks.toLocaleString("fr-FR")}</strong>
            {health.rag.dim ? <span className="text-muted-warm"> · dimension {health.rag.dim}</span> : null}
          </dd>
        </dl>
      )}
    </section>
  );
}
