"use client";

// What visitors ask the assistant — GET /api/questions. Three views of the
// same capped log: the raw ledger ("récentes"), questions grouped after
// normalisation ("fréquentes"), and the ones retrieval barely covered ("mal
// couvertes" — the vault's gaps, i.e. what to write next). Grouping and the
// weak threshold live server-side (server/questions-agg.ts).

import { useState } from "react";
import {
  CardHeader,
  ErrorLine,
  FOCUS_RING,
  INPUT_CLASS,
  Muted,
  RefreshButton,
  fmtDateTime,
  plural,
  type AdminCardProps,
} from "./shared";
import { URLS, useAdminResource } from "./store";

interface LogEntry {
  id: number;
  question: string;
  scope: string | null;
  locale: string | null;
  created_at: number;
  top_score: number | null;
  hits: number | null;
}
interface Group {
  key: string;
  question: string;
  count: number;
  last_at: number;
  scopes: string[];
  top_score: number | null;
  measured: number;
  weak: number;
}
export interface QuestionsData {
  questions: LogEntry[];
  frequent: Group[];
  weak: Group[];
  weakScore: number;
  window: number;
}

type View = "recent" | "frequent" | "weak";
const VIEWS: { id: View; label: string }[] = [
  { id: "recent", label: "récentes" },
  { id: "frequent", label: "fréquentes" },
  { id: "weak", label: "mal couvertes" },
];
const POLL_MS = 30_000;

function isWeakEntry(r: LogEntry, threshold: number): boolean {
  if (r.hits === null) return false;
  return r.hits === 0 || (r.top_score !== null && r.top_score < threshold);
}

/** Scores in French notation (0,44), like every other number on the page. */
function fr2(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

function scoreLabel(score: number | null, hits: number | null): string {
  if (hits === 0) return "aucun extrait";
  if (score === null) return "";
  return `score ${fr2(score)}`;
}

/** Id of the "mal couvertes" view button — the dashboard tile clicks it. */
export const QUESTIONS_WEAK_ID = "admin-questions-weak";

export function QuestionsCard({ token, onUnauthorized }: AdminCardProps) {
  const res = useAdminResource<QuestionsData>(URLS.questions, token, onUnauthorized, { pollMs: POLL_MS });
  const data = res.data;
  const error = res.failed ? "Impossible de charger le journal des questions." : null;
  const [view, setView] = useState<View>("recent");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const matches = (text: string, scopes: (string | null)[]) =>
    !q || text.toLowerCase().includes(q) || scopes.some((s) => (s ?? "").toLowerCase().includes(q));

  const recent = data?.questions.filter((r) => matches(r.question, [r.scope]));
  const frequent = data?.frequent.filter((g) => matches(g.question, g.scopes));
  const weak = data?.weak.filter((g) => matches(g.question, g.scopes));
  const counts: Record<View, number | undefined> = {
    recent: data?.questions.length,
    frequent: data?.frequent.length,
    weak: data?.weak.length,
  };

  return (
    <section id="admin-questions" className="admin-card">
      <CardHeader title="questions posées">
        <RefreshButton busy={res.busy} onClick={() => res.reload()} label="Actualiser le journal des questions" />
      </CardHeader>
      <p className="m-0 mb-3 text-small text-muted-warm">
        Ce que les visiteurs demandent à l&apos;assistant — utile pour repérer les sujets mal couverts
        par le jardin.
      </p>

      <div role="group" aria-label="Vue du journal" className="admin-tabs mb-3">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            id={v.id === "weak" ? QUESTIONS_WEAK_ID : undefined}
            type="button"
            aria-pressed={view === v.id}
            onClick={() => setView(v.id)}
            className={`admin-tab ${FOCUS_RING}`}
          >
            {v.label}
            {counts[v.id] !== undefined && <span className="admin-tab-count">{counts[v.id]}</span>}
          </button>
        ))}
      </div>

      {data && data.questions.length > 3 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer par texte ou dossier…"
          aria-label="Filtrer les questions"
          className={`mb-3 w-full ${INPUT_CLASS}`}
        />
      )}

      {error && <ErrorLine>{error}</ErrorLine>}
      {!data && !error && <Muted>Chargement…</Muted>}
      {data?.questions.length === 0 && <Muted>Aucune question pour l&apos;instant.</Muted>}

      {data && data.questions.length > 0 && view === "recent" && (
        <>
          {recent?.length === 0 && <Muted>Aucune question ne correspond à « {query} ».</Muted>}
          <ul className="admin-log text-small">
            {recent?.map((r) => {
              const weakRow = isWeakEntry(r, data.weakScore);
              return (
                <li key={r.id}>
                  <time>{fmtDateTime(r.created_at)}</time>
                  {r.scope && (
                    <span className="admin-log-scope rounded-full bg-wash-2 px-2 py-px text-micro text-ink-2">
                      {r.scope}
                    </span>
                  )}
                  {weakRow && (
                    <span className="admin-weak admin-log-flag" title={scoreLabel(r.top_score, r.hits)}>
                      mal couverte
                    </span>
                  )}
                  <span className="admin-log-question text-ink">{r.question}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {data && data.questions.length > 0 && view === "frequent" && (
        <GroupList
          groups={frequent ?? []}
          empty={
            q
              ? `Aucune question fréquente ne correspond à « ${query} ».`
              : "Aucune question posée plus d'une fois pour l'instant."
          }
          weakScore={data.weakScore}
        />
      )}

      {data && data.questions.length > 0 && view === "weak" && (
        <>
          <p className="m-0 mb-2 text-small text-muted-warm">
            Aucun extrait retrouvé, ou meilleur score sous {fr2(data.weakScore)} — les sujets à
            écrire en priorité.
          </p>
          <GroupList
            groups={weak ?? []}
            empty={
              q
                ? `Aucune question mal couverte ne correspond à « ${query} ».`
                : "Rien de mal couvert parmi les questions mesurées."
            }
            weakScore={data.weakScore}
            showScore
          />
        </>
      )}

      {data && data.questions.length > 0 && view !== "recent" && (
        <p className="m-0 mt-3 text-micro text-muted-warm">
          Sur les {plural(data.window, "dernière question", "dernières questions")} du journal.
        </p>
      )}
    </section>
  );
}

function GroupList({
  groups,
  empty,
  weakScore,
  showScore = false,
}: {
  groups: Group[];
  empty: string;
  weakScore: number;
  showScore?: boolean;
}) {
  if (!groups.length) return <Muted>{empty}</Muted>;
  return (
    <ol className="admin-groups m-0 list-none p-0 text-small">
      {groups.map((g) => (
        <li key={g.key}>
          <span className="admin-group-count tabular-nums">
            {g.count}×
          </span>
          <span className="min-w-0">
            <span className="block break-words text-ink">{g.question}</span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-muted-warm">
              <span>dernière : {fmtDateTime(g.last_at)}</span>
              {g.scopes.map((s) => (
                <span key={s} className="rounded-full bg-wash-2 px-2 py-px text-ink-2">
                  {s}
                </span>
              ))}
              {showScore && (
                <span className="admin-weak">
                  {g.top_score === null ? "aucun extrait" : `meilleur score ${fr2(g.top_score)}`}
                </span>
              )}
              {!showScore && g.measured > 0 && g.weak * 2 >= g.measured && (
                <span className="admin-weak" title={`seuil ${fr2(weakScore)}`}>
                  mal couverte
                </span>
              )}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
