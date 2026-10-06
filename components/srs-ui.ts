import type { Grade } from "@/lib/srs";

// Shared look of the study views: the Anki decks (Flashcards.tsx) and the
// saved note questions (NoteReview.tsx) use the same buttons and grades.
const base =
  "cursor-pointer rounded-[2px] border px-3.5 py-1.5 text-micro font-semibold uppercase tracking-[0.08em] disabled:opacity-40";
export const btn = `${base} border-ink bg-transparent text-ink hover:bg-ink hover:text-paper`;
export const btnOn = `${base} border-ink bg-ink text-paper hover:bg-ink`;
// Grade buttons take their accent from --g (set inline per grade).
export const btnGrade = `${base} border-[var(--g)] border-t-[3px] bg-transparent text-[var(--g)] hover:bg-[var(--g)] hover:text-paper`;
export const quiet =
  "cursor-pointer border-0 bg-transparent p-0 text-micro font-semibold uppercase tracking-[0.08em] text-muted-warm underline decoration-dotted underline-offset-4 hover:bg-transparent hover:text-ink";

// Grade accents (text + top rule): again → red, hard → amber, good → the
// site's garden green, easy → blue. Theme tokens from global.css, so they hold in dark mode too.
export const GRADE_COLOR: Record<Grade, string> = {
  again: "var(--callout-red)",
  hard: "var(--callout-amber)",
  good: "var(--garden)",
  easy: "var(--callout-blue)",
};
