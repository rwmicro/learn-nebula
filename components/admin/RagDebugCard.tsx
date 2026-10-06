"use client";

// Banc d'essai de l'assistant — POST /api/admin/rag-debug runs exactly the
// retrieval /api/ask does (server/rag.ts retrieve(): query embedding, cosine
// + BM25, RRF fusion, optional reranker, per-note cap) and returns every
// candidate with its scores, without generating an answer. For tuning why a
// question does or doesn't find a note. Disabled when EMBED_BASE_URL is unset.

import { useState, type FormEvent } from "react";
import {
  BUTTON_CLASS,
  CardHeader,
  Dot,
  ErrorLine,
  FOCUS_RING,
  INPUT_CLASS,
  Muted,
  RefreshButton,
  Unauthorized,
  type AdminCardProps,
} from "./shared";
import { adminJson, answerError } from "./admin-api";
import { URLS, setResource, useAdminResource } from "./store";

interface Info {
  enabled: boolean;
  state: { state: "disabled" | "loading" | "ready" | "error"; chunks: number; dim: number };
  rerank: boolean;
  topK: number;
  minScore: number;
}
interface Row {
  title: string;
  url: string;
  breadcrumb: string;
  excerpt: string;
  cosine: number;
  bm25: number | null;
  rare: boolean;
  rrf: number;
  rerank: number | null;
  kept: boolean;
}
interface Bench extends Info {
  q: string;
  scope: string;
  reranked: boolean;
  rerankError: string | null;
  candidates: number;
  kept: number;
  results: Row[];
}

/** French notation, like the rest of /admin. */
const num = (n: number | null, digits = 3) => (n === null ? "—" : n.toFixed(digits).replace(".", ","));

const STATE_LABEL: Record<string, string> = {
  disabled: "désactivé",
  loading: "en construction",
  ready: "prêt",
  error: "en erreur",
};

export function RagDebugCard({ token, onUnauthorized }: AdminCardProps) {
  const res = useAdminResource<Info>(URLS.ragDebug, token, onUnauthorized);
  const info = res.data;
  const setInfo = (i: Info) =>
    setResource<Info>(URLS.ragDebug, {
      enabled: i.enabled,
      state: i.state,
      rerank: i.rerank,
      topK: i.topK,
      minScore: i.minScore,
    });
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("");
  const [busy, setBusy] = useState(false);
  const [benchError, setError] = useState<string | null>(null);
  const [bench, setBench] = useState<Bench | null>(null);
  const error = benchError ?? (res.failed ? (res.error ?? "État de l'index indisponible.") : null);

  const run = async (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      const a = await adminJson<Bench>(URLS.ragDebug, token, {
        method: "POST",
        body: JSON.stringify({ q, scope: scope.trim() || undefined }),
      });
      if (a.ok && a.data) {
        setBench(a.data);
        setInfo(a.data);
        setError(null);
      } else {
        setError(answerError(a, "Recherche impossible"));
        if (a.data && "state" in a.data) setInfo(a.data as Info);
      }
    } catch (err) {
      if (err instanceof Unauthorized) onUnauthorized();
      else setError("Recherche impossible.");
    } finally {
      setBusy(false);
    }
  };

  const ready = info?.enabled && info.state.state === "ready";

  return (
    <section id="admin-rag-debug" className="admin-card">
      <CardHeader title="banc d'essai de l'assistant">
        <RefreshButton busy={res.busy} onClick={() => res.reload()} label="Revérifier l'état de l'index" />
      </CardHeader>
      <p className="m-0 mb-3 text-small text-muted-warm">
        La recherche de l&apos;assistant, sans génération : quels extraits une question ramène, et
        avec quels scores (cosinus, BM25, fusion RRF, reranker).
      </p>

      {info && !info.enabled && (
        <Muted>
          Désactivé — <code>EMBED_BASE_URL</code> n&apos;est pas défini, l&apos;assistant répond sans
          notes.
        </Muted>
      )}
      {info?.enabled && (
        <p className="m-0 mb-3 flex items-center gap-2 text-small text-muted-warm">
          <Dot color={ready ? "var(--garden)" : "var(--warn)"} />
          Index {STATE_LABEL[info.state.state] ?? info.state.state} — {info.state.chunks} extraits ·
          top {info.topK} · seuil cosinus {num(info.minScore, 2)} · reranker{" "}
          {info.rerank ? "actif" : "absent"}
        </p>
      )}

      {info?.enabled && (
        <form onSubmit={run} className="mb-3 flex flex-wrap gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Une question de lecteur…"
            aria-label="Question à tester"
            className={`min-w-[12rem] flex-[3] ${INPUT_CLASS}`}
            maxLength={1000}
          />
          <input
            type="text"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="dossier (facultatif)"
            aria-label="Restreindre à un dossier (chemin slugifié, ex. social-sciences/languages-dialects/kabyle)"
            title="Chemin slugifié, ex. social-sciences/languages-dialects/kabyle"
            className={`min-w-[8rem] flex-1 ${INPUT_CLASS}`}
          />
          <button type="submit" className={BUTTON_CLASS} disabled={busy || !ready || !q.trim()}>
            {busy ? "…" : "Chercher"}
          </button>
        </form>
      )}

      {error && <ErrorLine>{error}</ErrorLine>}
      {!info && !error && <Muted>Chargement…</Muted>}

      {bench && (
        <>
          <p className="m-0 mb-2 text-micro text-muted-warm">
            {bench.candidates} candidats, {bench.kept} retenus pour la réponse
            {bench.scope ? ` · dans ${bench.scope}` : ""}
            {bench.rerankError ? ` · reranker en échec (${bench.rerankError}), ordre de fusion conservé` : ""}
            {bench.reranked ? " · ordre du reranker" : ""}
          </p>
          {bench.results.length === 0 ? (
            <Muted>Aucun extrait — sous le seuil cosinus et sans mot rare en commun.</Muted>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-small">
                <thead>
                  <tr className="border-b border-rule text-left text-micro text-muted-warm">
                    <th className="py-1 pr-2 font-semibold">#</th>
                    <th className="py-1 pr-2 font-semibold">extrait</th>
                    <th className="py-1 pr-2 text-right font-semibold">cos.</th>
                    <th className="py-1 pr-2 text-right font-semibold">BM25</th>
                    <th className="py-1 pr-2 text-right font-semibold">RRF</th>
                    <th className="py-1 text-right font-semibold">rerank</th>
                  </tr>
                </thead>
                <tbody>
                  {bench.results.map((r, i) => (
                    <tr
                      key={`${r.url}#${i}`}
                      className={`border-b border-rule-soft align-top ${r.kept ? "" : "text-muted-warm"}`}
                    >
                      <td className="py-2 pr-2 tabular-nums">
                        <span className="flex items-center gap-1">
                          <Dot color={r.kept ? "var(--garden)" : "var(--faint)"} />
                          {i + 1}
                        </span>
                      </td>
                      <td className="min-w-[14rem] py-2 pr-2">
                        <a
                          href={r.url}
                          className={`rounded font-semibold text-garden underline-offset-2 hover:underline ${FOCUS_RING}`}
                        >
                          {r.title}
                        </a>
                        <span className="block text-micro text-ink-2">{r.breadcrumb}</span>
                        {r.excerpt && <span className="block text-micro text-muted-warm">{r.excerpt}</span>}
                        {!r.kept && <span className="block text-micro italic">écarté</span>}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{num(r.cosine)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums" title={r.rare ? "mot rare en commun" : undefined}>
                        {num(r.bm25, 2)}
                        {r.rare ? "*" : ""}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{num(r.rrf, 4)}</td>
                      <td className="py-2 text-right tabular-nums">{num(r.rerank)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="m-0 mt-2 text-micro text-muted-warm">
                * mot rare partagé avec la question (dans ≤ 1 % des extraits). Écarté : sous le
                plancher du reranker, au-delà du top {bench.topK}, ou plus de deux extraits de la même
                note.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default RagDebugCard;
