/**
 * Pure helpers behind the note's study tools (public/js/study-tools.js,
 * audit pédagogie 2026-11-10): the end-of-note self-check, the free recall,
 * the "sure / hesitant" calibration of quiz answers and the cloze card made
 * from a highlight. Storage stays in this browser (not synced).
 */
import { fold } from "./palette-match";

export type SelfCheck = "sait" | "doute" | "non";
const CHECKS: readonly SelfCheck[] = ["sait", "doute", "non"];

/** One note's study state: the self-check per item (objective or section). */
export interface NoteStudy {
  check: Record<string, SelfCheck>;
}

export const studyKey = (slug: string) => `gkStudy:${slug}`;

export function parseStudy(raw: string | null): NoteStudy {
  const out: NoteStudy = { check: {} };
  try {
    const o = raw ? (JSON.parse(raw) as { check?: unknown }) : null;
    if (o && o.check && typeof o.check === "object" && !Array.isArray(o.check)) {
      for (const [k, v] of Object.entries(o.check as Record<string, unknown>))
        if (k && k.length <= 200 && CHECKS.includes(v as SelfCheck)) out.check[k] = v as SelfCheck;
    }
  } catch {
    /* empty */
  }
  return out;
}

/** The items the reader should read again: "pas sûr" or "non". */
export function toReread(study: NoteStudy, items: readonly string[]): string[] {
  return items.filter((k) => study.check[k] === "doute" || study.check[k] === "non");
}

const STOP = new Set(
  "avec dans pour sans sous entre leur leurs elle elles nous vous ils une des les est sont cette ces quoi comment pourquoi quand plus moins tres aussi mais donc ainsi from with that this what when which their about into the and"
    .split(" "),
);

/** The words of a heading that say what it is about (folded, 4 letters or
 *  more, no stop words). */
export function keyWords(s: string): string[] {
  return [...new Set(fold(s).split(/[^\p{L}\p{N}]+/u))].filter((w) => w.length >= 4 && !STOP.has(w));
}

/** Free recall: which of the note's sections the reader's text touches. A
 *  section counts when one of its key words (or a word sharing its first five
 *  letters: "inclinaison" / "incliné") appears. A section with no key word
 *  never counts. */
export function recallCoverage(text: string, sections: readonly string[]): boolean[] {
  const words = fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const has = (k: string) => words.some((w) => w === k || (k.length >= 5 && w.length >= 5 && w.slice(0, 5) === k.slice(0, 5)));
  return sections.map((s) => keyWords(s).some(has));
}

/** A cloze card from a highlight: the sentence with the highlighted words
 *  blanked. Null when the quote isn't in the sentence, or is all of it. */
export function clozeOf(sentence: string, quote: string): string | null {
  const s = sentence.replace(/\s+/g, " ").trim();
  const q = quote.replace(/\s+/g, " ").trim();
  if (!q) return null;
  const i = s.indexOf(q);
  if (i < 0 || q.length >= s.length - 2) return null;
  return `${s.slice(0, i)}[…]${s.slice(i + q.length)}`;
}

/** One answered multiple-choice question: was the reader sure, were they right. */
export interface CalibrationMark {
  sure: boolean;
  ok: boolean;
  /** dayKey of the answer. */
  d: string;
}
export const CALIBRATION_KEY = "gkCalibration";
/** Only the latest answers are kept. */
export const CALIBRATION_MAX = 400;

export function parseCalibration(raw: string | null): CalibrationMark[] {
  try {
    const a = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(a)) return [];
    return a
      .filter(
        (m): m is CalibrationMark =>
          !!m && typeof m === "object" && typeof m.sure === "boolean" && typeof m.ok === "boolean" && typeof m.d === "string",
      )
      .slice(-CALIBRATION_MAX);
  } catch {
    return [];
  }
}

export function addCalibration(list: CalibrationMark[], mark: CalibrationMark): CalibrationMark[] {
  return [...list, mark].slice(-CALIBRATION_MAX);
}

/** Right answers when sure, and when hesitant: {n, ok} each. */
export function calibrationSummary(list: readonly CalibrationMark[]): {
  sure: { n: number; ok: number };
  unsure: { n: number; ok: number };
} {
  const out = { sure: { n: 0, ok: 0 }, unsure: { n: 0, ok: 0 } };
  for (const m of list) {
    const b = m.sure ? out.sure : out.unsure;
    b.n++;
    if (m.ok) b.ok++;
  }
  return out;
}
