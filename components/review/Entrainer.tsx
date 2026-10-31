"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { dayKey } from "@/lib/srs";
import { isStarted, loadDeckProgress, storageOk } from "@/lib/review-item";
import { countSaved, loadAllNoteDecks } from "@/lib/note-quiz";
import { FRAGILE_LAPSES, practicePick, type PracticeMode } from "@/lib/practice";
import { AppBack } from "@/components/layout/AppBack";

// /cartes/entrainer/ — "S'entraîner": four extra sessions over what the
// reader has already studied (lib/practice.ts), each a tile with how much it
// holds. Counts from this browser's storage, after hydration. Shares
// defis.css (same narrow column, same cards).

const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const TILES: { mode: PracticeMode; tone: string; icon: React.ReactNode }[] = [
  { mode: "erreurs", tone: "societe", icon: svg(<path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />) },
  {
    mode: "fragiles",
    tone: "pensee",
    icon: svg(
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.5" />
      </>,
    ),
  },
  {
    mode: "ecoute",
    tone: "sciences",
    icon: svg(
      <>
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
      </>,
    ),
  },
  {
    mode: "eclair",
    tone: "vivant",
    icon: svg(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4M12 17h.01" />
      </>,
    ),
  },
];

export function Entrainer({ decks }: { decks: { slug: string; langues: boolean }[] }) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  const [n, setN] = useState<Record<PracticeMode, number> | null>(null);

  useEffect(() => {
    if (!storageOk()) return;
    const today = dayKey();
    const c: Record<PracticeMode, number> = { erreurs: 0, fragiles: 0, ecoute: 0, eclair: 0 };
    for (const d of decks) {
      const p = loadDeckProgress(d.slug);
      if (!isStarted(p)) continue;
      for (const st of Object.values(p.cards)) {
        if (practicePick("erreurs", st, today)) c.erreurs++;
        if (practicePick("fragiles", st, today)) c.fragiles++;
      }
      if (d.langues) c.ecoute++;
    }
    const notes = loadAllNoteDecks(localStorage);
    for (const nd of Object.values(notes))
      for (const id of Object.keys(nd.items)) {
        if (practicePick("erreurs", nd.cards[id], today)) c.erreurs++;
        if (practicePick("fragiles", nd.cards[id], today)) c.fragiles++;
      }
    c.eclair = countSaved(notes);
    setN(c);
  }, [decks]);

  const sub = (m: PracticeMode) => {
    if (!n) return tr(`practice.${m}Sub`, { n: FRAGILE_LAPSES });
    if (m === "erreurs") return tr("practice.erreursN", { n: n.erreurs });
    if (m === "fragiles") return n.fragiles ? tr("practice.fragilesN", { n: n.fragiles }) : tr("practice.fragilesSub", { n: FRAGILE_LAPSES });
    if (m === "ecoute") return tr("practice.ecouteSub");
    return tr("practice.eclairN", { n: n.eclair });
  };
  const empty = (m: PracticeMode) => !!n && (m === "ecoute" ? n.ecoute === 0 : n[m] === 0);

  return (
    <main className="defis entrainer" data-pagefind-ignore>
      <AppBack href="/cartes/" labelKey="tabbar.review" />
      <a className="old-back entrainer-back" href="/cartes/">
        ← {tr("tabbar.review")}
      </a>
      <h1 className="defis-title">{tr("practice.title")}</h1>
      <p className="entrainer-lede">{tr("practice.lede")}</p>
      <ul className="entrainer-tiles">
        {TILES.map(({ mode, tone, icon }) => (
          <li key={mode} data-family={tone} className={empty(mode) ? "is-empty" : undefined}>
            <a href={`/cartes/entrainer/${mode}/`}>
              <span className="defi-ico">{icon}</span>
              <b>{tr(`practice.${mode}`)}</b>
              <small>{sub(mode)}</small>
            </a>
          </li>
        ))}
      </ul>
      <p className="defis-note">{tr("practice.note")}</p>
    </main>
  );
}
