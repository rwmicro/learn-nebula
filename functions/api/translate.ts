/// <reference types="@cloudflare/workers-types" />

// On-demand article translation.
//
// Flow:
//   1. accept { markdown, dir, sourceLang, targetLang } from the client
//   2. call Claude Sonnet 4.6 to translate the *raw Markdown* (so wikilinks,
//      callouts, KaTeX and code blocks survive untouched)
//   3. re-run the same renderMarkdown pipeline used at build, so the rendered
//      HTML matches the site's typography exactly
//   4. return the rendered HTML
//
// Notes:
//   - `ANTHROPIC_API_KEY` is the same secret used by /api/ask.
//   - A single in-flight slot per IP guards against parallel duplicates from
//     a misclick — full rate limiting would need KV; this is the lightweight
//     dedupe the user asked for.

import Anthropic from "@anthropic-ai/sdk";
import { renderMarkdown } from "../../lib/markdown";
import { llmConfig, openaiChatText } from "./_llm";

interface Env {
  ANTHROPIC_API_KEY?: string;
  // Dev-only (see .dev.vars): route generation to an OpenAI-compatible endpoint
  // (e.g. LM Studio) instead of Anthropic. Unset in production.
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
}

const MODEL = "claude-sonnet-4-6";
const MAX_MD = 50_000; // chars — guards against runaway prompts
// Sonnet 4.6 supports a much larger output budget; 32k tokens covers ~120 KB
// of translated Markdown which comfortably exceeds MAX_MD. We still treat
// stop_reason === "max_tokens" as an error so a half-translated note never
// gets cached as if it were complete.
const MAX_OUTPUT_TOKENS = 32_000;

// English display name for each supported code. Claude follows instructions
// more reliably in English even when translating into another language, so
// the system prompt is built around these names. SUPPORTED_LANGS is just the
// key set — kept in sync with TRANSLATE_LANGS in lib/html.ts.
const LANG_NAME_EN: Record<string, string> = {
  // Western Europe
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ca: "Catalan",
  ga: "Irish",
  cy: "Welsh",
  eu: "Basque",
  // Nordic
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  fi: "Finnish",
  is: "Icelandic",
  // Central / Eastern Europe
  pl: "Polish",
  cs: "Czech",
  sk: "Slovak",
  hu: "Hungarian",
  ro: "Romanian",
  bg: "Bulgarian",
  hr: "Croatian",
  sr: "Serbian",
  sl: "Slovenian",
  el: "Greek",
  uk: "Ukrainian",
  ru: "Russian",
  be: "Belarusian",
  lv: "Latvian",
  lt: "Lithuanian",
  et: "Estonian",
  // Middle East
  tr: "Turkish",
  ar: "Arabic",
  he: "Hebrew",
  fa: "Persian",
  // South Asia
  hi: "Hindi",
  bn: "Bengali",
  ur: "Urdu",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi",
  gu: "Gujarati",
  pa: "Punjabi",
  ml: "Malayalam",
  kn: "Kannada",
  // East / Southeast Asia
  ja: "Japanese",
  zh: "Chinese (Simplified)",
  ko: "Korean",
  vi: "Vietnamese",
  th: "Thai",
  id: "Indonesian",
  ms: "Malay",
  tl: "Tagalog",
  // Africa
  sw: "Swahili",
  am: "Amharic",
  yo: "Yoruba",
};
const SUPPORTED_LANGS = new Set(Object.keys(LANG_NAME_EN));

function buildSystemPrompt(sourceLangName: string, targetLangName: string): string {
  return `You are a professional ${sourceLangName} → ${targetLangName} translator.
Strict rules:
- Input is Markdown; return valid Markdown matching the input format.
- DO NOT translate: contents of code blocks (\`\`\`…\`\`\` or indented), KaTeX formulas (\\$…\\$ or \\$\\$…\\$\\$), URLs, wikilinks [[target]] and their target (the [[link target]] stays untouched; if a pipe alias is present like [[target|alias]], translate only the alias), technical proper names, HTML attributes.
- PRESERVE EXACTLY: heading structure, lists, tables, Obsidian callouts (> [!type] …), footnotes, Markdown punctuation (#, *, _, |, etc.), significant whitespace and line breaks.
- For Obsidian callouts, translate only the body, never the type marker ([!info], [!warning]…).
- Output must be natural, idiomatic ${targetLangName}.
- Add no commentary or preamble. Return only the translated Markdown.`;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// Per-IP cooldown via the Cache API — translation spends Claude (Sonnet) tokens,
// so throttle rapid sequential calls to blunt scripted cost abuse. Per-colo and
// best-effort (fails open); pair with a Cloudflare WAF rule for a hard cap.
const RATE_COOLDOWN_S = 5;
async function rateLimited(ip: string): Promise<boolean> {
  if (ip === "anon") return false;
  try {
    const cache = caches.default;
    const key = new Request(
      `https://ratelimit.internal/translate/${encodeURIComponent(ip)}`,
    );
    if (await cache.match(key)) return true;
    await cache.put(
      key,
      new Response("1", {
        headers: { "cache-control": `max-age=${RATE_COOLDOWN_S}` },
      }),
    );
    return false;
  } catch {
    return false;
  }
}

// Per-instance dedupe: refuse a second concurrent translation for the same
// {ip, payload-hash}. Cleared once the first completes.
const inFlight = new Set<string>();
async function fingerprint(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const llm = llmConfig(env);
  if (!llm && !env.ANTHROPIC_API_KEY) {
    return json({ error: "Traduction non configurée." }, 503);
  }

  let payload: {
    markdown?: string;
    dir?: string;
    sourceLang?: string;
    targetLang?: string;
  };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Requête invalide." }, 400);
  }

  const markdown = (payload.markdown ?? "").slice(0, MAX_MD);
  const dir = payload.dir ?? "";
  const sourceLang = payload.sourceLang;
  const targetLang = payload.targetLang;
  if (!markdown || !sourceLang || !targetLang || sourceLang === targetLang) {
    return json({ error: "Paramètres manquants ou identiques." }, 400);
  }
  if (!SUPPORTED_LANGS.has(sourceLang) || !SUPPORTED_LANGS.has(targetLang)) {
    return json({ error: "Langue non supportée." }, 400);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "anon";
  if (await rateLimited(ip)) {
    return json({ error: "Trop de requêtes — réessaie dans un instant." }, 429);
  }
  const key = `${ip}:${await fingerprint(markdown)}:${targetLang}`;
  if (inFlight.has(key)) {
    return json({ error: "Traduction déjà en cours." }, 429);
  }
  inFlight.add(key);

  try {
    const system = buildSystemPrompt(
      LANG_NAME_EN[sourceLang] ?? sourceLang,
      LANG_NAME_EN[targetLang] ?? targetLang,
    );

    let translated: string;
    if (llm) {
      // Dev: local OpenAI-compatible model (e.g. LM Studio). No stop_reason to
      // inspect — a local truncation just yields a shorter note.
      translated = await openaiChatText(
        llm,
        [
          { role: "system", content: system },
          { role: "user", content: markdown },
        ],
        { maxTokens: MAX_OUTPUT_TOKENS },
      );
    } else {
      const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
      const completion = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        messages: [{ role: "user", content: markdown }],
      });

      if (completion.stop_reason === "max_tokens") {
        return json(
          {
            error:
              "Article trop long pour être traduit en une seule passe — découpe-le ou réduis-le.",
          },
          413,
        );
      }

      translated = completion.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    }

    if (!translated.trim()) {
      return json({ error: "Réponse vide du modèle." }, 502);
    }

    // Re-run the same pipeline used at build so callouts, KaTeX, code
    // highlighting and link resolution all match the original render.
    let html = "";
    try {
      const rendered = await renderMarkdown(translated, { dir });
      html = rendered.html;
    } catch (e) {
      // Fallback: ship the raw Markdown back so the client can at least show
      // *something* if the pipeline fails to run in this runtime.
      return json(
        {
          error: "Rendu échoué côté serveur.",
          fallback: translated,
          detail: e instanceof Error ? e.message : String(e),
        },
        500,
      );
    }

    return json({ html, targetLang });
  } catch (e) {
    return json(
      {
        error: "Échec de la traduction.",
        detail: e instanceof Error ? e.message : String(e),
      },
      502,
    );
  } finally {
    inFlight.delete(key);
  }
};
