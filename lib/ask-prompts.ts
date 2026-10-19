// Prompt pieces for /api/ask's reply-language hint, its socratic mode and
// /api/ask/explain ("Explique-le avec tes mots"). Pure, tested in
// ask-prompts.test.ts; the same wording feeds the on-device Prompt API path
// in the browser (components/PinnedAssistant.tsx) so both answer alike.

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
