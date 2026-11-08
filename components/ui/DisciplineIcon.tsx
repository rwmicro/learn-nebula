import type { PathFamily } from "@/lib/path-family";
import { FamilyIcon, glyphStroke } from "@/components/ui/FamilyIcon";

// One glyph per discipline (the `discipline.*` keys of lib/i18n.ts), for the
// lists where several disciplines of one colour family sit side by side
// (/notes/): with FamilyIcon alone, Agriculture, Biologie, Écologie, Médecine
// and Sport all showed the same leaf, Chimie, Géologie, Maths and Physique the
// same atom. A discipline without its own glyph keeps its family's.

type Glyph = { d: string; circles?: [number, number, number][] };

const GLYPHS: Record<string, Glyph> = {
  agriculture: { d: "M12 21V9M12 9c0-3 2-5 5-5 0 3-2 5-5 5ZM12 14c0-3-2-5-5-5 0 3 2 5 5 5ZM8 21h8" },
  architecture: { d: "M3 21h18M5 21V10l7-6 7 6v11M10 21v-5h4v5" },
  biology: { d: "M8 3c0 4 8 5 8 9s-8 5-8 9M16 3c0 4-8 5-8 9s8 5 8 9M9.5 6.5h5M9.5 17.5h5M10.5 12h3" },
  chemistry: { d: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.4 15h9.2" },
  ecology: { d: "M5 19C5 10 10 5 20 4c-1 10-6 15-15 15ZM5 19l7-7" },
  geology: { d: "M2 20 9 8l4 6 3-4 6 10ZM7.5 14.5l2 1.5 2-1" },
  mathematics: { d: "M17 5H7l6 7-6 7h10" },
  medicine: { d: "M3 12h4l2-5 4 10 2-5h6" },
  sport: { d: "M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12" },
  anthropology: { d: "M6 21v-2a6 6 0 0 1 12 0v2", circles: [[12, 7, 3.5]] },
  cinema: { d: "M4 10h16v10H4ZM4 10l1.5-5 14 2.5-.9 2.5M9.4 5.9 8.6 9.6M14.4 6.8l-.8 3.2" },
  communication: { d: "M4 5h16v11H9l-5 4Z" },
  economy: {
    d: "M14.5 9a3 3 0 0 0-2.5-1.2c-1.6 0-2.7.8-2.7 2s1.1 1.7 2.7 2 2.8.9 2.8 2.1-1.2 2-2.8 2A3 3 0 0 1 9.5 15M12 6.5v11",
    circles: [[12, 12, 9]],
  },
  history: { d: "M7 3h10M7 21h10M8 3v2a4 4 0 0 0 1.6 3.2L12 10l2.4-1.8A4 4 0 0 0 16 5V3M8 21v-2a4 4 0 0 1 1.6-3.2L12 14l2.4 1.8A4 4 0 0 1 16 19v2" },
  law: { d: "M12 3v18M7 21h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0ZM19 7l-3 6a3 3 0 0 0 6 0Z" },
  linguistics: { d: "M3 18 7.5 6 12 18M4.7 14h5.6M20 10v8M20 14a3 3 0 1 0-3 3" },
  litterature: { d: "M5 5a2 2 0 0 1 2-2h12v16H7a2 2 0 0 0-2 2ZM5 21V5M9 7h6" },
  music: { d: "M9 18V5l11-2v13", circles: [[6.5, 18, 2.5], [17.5, 16, 2.5]] },
  mythology: { d: "M13 3 5 14h6l-1 7 8-11h-6Z" },
  psychologie: { d: "M12 3v18M6 5v3a6 6 0 0 0 12 0V5M9 21h6" },
  religion: { d: "M12 2c2 3 2 5 0 7-2-2-2-4 0-7ZM9 11h6v10H9ZM6 21h12" },
  sociology: { d: "M3 19c0-3 2.2-5 5-5s5 2 5 5M11 19c0-3 2.2-5 5-5s5 2 5 5", circles: [[8, 8, 2.6], [16, 8, 2.6]] },
  theatre: { d: "M3 4h10v6a5 5 0 0 1-10 0ZM6 7.5h.01M10 7.5h.01M6.2 11c1 1 2.6 1 3.6 0M15 9h6v5a5 5 0 0 1-8.7 3.3" },
};

/** The glyph for a `discipline.<name>` key, else its family's. */
export function DisciplineIcon({ disciplineKey, family }: { disciplineKey?: string | null; family: PathFamily | null }) {
  const g = disciplineKey?.startsWith("discipline.") ? GLYPHS[disciplineKey.slice("discipline.".length)] : undefined;
  if (!g) return <FamilyIcon family={family} />;
  return (
    <svg viewBox="0 0 24 24" {...glyphStroke}>
      <path d={g.d} />
      {g.circles?.map(([cx, cy, r]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />)}
    </svg>
  );
}
