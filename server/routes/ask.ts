// RAG assistant — the /api/ask Pages Function, self-hosted. Same NDJSON wire
// format ({sources}, then {chunk} deltas, then optional {error}) and the same
// system prompt / thresholds; retrieval goes through the local index (rag.ts)
// and generation through Anthropic or an OpenAI-compatible endpoint.

import { Hono } from "hono";
import { stream } from "hono/streaming";
import { env, canGenerate } from "../env.ts";
import { Cooldown, InFlight, Quota } from "../ratelimit.ts";
import { getIp, ndLine } from "../http.ts";
import { search } from "../rag.ts";
import { anthropicDeltas, chatConfig, openaiChatDeltas } from "../llm.ts";

const TOP_K = 5;
const MIN_SCORE = 0.4;
const MAX_QUESTION = 1000;
const MAX_SELECTION = 4000;
const MAX_TOKENS = 1024;

const REPLY_LANGS = new Set(["fr", "en", "es", "zh"]);
const DEFAULT_Q: Record<string, string> = {
  fr: "Explique ce passage.",
  en: "Explain this passage.",
  es: "Explica este pasaje.",
  zh: "解释这段内容。",
};

function buildSystem(): string {
  return [
    "Tu es l'assistant de « The Gardener », un jardin de notes personnel.",
    "Règles :",
    "- Réponds UNIQUEMENT à partir des extraits de notes fournis dans le message de l'utilisateur.",
    "- Si un « passage sélectionné » est fourni, c'est l'extrait que l'utilisateur veut comprendre : appuie-toi dessus en priorité.",
    "- Si la réponse n'y figure pas, dis-le clairement (« Je ne trouve pas cela dans les notes ») — n'invente rien et n'utilise pas de connaissances générales extérieures aux notes.",
    "- Quand c'est utile, cite le titre des notes que tu utilises.",
    "- Le texte peut utiliser du Markdown léger (**gras**, *italique*, `code`, listes `- `).",
    "- Réponds TOUJOURS dans la même langue que la question de l'utilisateur (celle qui suit « Question : » ci-dessous), de façon concise et claire — quelle que soit la langue des notes.",
  ].join("\n");
}

const cooldown = new Cooldown(3);
const quota = new Quota(env.askHourly, 3_600_000);
const inflight = new InFlight();

export const askRoute = new Hono();

askRoute.post("/", async (c) => {
  if (!canGenerate()) {
    return c.json({ error: "Assistant non configuré (aucun backend LLM)." }, 503);
  }

  let payload: { question?: string; selection?: string; locale?: string };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Requête invalide." }, 400);
  }

  const replyLang = REPLY_LANGS.has(payload.locale ?? "") ? payload.locale! : "fr";
  const selection = (payload.selection ?? "").trim().slice(0, MAX_SELECTION);
  const question = (
    (payload.question ?? "").trim() || (selection ? DEFAULT_Q[replyLang] : "")
  ).slice(0, MAX_QUESTION);
  if (!question) return c.json({ error: "Question manquante." }, 400);

  const ip = getIp(c);
  if (ip !== "anon" && cooldown.limited(`ask:${ip}`)) {
    return c.json({ error: "Trop de requêtes — réessaie dans un instant." }, 429);
  }
  if (env.askHourly > 0 && ip !== "anon" && quota.exceeded(`ask:${ip}`)) {
    return c.json({ error: "Limite horaire atteinte — réessaie plus tard." }, 429);
  }
  if (inflight.has(ip)) {
    return c.json({ error: "Une requête est déjà en cours." }, 429);
  }
  inflight.add(ip);

  // Retrieval (skipped/empty when EMBED_BASE_URL is unset or not ready yet).
  const sources: { title: string; url: string }[] = [];
  let context = "";
  try {
    const queryText = selection ? `${question}\n${selection}` : question;
    const hits = await search(queryText, TOP_K, MIN_SCORE);
    const seen = new Set<string>();
    const blocks: string[] = [];
    for (const h of hits) {
      blocks.push(`## ${h.title}\n${h.text}`);
      if (h.url && h.title && !seen.has(h.url)) {
        seen.add(h.url);
        sources.push({ title: h.title, url: h.url });
      }
    }
    context = blocks.join("\n\n");
  } catch (e) {
    console.warn("ask: retrieval failed", e);
  }

  const noteContext = [
    selection
      ? `Passage sélectionné par l'utilisateur dans une note :\n« ${selection} »`
      : "",
    context ? `Extraits de notes pertinents :\n\n${context}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const system = buildSystem();
  const userContent = noteContext
    ? `${noteContext}\n\n---\nQuestion : ${question}`
    : `(Aucune note pertinente n'a été trouvée pour cette question.)\n\nQuestion : ${question}`;

  const ac = new AbortController();
  const llm = chatConfig(env.llmBaseUrl, env.llmModel);

  async function* deltas(): AsyncGenerator<string> {
    if (env.anthropicKey) {
      yield* anthropicDeltas(env.anthropicKey, env.genModel, system, userContent, MAX_TOKENS, ac.signal);
      return;
    }
    yield* openaiChatDeltas(
      llm!,
      [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      { maxTokens: MAX_TOKENS, signal: ac.signal },
    );
  }

  c.header("content-type", "application/x-ndjson; charset=utf-8");
  c.header("cache-control", "no-store");
  return stream(c, async (s) => {
    s.onAbort(() => {
      ac.abort();
      inflight.delete(ip);
    });
    await s.write(ndLine({ sources }));
    try {
      for await (const d of deltas()) await s.write(ndLine({ chunk: d }));
    } catch (e) {
      console.error("ask: stream failed", e);
      await s.write(ndLine({ error: "stream_failed" }));
    } finally {
      inflight.delete(ip);
    }
  });
});
