// Build-time extras for the reading paths (/parcours/): each note's reading
// time (same estimate as the note page, components/note/SinglePage.tsx) and its
// `[!quiz]` questions, extracted from the rendered HTML so the path page can
// run a revision session and derive "maîtrisée" without visiting the notes.
// Only notes that contain a quiz callout are rendered here.

import { getGlossaryFor, getPost, type ReadingPathView } from "./content";
import { extractPlain, renderMarkdown } from "./markdown";
import { extractQuizItems, type QuizItem } from "./note-quiz";

export interface NoteExtras {
  minutes: number;
  quiz: QuizItem[];
}

/** One revision card of a path, as embedded in its page. */
export interface PathQuizItem extends QuizItem {
  slug: string;
  title: string;
  /** Note URL with the card's anchor. */
  url: string;
}

/** ~220 words a minute, at least 1 — the note page's own estimate. */
export function readingMinutes(plain: string): number {
  const words = plain.trim() ? plain.trim().split(/\s+/).length : 0;
  return Math.max(1, Math.round(words / 220));
}

const cache = new Map<string, Promise<NoteExtras>>();

export function noteExtras(slug: string): Promise<NoteExtras> {
  let p = cache.get(slug);
  if (!p) {
    p = (async () => {
      const doc = getPost(slug);
      const minutes = readingMinutes(extractPlain(doc.body));
      if (!/\[!quiz\]/i.test(doc.body)) return { minutes, quiz: [] };
      const dir = doc.rawPath.includes("/") ? doc.rawPath.slice(0, doc.rawPath.lastIndexOf("/")) : "";
      const { html } = await renderMarkdown(doc.body, { dir, glossary: getGlossaryFor(doc) });
      // A repeated question (same id) is one card in the reviews.
      const seen = new Set<string>();
      const quiz = extractQuizItems(html).filter((q) => !seen.has(q.id) && !!seen.add(q.id));
      return { minutes, quiz };
    })();
    cache.set(slug, p);
  }
  return p;
}

export interface PathExtras {
  /** Per note slug. */
  notes: Record<string, { minutes: number; quiz: string[] }>;
  items: PathQuizItem[];
}

export async function pathExtras(path: ReadingPathView): Promise<PathExtras> {
  const notes: PathExtras["notes"] = {};
  const items: PathQuizItem[] = [];
  for (const n of path.notes) {
    const x = await noteExtras(n.slug);
    notes[n.slug] = { minutes: x.minutes, quiz: x.quiz.map((q) => q.id) };
    for (const q of x.quiz) items.push({ ...q, slug: n.slug, title: n.title, url: `${n.href}#${q.domId}` });
  }
  return { notes, items };
}
