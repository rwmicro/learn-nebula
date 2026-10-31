import type { Grade } from "@/lib/srs";

// Shared look of the study views: the Anki decks (Flashcards.tsx) and the
// saved note questions (NoteReview.tsx) use the same buttons and grades.
// Same idiom as the rest of the site's controls: Alegreya Sans, sentence case,
// pill buttons (/cartes/'s "Tout réviser", the account page's buttons).
const sans = "[font-family:'Alegreya_Sans','Alegreya_Sans_Fallback',sans-serif]";
const base = `${sans} cursor-pointer rounded-full border px-4 py-1.5 text-small font-semibold disabled:opacity-40`;
export const btn = `${base} border-rule-strong bg-transparent text-ink hover:border-ink-2 hover:bg-wash-2`;
// Grade buttons take their accent from --g (set inline per grade).
export const btnGrade = `${sans} cursor-pointer rounded-[var(--radius-md)] border border-[var(--g)] border-t-[3px] bg-transparent px-3.5 py-1.5 text-small font-semibold text-[var(--g)] hover:bg-[var(--g)] hover:text-paper disabled:opacity-40`;
export const quiet = `${sans} cursor-pointer border-0 bg-transparent p-0 text-small font-medium text-muted-warm underline decoration-dotted underline-offset-4 hover:bg-transparent hover:text-ink`;

// Grade accents (text + top rule): again → red, hard → amber, good → the
// site's garden green, easy → blue. Theme tokens from global.css, so they hold in dark mode too.
export const GRADE_COLOR: Record<Grade, string> = {
  again: "var(--callout-red)",
  hard: "var(--callout-amber)",
  good: "var(--garden)",
  easy: "var(--callout-blue)",
};
