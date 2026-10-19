"use client";

// The admin journal — GET /api/admin/events: every moderation, rebuild,
// prerequisite PR, word-list save, owner reply and webhook test, newest first,
// with how the owner was signed in (account session or token).

import { useEffect } from "react";
import { CardHeader, ErrorLine, Muted, RefreshButton, fmtDateTime, type AdminCardProps } from "./shared";
import { URLS, useAdminResource, useTick } from "./store";

/** Bump (store.bump) after an action the journal records, to re-read it. */
export const EVENTS_TICK = "events";
const POLL_MS = 60_000;

interface AdminEvent {
  id: number;
  at: number;
  action: string;
  detail: string;
  via: string;
}

const ACTIONS: Record<string, string> = {
  "comment.approve": "commentaire approuvé",
  "comment.delete": "commentaire supprimé",
  "comment.reply": "réponse publiée",
  "blocked-words.save": "mots bloqués enregistrés",
  "search-miss.dismiss": "recherche ignorée",
  "client-error.dismiss": "erreur lecteur ignorée",
  "report.done": "signalement traité",
  "report.reopen": "signalement rouvert",
  "site.rebuild": "rebuild lancé",
  "prereq.pr": "PR de prérequis ouverte",
  "webhook.test": "notification de test",
};

const VIA: Record<string, string> = { session: "compte", token: "jeton" };

const SHOWN = 30;

export function EventsCard({ token, onUnauthorized }: AdminCardProps) {
  const res = useAdminResource<{ events: AdminEvent[] }>(URLS.events, token, onUnauthorized, { pollMs: POLL_MS });
  const tick = useTick(EVENTS_TICK);
  const { reload } = res;
  useEffect(() => {
    if (tick) reload({ silent: true });
  }, [tick, reload]);
  const events = res.data?.events;
  return (
    <section id="admin-events" className="admin-card">
      <CardHeader title="journal" count={events?.length}>
        <RefreshButton busy={res.busy} onClick={() => res.reload()} label="Actualiser le journal" />
      </CardHeader>
      {res.failed && <ErrorLine>{res.error ?? "Impossible de lire le journal."}</ErrorLine>}
      {!events && !res.failed && <Muted>Chargement…</Muted>}
      {events?.length === 0 && <Muted>Aucune action enregistrée pour l&apos;instant.</Muted>}
      {events && events.length > 0 && (
        <ol className="admin-log admin-journal">
          {events.slice(0, SHOWN).map((e) => (
            <li key={e.id}>
              <time className="tabular-nums text-muted-warm">{fmtDateTime(e.at)}</time>
              <span>
                {ACTIONS[e.action] ?? e.action}
                {e.detail && <span className="text-muted-warm"> · {e.detail}</span>}
              </span>
              <span className="text-muted-warm">{VIA[e.via] ?? e.via}</span>
            </li>
          ))}
        </ol>
      )}
      {events && events.length > SHOWN && (
        <p className="m-0 mt-2 text-micro text-muted-warm">
          {SHOWN} dernières actions sur {events.length}.
        </p>
      )}
    </section>
  );
}
