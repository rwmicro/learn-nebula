// Owner-only /admin tools, mounted under /api/admin by admin.ts (so behind its
// bearer-token gate and no-store header):
//
//   GET    /search-misses           → zero-result searches { top, recent, total }
//   DELETE /search-misses?q=&where= → dismiss one (every place when `where` is omitted)
//   GET    /builds                  → last runs of docker.yml { enabled, runs, … }
//   POST   /rebuild                 → workflow_dispatch docker.yml on main
//   GET    /prereq-accept           → { enabled, repo } for the "Accepter" buttons
//   POST   /prereq-accept           → { items:[{notePath, link}] } → one PR on the vault
//   GET    /rag-debug               → { enabled, state, rerank, topK, minScore }
//   POST   /rag-debug               → { q, scope? } → /api/ask's retrieval, scored, no generation
//   GET    /facts                   → data/facts-to-check.json (scripts/facts-to-check.ts)
//
// Every feature reports itself disabled (rather than failing) when its env
// var is unset; see .env.example.

import fs from "node:fs";
import { Hono } from "hono";
import { env } from "../env.ts";
import { audit } from "../auth.ts";
import { deleteSearchMiss, searchMisses } from "../db.ts";
import { ASK_MIN_SCORE, ASK_TOP_K, ragState, retrieve, scopePrefix } from "../rag.ts";
import {
  GitHubError,
  REBUILD_WORKFLOW,
  dispatchRebuild,
  latestBuilds,
  openPrereqPr,
  validatePrereqItems,
} from "../github.ts";
import { isSearchMissWhere, normaliseSearchMiss } from "../../lib/search-miss.ts";

export const adminToolsRoute = new Hono();

const ghError = (e: unknown) =>
  e instanceof GitHubError
    ? e.status === 401 || e.status === 403
      ? `GitHub refuse le jeton (HTTP ${e.status}) — vérifier ses permissions.`
      : e.message
    : `GitHub injoignable — ${e instanceof Error ? e.message : String(e)}`;

// --- recherches sans résultat ---------------------------------------------------

adminToolsRoute.get("/search-misses", (c) => {
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit")) || 50));
  try {
    return c.json(searchMisses(limit));
  } catch (e) {
    console.error("admin: search-misses read failed", e);
    return c.json({ error: "Journal indisponible." }, 503);
  }
});

adminToolsRoute.delete("/search-misses", (c) => {
  const q = normaliseSearchMiss(c.req.query("q"));
  const where = c.req.query("where");
  if (!q || (where !== undefined && where !== "" && !isSearchMissWhere(where))) {
    return c.json({ error: "Requête invalide." }, 400);
  }
  const removed = deleteSearchMiss(q, where || undefined);
  if (removed) audit(c, "search-miss.dismiss", `« ${q} »${where ? ` (${where})` : ""}`);
  return c.json({ removed });
});

// --- reconstruire le site ---------------------------------------------------------

let lastDispatch = 0;
const DISPATCH_COOLDOWN_MS = 30_000;

adminToolsRoute.get("/builds", async (c) => {
  const base = { enabled: Boolean(env.githubToken), repo: env.githubRepo, workflow: REBUILD_WORKFLOW, envVar: "GITHUB_TOKEN" };
  if (!base.enabled) return c.json({ ...base, runs: [] });
  try {
    return c.json({ ...base, runs: await latestBuilds(5) });
  } catch (e) {
    return c.json({ ...base, runs: [], error: ghError(e) }, 502);
  }
});

adminToolsRoute.post("/rebuild", async (c) => {
  if (!env.githubToken) {
    return c.json({ error: "Reconstruction désactivée — GITHUB_TOKEN n'est pas défini." }, 503);
  }
  const now = Date.now();
  if (now - lastDispatch < DISPATCH_COOLDOWN_MS) {
    return c.json({ error: "Une reconstruction vient d'être lancée — patienter un instant." }, 429);
  }
  try {
    await dispatchRebuild();
    lastDispatch = now;
    audit(c, "site.rebuild", REBUILD_WORKFLOW);
    return c.json({ ok: true }, 202);
  } catch (e) {
    return c.json({ error: ghError(e) }, 502);
  }
});

// --- prérequis → PR ---------------------------------------------------------------

adminToolsRoute.get("/prereq-accept", (c) =>
  c.json({ enabled: Boolean(env.pensineToken), repo: env.pensineRepo, envVar: "PENSINE_TOKEN" }),
);

adminToolsRoute.post("/prereq-accept", async (c) => {
  if (!env.pensineToken) {
    return c.json({ error: "Désactivé — ni PENSINE_TOKEN ni GITHUB_TOKEN ne sont définis." }, 503);
  }
  let payload: { items?: unknown };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Requête invalide." }, 400);
  }
  const items = validatePrereqItems(payload?.items);
  if (typeof items === "string") return c.json({ error: items }, 400);
  try {
    const pr = await openPrereqPr(items);
    audit(c, "prereq.pr", `${items.length} prérequis`);
    return c.json(pr);
  } catch (e) {
    console.warn("admin: prereq PR failed", e instanceof Error ? e.message : e);
    return c.json({ error: ghError(e) }, 502);
  }
});

// --- banc d'essai de l'assistant ------------------------------------------------------

const ragInfo = () => ({
  enabled: Boolean(env.embedBaseUrl),
  state: ragState(),
  rerank: Boolean(env.rerankUrl),
  topK: ASK_TOP_K,
  minScore: ASK_MIN_SCORE,
});

adminToolsRoute.get("/rag-debug", (c) => c.json(ragInfo()));

const MAX_DEBUG_RESULTS = 20;
const EXCERPT = 320;

adminToolsRoute.post("/rag-debug", async (c) => {
  const info = ragInfo();
  if (!info.enabled) return c.json({ ...info, error: "Recherche désactivée — EMBED_BASE_URL n'est pas défini." }, 503);
  if (info.state.state !== "ready") {
    return c.json({ ...info, error: `Index pas prêt (${info.state.state}).` }, 503);
  }
  let payload: { q?: unknown; scope?: unknown };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Requête invalide." }, 400);
  }
  const q = typeof payload?.q === "string" ? payload.q.trim().slice(0, 1000) : "";
  if (!q) return c.json({ error: "Question manquante." }, 400);
  const prefix = scopePrefix(payload?.scope);
  try {
    const trace = await retrieve(q, ASK_TOP_K, ASK_MIN_SCORE, prefix);
    if (!trace) return c.json({ ...info, error: "Index indisponible (dimension du vecteur incohérente ?)." }, 503);
    return c.json({
      ...info,
      q,
      scope: prefix,
      reranked: trace.reranked,
      rerankError: trace.rerankError,
      candidates: trace.candidates.length,
      kept: trace.hits.length,
      results: trace.candidates.slice(0, MAX_DEBUG_RESULTS).map((r) => {
        const nl = r.text.indexOf("\n");
        const breadcrumb = nl === -1 ? r.text : r.text.slice(0, nl);
        const rest = (nl === -1 ? "" : r.text.slice(nl + 1)).trim().replace(/\s+/g, " ");
        return {
          title: r.title,
          url: r.url,
          breadcrumb,
          excerpt: rest.length > EXCERPT ? `${rest.slice(0, EXCERPT)}…` : rest,
          cosine: r.cosine,
          bm25: r.bm25,
          rare: r.rare,
          rrf: r.rrf,
          rerank: r.rerank,
          kept: r.kept,
        };
      }),
    });
  } catch (e) {
    return c.json({ ...info, error: `Échec de la recherche — ${e instanceof Error ? e.message : String(e)}` }, 502);
  }
});

// --- faits à vérifier -------------------------------------------------------------------

adminToolsRoute.get("/facts", (c) => {
  let raw: string;
  try {
    raw = fs.readFileSync(env.factsToCheck, "utf8");
  } catch {
    return c.json({ error: "Liste absente — elle est générée par le build (scripts/facts-to-check.ts)." }, 404);
  }
  return c.body(raw, 200, { "content-type": "application/json; charset=utf-8" });
});
