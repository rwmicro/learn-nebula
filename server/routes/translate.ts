// On-demand translation — the /api/translate Pages Function, self-hosted.
// Translate raw Markdown (Anthropic or an OpenAI-compatible endpoint), then
// re-run the site's renderMarkdown pipeline (works natively in Node — Shiki and
// KaTeX included) so the HTML matches the build output.

import crypto from "node:crypto";
import { Hono, type Context } from "hono";
import { renderMarkdown } from "../../lib/markdown.ts";
import { env, canGenerate } from "../env.ts";
import { getIp } from "../http.ts";
import { Cooldown, InFlight, Quota } from "../ratelimit.ts";
import { anthropicClient, chatConfig, openaiChatText } from "../llm.ts";
import { cachedTranslation, storeTranslation } from "../db.ts";
import { sameOrigin } from "../session.ts";
import type Anthropic from "@anthropic-ai/sdk";

const MAX_MD = 50_000;
const MAX_OUTPUT_TOKENS = 32_000;

const LANG_NAME_EN: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian",
  pt: "Portuguese", nl: "Dutch", ca: "Catalan", ga: "Irish", cy: "Welsh",
  eu: "Basque", sv: "Swedish", da: "Danish", no: "Norwegian", fi: "Finnish",
  is: "Icelandic", pl: "Polish", cs: "Czech", sk: "Slovak", hu: "Hungarian",
  ro: "Romanian", bg: "Bulgarian", hr: "Croatian", sr: "Serbian", sl: "Slovenian",
  el: "Greek", uk: "Ukrainian", ru: "Russian", be: "Belarusian", lv: "Latvian",
  lt: "Lithuanian", et: "Estonian", tr: "Turkish", ar: "Arabic", he: "Hebrew",
  fa: "Persian", hi: "Hindi", bn: "Bengali", ur: "Urdu", ta: "Tamil", te: "Telugu",
  mr: "Marathi", gu: "Gujarati", pa: "Punjabi", ml: "Malayalam", kn: "Kannada",
  ja: "Japanese", zh: "Chinese (Simplified)", ko: "Korean", vi: "Vietnamese",
  th: "Thai", id: "Indonesian", ms: "Malay", tl: "Tagalog", sw: "Swahili",
  am: "Amharic", yo: "Yoruba",
};
const SUPPORTED_LANGS = new Set(Object.keys(LANG_NAME_EN));

function buildSystemPrompt(src: string, tgt: string): string {
  return `You are a professional ${src} → ${tgt} translator.
Strict rules:
- Input is Markdown; return valid Markdown matching the input format.
- DO NOT translate: contents of code blocks (\`\`\`…\`\`\` or indented), KaTeX formulas (\\$…\\$ or \\$\\$…\\$\\$), URLs, wikilinks [[target]] and their target (the [[link target]] stays untouched; if a pipe alias is present like [[target|alias]], translate only the alias), technical proper names, HTML attributes.
- PRESERVE EXACTLY: heading structure, lists, tables, Obsidian callouts (> [!type] …), footnotes, Markdown punctuation (#, *, _, |, etc.), significant whitespace and line breaks.
- For Obsidian callouts, translate only the body, never the type marker ([!info], [!warning]…).
- Output must be natural, idiomatic ${tgt}.
- Add no commentary or preamble. Return only the translated Markdown.`;
}

const fingerprint = (s: string) =>
  crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

const cooldown = new Cooldown(5);
const quota = new Quota(env.translateHourly, 3_600_000);
// Instance-wide daily backstop (all IPs together), keyed on one constant.
const daily = env.translateDaily > 0 ? new Quota(env.translateDaily, 86_400_000) : null;
const DAILY_KEY = "translate:all";
const inflight = new InFlight();

export const translateRoute = new Hono();

// This route renders arbitrary Markdown as HTML and spends the LLM budget, so
// reject cross-site POSTs the same way the account routes do (SameSite=Lax
// already keeps the cookie off them; this refuses a forged Origin outright).
translateRoute.use("*", sameOrigin);

translateRoute.post("/", async (c) => {
  if (!canGenerate()) return c.json({ error: "Traduction non configurée." }, 503);

  let payload: { markdown?: string; dir?: string; sourceLang?: string; targetLang?: string };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Requête invalide." }, 400);
  }

  const markdown = (payload.markdown ?? "").slice(0, MAX_MD);
  const dir = payload.dir ?? "";
  const sourceLang = payload.sourceLang;
  const targetLang = payload.targetLang;
  if (!markdown || !sourceLang || !targetLang || sourceLang === targetLang) {
    return c.json({ error: "Paramètres manquants ou identiques." }, 400);
  }
  if (!SUPPORTED_LANGS.has(sourceLang) || !SUPPORTED_LANGS.has(targetLang)) {
    return c.json({ error: "Langue non supportée." }, 400);
  }

  // Served before the rate limits: a cached translation costs nothing, so a
  // reader who already hit their hourly cap still gets notes someone else
  // translated. The model is part of the key so switching TRANSLATE_MODEL (or
  // the backend) doesn't keep serving the old model's output.
  const model = env.anthropicKey ? `anthropic:${env.translateModel}` : `openai:${env.llmModel}`;
  const cacheKey = crypto
    .createHash("sha256")
    .update(`${model}\0${sourceLang}\0${targetLang}\0${markdown}`)
    .digest("hex");
  let cached: string | null = null;
  try {
    cached = cachedTranslation(cacheKey);
  } catch (e) {
    console.warn("translate: cache read failed", e);
  }
  if (cached) return render(c, cached, dir, targetLang);

  const ip = getIp(c);
  if (ip !== "anon" && cooldown.limited(`translate:${ip}`)) {
    return c.json({ error: "Trop de requêtes — réessaie dans un instant." }, 429);
  }
  if (env.translateHourly > 0 && ip !== "anon" && quota.exceeded(`translate:${ip}`)) {
    return c.json({ error: "Limite horaire de traduction atteinte — réessaie plus tard." }, 429);
  }
  if (daily && daily.exceeded(DAILY_KEY)) {
    return c.json({ error: "Traduction momentanément indisponible — réessaie plus tard." }, 429);
  }
  const key = `${ip}:${fingerprint(markdown)}:${targetLang}`;
  if (inflight.has(key)) return c.json({ error: "Traduction déjà en cours." }, 429);
  inflight.add(key);

  try {
    const system = buildSystemPrompt(
      LANG_NAME_EN[sourceLang] ?? sourceLang,
      LANG_NAME_EN[targetLang] ?? targetLang,
    );

    let translated: string;
    if (env.anthropicKey) {
      // Streamed, then awaited whole: the SDK refuses a NON-streamed request
      // whose max_tokens implies it could run past 10 minutes (anything above
      // ~21k tokens), before sending it — which made every translation 502.
      const completion = await anthropicClient(env.anthropicKey)
        .messages.stream({
          model: env.translateModel,
          max_tokens: MAX_OUTPUT_TOKENS,
          system,
          messages: [{ role: "user", content: markdown }],
        })
        .finalMessage();
      if (completion.stop_reason === "max_tokens") {
        return c.json(
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
    } else {
      const llm = chatConfig(env.llmBaseUrl, env.llmModel)!;
      translated = await openaiChatText(
        llm,
        [
          { role: "system", content: system },
          { role: "user", content: markdown },
        ],
        { maxTokens: MAX_OUTPUT_TOKENS },
      );
    }

    if (!translated.trim()) return c.json({ error: "Réponse vide du modèle." }, 502);

    try {
      storeTranslation(cacheKey, translated);
    } catch (e) {
      console.warn("translate: cache write failed", e);
    }
    return render(c, translated, dir, targetLang);
  } catch (e) {
    // Log the backend error server-side; don't leak it to the client.
    console.error("translate: failed", e instanceof Error ? e.message : e);
    return c.json({ error: "Échec de la traduction." }, 502);
  } finally {
    inflight.delete(key);
  }
});

async function render(c: Context, translated: string, dir: string, targetLang: string) {
  try {
    const rendered = await renderMarkdown(translated, { dir });
    return c.json({ html: rendered.html, targetLang });
  } catch (e) {
    // Keep the plain-text fallback so the client can still show the
    // translation, but don't echo the internal error message.
    console.error("translate: render failed", e instanceof Error ? e.message : e);
    return c.json({ error: "Rendu échoué côté serveur.", fallback: translated }, 500);
  }
}
