// Prompt pieces for /api/ask's reply-language hint, its socratic mode and
// /api/ask/explain ("Explique-le avec tes mots"). Pure, tested in
// ask-prompts.test.ts; the same wording feeds the on-device Prompt API path
// in the browser (components/GardenChat.tsx) so both answer alike.

/** Languages the reader's question may be detected in (LanguageDetector in the
 *  browser, sent as `lang`), with their French name for the prompt. Anything
 *  else is ignored, so the hint can never smuggle text into the prompt. */
export const ASK_LANG_NAMES: Readonly<Record<string, string>> = {
  fr: "français",
  en: "anglais",
  es: "espagnol",
  zh: "chinois",
  ar: "arabe",
  de: "allemand",
  it: "italien",
  pt: "portugais",
  nl: "néerlandais",
  ro: "roumain",
  tr: "turc",
  ru: "russe",
  id: "indonésien",
  ms: "malais",
  hi: "hindi",
  ja: "japonais",
  ko: "coréen",
};

/** Validated reply language from the client's `lang` hint ("" = none). */
export function replyLangHint(lang: unknown): string {
  if (typeof lang !== "string") return "";
  const base = lang.trim().toLowerCase().split(/[-_]/)[0];
  return Object.prototype.hasOwnProperty.call(ASK_LANG_NAMES, base) ? base : "";
}

/** The line repeated next to the question: an explicit language when the
 *  browser detected one, else "the language of the question". */
export function langReminder(lang: string): string {
  return lang
    ? `(Réponds en ${ASK_LANG_NAMES[lang]}, la langue de la question ci-dessus.)`
    : "(Réponds dans la même langue que la question ci-dessus.)";
}

/** Extra rules for the socratic mode: guide with questions, don't answer. */
export const SOCRATIC_RULES = [
  "- MODE SOCRATIQUE : ne donne pas la réponse. Pose une à trois questions courtes qui amènent l'utilisateur à la trouver lui-même à partir des notes, de la plus simple à la plus fine.",
  "- Si sa question contient déjà une tentative de réponse, dis brièvement ce qui tient et ce qui manque, puis pose la question suivante.",
  "- Pas plus de quelques phrases au total.",
].join("\n");

export const MAX_EXPLAIN_PASSAGE = 4000;
export const MAX_EXPLAIN_TEXT = 2000;
export const MAX_EXPLAIN_TITLE = 200;

/** System prompt for "Explique-le avec tes mots": feedback on the reader's
 *  own explanation of a passage, grounded on that passage only. */
export function explainSystem(lang: string): string {
  return [
    "Tu es l'assistant de « Garden of Knowledge », un jardin de notes personnel.",
    "L'utilisateur a lu un passage d'une note et l'explique avec ses propres mots. Ton rôle : un retour bref et bienveillant, pas une correction ligne à ligne.",
    "Règles :",
    "- Appuie-toi UNIQUEMENT sur le passage fourni : ne juge pas l'explication sur des connaissances extérieures.",
    "- Dis d'abord ce que l'explication a bien saisi (une phrase).",
    "- Puis ce qui manque ou est inexact par rapport au passage : deux ou trois points au plus, en citant le passage quand c'est utile.",
    "- Termine par une question qui l'aide à compléter son explication.",
    "- Si l'explication est vide ou hors sujet, dis-le simplement et pose une question pour démarrer.",
    "- Tutoie l'utilisateur. Markdown léger (**gras**, listes `- `). Concis.",
    lang
      ? `- Réponds en ${ASK_LANG_NAMES[lang] ?? "français"}.`
      : "- Réponds dans la langue de l'explication de l'utilisateur.",
  ].join("\n");
}

/** The user turn for the explain prompt. Inputs are already length-bounded. */
export function explainUser(passage: string, explanation: string, title: string): string {
  return [
    title ? `Note : ${title}` : "",
    `Passage :\n« ${passage} »`,
    `Explication de l'utilisateur :\n« ${explanation} »`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// --- On-device variants (components/GardenChat.tsx) -------------------------
// A small model follows a fixed, line-based format better than free prose,
// and the chat draws each part on its own (« Ce qui tient », « Ce qui
// manque »). Parsing is lenient: when the format is not there, the caller
// shows the answer as plain text.

/** "Avec mes mots" on the device: same rules, fixed three-line format. */
export function explainSystemDevice(lang: string): string {
  return [
    explainSystem(lang),
    "Format OBLIGATOIRE, trois lignes, rien d'autre :",
    "TIENT: <ce que l'explication a bien saisi, une phrase>",
    "MANQUE: <ce qui manque ou est inexact par rapport au passage, une ou deux phrases>",
    "QUESTION: <une question pour compléter l'explication>",
  ].join("\n");
}

export interface ExplainFeedback {
  ok: string;
  missing: string;
  question: string;
}

/** The three parts of explainSystemDevice()'s answer, or null when the model
 *  didn't follow the format. */
export function parseExplainFeedback(text: string): ExplainFeedback | null {
  const grab = (key: string) => {
    const m = new RegExp(`^\\s*\\**${key}\\**\\s*:\\s*(.+?)\\s*$`, "im").exec(text);
    return m ? m[1].replace(/^\*+|\*+$/g, "").trim() : "";
  };
  const ok = grab("TIENT");
  const missing = grab("MANQUE");
  if (!ok && !missing) return null;
  return { ok, missing, question: grab("QUESTION") };
}

/** "Faire une carte": one question / answer pair from an answer. */
export function cardSystem(lang: string): string {
  return [
    "Tu écris une carte de révision (question au recto, réponse au verso) à partir d'une explication.",
    "- La question est courte et précise ; la réponse tient en une ou deux phrases.",
    "- N'ajoute rien qui ne figure pas dans l'explication.",
    lang ? `- Écris en ${ASK_LANG_NAMES[lang] ?? "français"}.` : "- Écris dans la langue de l'explication.",
    "Format OBLIGATOIRE, deux lignes, rien d'autre :",
    "RECTO: <la question>",
    "VERSO: <la réponse>",
  ].join("\n");
}

export function parseCard(text: string): { front: string; back: string } | null {
  const m = /\**RECTO\**\s*:\s*([\s\S]*?)\s*\**VERSO\**\s*:\s*([\s\S]*)$/i.exec(text);
  if (!m) return null;
  const front = m[1].trim();
  const back = m[2].trim();
  return front && back ? { front: front.slice(0, 500), back: back.slice(0, 1500) } : null;
}

/** Translate one HTML block of a note on the device (public/js/translate.js). */
export function translateSystem(from: string, to: string): string {
  return [
    `Tu traduis un fragment HTML d'une note de ${from} vers ${to}.`,
    "- Garde EXACTEMENT les balises et leurs attributs ; traduis seulement le texte.",
    "- Ne traduis pas le code, les formules ni les mots cités dans une autre langue.",
    "- Réponds uniquement par le fragment traduit, sans commentaire ni bloc de code.",
  ].join("\n");
}
