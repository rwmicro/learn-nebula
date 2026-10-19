// RAG assistant — the /api/ask Pages Function, self-hosted. Same NDJSON wire
// format ({sources}, then {chunk} deltas, then optional {error}) and the same
// system prompt / thresholds; retrieval goes through the local index (rag.ts)
// and generation through Anthropic or an OpenAI-compatible endpoint.

import { Hono, type Context } from "hono";
import { stream } from "hono/streaming";
import { env, canGenerate } from "../env.ts";
import { Cooldown, InFlight, Quota } from "../ratelimit.ts";
import { getIp, ndLine } from "../http.ts";
import { search, scopePrefix, ragState, ASK_TOP_K, ASK_MIN_SCORE } from "../rag.ts";
import { anthropicDeltas, chatConfig, openaiChatDeltas } from "../llm.ts";
import { logQuestion, type RetrievalStats } from "../db.ts";
import {
  SOCRATIC_RULES,
  MAX_EXPLAIN_PASSAGE,
  MAX_EXPLAIN_TEXT,
  MAX_EXPLAIN_TITLE,
  explainSystem,
  explainUser,
  langReminder,
  replyLangHint,
} from "../../lib/ask-prompts.ts";

const TOP_K = ASK_TOP_K;
const MIN_SCORE = ASK_MIN_SCORE;
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

/** Human label for a scope slug, for the prompt. The slug charset is validated
 *  by scopePrefix(), so this can't smuggle instructions into the system prompt. */
function scopeName(prefix: string): string {
  const seg = prefix.replace(/^\/posts\/|\/$/g, "").split("/").pop() ?? "";
  return seg.replace(/-/g, " ");
}

function buildSystem(scope: string, socratic = false): string {
  return [
    "Tu es l'assistant de « Garden of Knowledge », un jardin de notes personnel.",
    "Règles :",
    "- Réponds UNIQUEMENT à partir des extraits de notes fournis dans le message de l'utilisateur.",
    ...(scope
      ? [
          `- La recherche est restreinte aux notes du dossier « ${scopeName(scope)} » : n'utilise rien d'autre, et si ces notes ne contiennent pas la réponse, dis-le plutôt que de puiser dans tes connaissances générales (elles sont peu fiables sur les langues rares).`,
          "- Cite les formes de la langue étudiée telles qu'elles apparaissent dans les notes (graphie, translittération, exemples), sans les corriger ni les compléter de toi-même.",
        ]
      : []),
    "- Si un « passage sélectionné » est fourni, c'est l'extrait que l'utilisateur veut comprendre : appuie-toi dessus en priorité.",
    "- Si la réponse n'y figure pas, dis-le clairement (« Je ne trouve pas cela dans les notes ») — n'invente rien et n'utilise pas de connaissances générales extérieures aux notes.",
    "- Quand c'est utile, cite le titre des notes que tu utilises.",
    "- Le texte peut utiliser du Markdown léger (**gras**, *italique*, `code`, listes `- `).",
    "- Réponds TOUJOURS dans la même langue que la question de l'utilisateur (celle qui suit « Question : » ci-dessous), de façon concise et claire — quelle que soit la langue des notes.",
    ...(socratic ? [SOCRATIC_RULES] : []),
  ].join("\n");
}

const cooldown = new Cooldown(3);
const quota = new Quota(env.askHourly, 3_600_000);
// Instance-wide daily backstop (all IPs together), keyed on one constant.
const daily = env.askDaily > 0 ? new Quota(env.askDaily, 86_400_000) : null;
const DAILY_KEY = "ask:all";
const inflight = new InFlight();

/** Calls counted against the daily backstop over the last 24 h, for /admin
 *  (null limit = no cap configured, so nothing is counted). */
export function askUsage(): { used: number | null; limit: number | null } {
  return daily ? { used: daily.count(DAILY_KEY), limit: env.askDaily } : { used: null, limit: null };
}

export const askRoute = new Hono();

/** The cost guards every generating route here shares (cooldown, hourly and
 *  daily caps, one request in flight per IP). Returns the IP, now marked in
 *  flight, or the 429 to send. */
function admit(c: Context): { ip: string } | { res: Response } {
  const ip = getIp(c);
  if (ip !== "anon" && cooldown.limited(`ask:${ip}`)) {
    return { res: c.json({ error: "Trop de requêtes — réessaie dans un instant." }, 429) };
  }
  if (env.askHourly > 0 && ip !== "anon" && quota.exceeded(`ask:${ip}`)) {
    return { res: c.json({ error: "Limite horaire atteinte — réessaie plus tard." }, 429) };
  }
  if (daily && daily.exceeded(DAILY_KEY)) {
    return { res: c.json({ error: "Service momentanément indisponible — réessaie plus tard." }, 429) };
  }
  if (inflight.has(ip)) {
    return { res: c.json({ error: "Une requête est déjà en cours." }, 429) };
  }
  inflight.add(ip);
  return { ip };
}

/** Stream one generation as the assistant's NDJSON ({sources}, {chunk}…,
 *  optional {error}), through Anthropic or the OpenAI-compatible backend. */
function streamAnswer(
  c: Context,
  ip: string,
  system: string,
  userContent: string,
  sources: { title: string; url: string }[],
) {
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
}

askRoute.post("/", async (c) => {
  if (!canGenerate()) {
    return c.json({ error: "Assistant non configuré (aucun backend LLM)." }, 503);
  }

  let payload: {
    question?: string;
    selection?: string;
    locale?: string;
    scope?: string;
    lang?: string;
    socratic?: boolean;
  };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Requête invalide." }, 400);
  }

  const replyLang = REPLY_LANGS.has(payload.locale ?? "") ? payload.locale! : "fr";
  // The question's language as the browser detected it (LanguageDetector),
  // checked against an allow-list; "" = let the model follow the question.
  const lang = replyLangHint(payload.lang);
  const socratic = payload.socratic === true;
  const selection = (payload.selection ?? "").trim().slice(0, MAX_SELECTION);
  const question = (
    (payload.question ?? "").trim() || (selection ? DEFAULT_Q[replyLang] : "")
  ).slice(0, MAX_QUESTION);
  if (!question) return c.json({ error: "Question manquante." }, 400);

  const gate = admit(c);
  if ("res" in gate) return gate.res;
  const { ip } = gate;

  // Retrieval (skipped/empty when EMBED_BASE_URL is unset or not ready yet).
  // `scope` narrows it to one folder — the language picker in the assistant —
  // so a query doesn't pull chunks from 18 other languages at once.
  const prefix = scopePrefix(payload.scope);
  const sources: { title: string; url: string }[] = [];
  let context = "";
  // Coverage for the /admin questions log; stays null (unknown, not "weak")
  // when retrieval isn't running or fails.
  let retrieval: RetrievalStats | null = null;
  try {
    const queryText = selection ? `${question}\n${selection}` : question;
    const ready = ragState().state === "ready";
    const hits = await search(queryText, TOP_K, MIN_SCORE, prefix);
    if (ready) {
      retrieval = {
        hits: hits.length,
        topScore: hits.length ? Math.max(...hits.map((h) => h.cosine)) : null,
      };
    }
    const seen = new Set<string>();
    const blocks: string[] = [];
    for (const h of hits) {
      // A chunk's first line is its "Title › Section" breadcrumb.
      blocks.push(`## ${h.text}`);
      if (h.url && h.title && !seen.has(h.url)) {
        seen.add(h.url);
        sources.push({ title: h.title, url: h.url });
      }
    }
    context = blocks.join("\n\n");
  } catch (e) {
    console.warn("ask: retrieval failed", e);
  }
  // "What do people ask" log for /admin — no IP, keyed on nothing that
  // identifies who asked. Logged past the rate-limit gate above so a
  // rejected flood doesn't fill the log with duplicates, and after retrieval
  // so the entry records how well the vault covered the question.
  try {
    logQuestion(question, prefix ? scopeName(prefix) : null, replyLang, retrieval);
  } catch (e) {
    console.warn("ask: question log failed", e);
  }

  const noteContext = [
    selection
      ? `Passage sélectionné par l'utilisateur dans une note :\n« ${selection} »`
      : "",
    context ? `Extraits de notes pertinents :\n\n${context}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const system = buildSystem(prefix, socratic);
  const noHits = prefix
    ? `(Aucune note pertinente dans « ${scopeName(prefix)} » pour cette question.)`
    : "(Aucune note pertinente n'a été trouvée pour cette question.)";
  // Repeated right next to the question (not just once, earlier, in the system
  // prompt) since a model attends more reliably to instructions close to the
  // point of generation — cheaper/faster models like Haiku otherwise sometimes
  // drift toward French, the language every other rule here is written in and
  // that most of the vault's notes are in, despite an English question.
  const reminder = `\n\n${langReminder(lang)}`;
  const userContent = noteContext
    ? `${noteContext}\n\n---\nQuestion : ${question}${reminder}`
    : `${noHits}\n\nQuestion : ${question}${reminder}`;

  return streamAnswer(c, ip, system, userContent, sources);
});

// "Explique-le avec tes mots": the reader's own explanation of a passage,
// and feedback on it grounded on that passage alone (no retrieval: the
// passage IS the reference). Same wire format, caps and backends as above;
// the browser tries the on-device Prompt API first and only lands here when
// it is missing.
askRoute.post("/explain", async (c) => {
  if (!canGenerate()) {
    return c.json({ error: "Assistant non configuré (aucun backend LLM)." }, 503);
  }
  let payload: { passage?: string; explanation?: string; title?: string; lang?: string };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Requête invalide." }, 400);
  }
  const passage = String(payload.passage ?? "").trim().slice(0, MAX_EXPLAIN_PASSAGE);
  const explanation = String(payload.explanation ?? "").trim().slice(0, MAX_EXPLAIN_TEXT);
  const title = String(payload.title ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_EXPLAIN_TITLE);
  if (!passage || !explanation) return c.json({ error: "Passage ou explication manquant." }, 400);

  const gate = admit(c);
  if ("res" in gate) return gate.res;
  return streamAnswer(
    c,
    gate.ip,
    explainSystem(replyLangHint(payload.lang)),
    explainUser(passage, explanation, title),
    [],
  );
});
