// Aggregations over the questions log for /admin: which questions keep coming
// back, and which ones retrieval couldn't answer well — the two lists that say
// what to write next. Pure functions over rows (no DB access) so they're
// unit-testable; the log itself is capped (db.ts MAX_QUESTIONS), so this runs
// over a few hundred rows at most.

export interface QuestionLike {
  question: string;
  scope: string | null;
  created_at: number;
  top_score: number | null;
  hits: number | null;
}

/** Below this best cosine (or with no chunk kept at all), the assistant was
 *  answering from little or nothing. ask.ts's own entry threshold is 0.4, so a
 *  question whose best match barely cleared it is a thin answer at best. */
export const WEAK_SCORE = 0.5;

/** Same question, different spelling: lowercase, accents and punctuation
 *  folded away, whitespace collapsed. "Qu'est-ce que le Dharma ?" and
 *  "qu est ce que le dharma" land in one group. */
export function normalizeQuestion(q: string): string {
  return q
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** null = unknown (retrieval wasn't running), never counted as weak. */
export function isWeak(row: Pick<QuestionLike, "top_score" | "hits">): boolean | null {
  if (row.hits === null || row.hits === undefined) return null;
  if (row.hits === 0) return true;
  return row.top_score !== null && row.top_score < WEAK_SCORE;
}

export interface QuestionGroup {
  key: string;
  /** The most recent wording, as typed. */
  question: string;
  count: number;
  last_at: number;
  scopes: string[];
  /** Best score across the group's asks with retrieval running (null if none). */
  top_score: number | null;
  /** Asks in the group with retrieval measured / measured as weak. */
  measured: number;
  weak: number;
}

export function groupQuestions(rows: QuestionLike[]): QuestionGroup[] {
  const groups = new Map<string, QuestionGroup>();
  for (const r of rows) {
    const key = normalizeQuestion(r.question);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        question: r.question,
        count: 0,
        last_at: r.created_at,
        scopes: [],
        top_score: null,
        measured: 0,
        weak: 0,
      };
      groups.set(key, g);
    }
    g.count++;
    if (r.created_at > g.last_at) {
      g.last_at = r.created_at;
      g.question = r.question;
    }
    if (r.scope && !g.scopes.includes(r.scope)) g.scopes.push(r.scope);
    const w = isWeak(r);
    if (w !== null) {
      g.measured++;
      if (w) g.weak++;
      if (r.top_score !== null && (g.top_score === null || r.top_score > g.top_score)) {
        g.top_score = r.top_score;
      }
    }
  }
  return [...groups.values()];
}

const byCountThenRecent = (a: QuestionGroup, b: QuestionGroup) =>
  b.count - a.count || b.last_at - a.last_at;

/** Questions asked at least twice, most asked first. */
export function frequentQuestions(rows: QuestionLike[], limit = 30): QuestionGroup[] {
  return groupQuestions(rows)
    .filter((g) => g.count >= 2)
    .sort(byCountThenRecent)
    .slice(0, limit);
}

/** Groups where most measured asks were weak — the vault's gaps. Sorted by how
 *  often they were asked, so a recurring gap outranks a one-off. */
export function weakQuestions(rows: QuestionLike[], limit = 50): QuestionGroup[] {
  return groupQuestions(rows)
    .filter((g) => g.measured > 0 && g.weak * 2 >= g.measured)
    .sort(byCountThenRecent)
    .slice(0, limit);
}
