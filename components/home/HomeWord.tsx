"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { FamilyIcon } from "@/components/ui/FamilyIcon";
import { lastChoice } from "@/components/home/HomeTalk";

// The phone home's "Le mot du jour" (components/home/HomeDashboard.tsx): one
// word a day in the language last practised on /parler/ (Spanish before
// that), with its clip to play and a link to the vocabulary note it comes
// from, where the pronunciation coach records the reader. The words are
// read at build from the vault's vocabulary tables (app/page.tsx,
// lib/home-picks.ts vocabFromMarkdown), ten per language.

export interface HomeWordLang {
  id: string;
  words: {
    w: string;
    g: string;
    audio: string;
    tr?: string;
    ex?: string;
    /** The note it comes from. */
    note: string;
    href: string;
  }[];
}

export function HomeWord({ langs }: { langs: HomeWordLang[] }) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  // Chosen after hydration (the date and the stored language are the
  // browser's); the first paint keeps the slot empty.
  const [pick, setPick] = useState<{ lang: HomeWordLang; i: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const want = lastChoice()?.lang ?? "es";
    const lang = langs.find((l) => l.id === want) ?? langs.find((l) => l.id === "es") ?? langs[0];
    if (!lang) return;
    const now = new Date();
    const day = Math.floor(now.getTime() / 86_400_000 - now.getTimezoneOffset() / 1440);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the date and localStorage after hydration
    setPick({ lang, i: day % lang.words.length });
    return () => audio.current?.pause();
  }, [langs]);

  if (!pick) return null;
  const { lang } = pick;
  const word = lang.words[pick.i];
  const langName = tr(`parler.lang_${lang.id}`);

  const play = () => {
    try {
      audio.current?.pause();
      const a = new Audio(word.audio);
      audio.current = a;
      a.onended = a.onerror = () => setPlaying(false);
      setPlaying(true);
      void a.play().catch(() => setPlaying(false));
    } catch {
      setPlaying(false);
    }
  };

  return (
    <section className="dash-word-sec" aria-labelledby="dash-word-h">
      <div className="dash-row-h">
        <h2 className="dash-h" id="dash-word-h">
          {tr("dash.word")}
        </h2>
        <a href={`/parler/#lang=${lang.id}`}>{langName}</a>
      </div>
      <div className="dash-word" data-family="langues">
        <a className="dash-word-k" href={word.href}>
          <FamilyIcon family="langues" />
          {/* "Vocabulaire — Espagnol" already says the language. */}
          {langName} · {word.note.replace(/\s+[—–-]\s+[^—–-]+$/, "")}
        </a>
        <div className="dash-word-row">
          <div className="dash-word-tx">
            <b lang={lang.id} dir="auto">
              {word.w}
            </b>
            {word.tr && <span className="dash-word-tr">{word.tr}</span>}
            <small>{word.g}</small>
          </div>
          <div className="dash-word-btns">
            <button type="button" className={playing ? "is-main is-playing" : "is-main"} onClick={play} aria-label={tr("dash.wordListen", { w: word.w })}>
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5 6 9H3v6h3l5 4z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
              </svg>
            </button>
            <a href={word.href} aria-label={tr("dash.wordRepeat")}>
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </a>
          </div>
        </div>
        {word.ex && (
          <p className="dash-word-ex" lang={lang.id} dir="auto">
            {word.ex}
          </p>
        )}
      </div>
    </section>
  );
}
