"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

// The "Parler" half of the phone home's "Jouer et pratiquer" row
// (components/home/HomeDashboard.tsx, beside HomeChess): the partner of the
// language last practised (or Lucía, in Spanish), the line they would open
// with, the language and level, and the way in. The partners and lines come from the build (app/page.tsx), so the
// home doesn't ship the scenes' data.

export interface HomeTalkLang {
  id: string;
  /** One partner per level, A1 → B2. */
  partners: string[];
  /** The café scene's first expression. */
  line: string;
}

const LEVELS = ["a1", "a2", "b1", "b2"];

export function lastChoice(): { lang: string; level: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem("gk-partner-prefs") ?? "null") as { lang?: string; level?: string } | null;
    return v && typeof v.lang === "string" ? { lang: v.lang, level: typeof v.level === "string" ? v.level : "a2" } : null;
  } catch {
    return null;
  }
}

export function HomeTalk({ langs }: { langs: HomeTalkLang[] }) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  const [pick, setPick] = useState<{ lang: string; level: string }>({ lang: "es", level: "a2" });

  useEffect(() => {
    const c = lastChoice();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from localStorage after hydration
    if (c && langs.some((l) => l.id === c.lang)) setPick(c);
  }, [langs]);

  const lang = langs.find((l) => l.id === pick.lang) ?? langs[0];
  if (!lang) return null;
  const name = lang.partners[Math.max(0, LEVELS.indexOf(pick.level))] ?? lang.partners[1];

  return (
    <a className="dash-play-card dash-play-talk" href={`/parler/#lang=${lang.id}`}>
      <span className="dash-play-band" aria-hidden="true">
        <span className="dash-talk-av">{name[0]}</span>
        <span className="dash-talk-bubble">
          <b lang={lang.id} dir="auto">
            {lang.line}
          </b>
          <small>{tr("dash.talkAt", { name })}</small>
        </span>
      </span>
      <span className="dash-play-body">
        <b>{tr("dash.talk")}</b>
        <small>{tr("dash.talkSub", { lang: tr(`parler.lang_${lang.id}`), level: pick.level.toUpperCase(), n: langs.length })}</small>
        <span className="dash-play-go">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
          {tr("dash.talk")}
        </span>
      </span>
    </a>
  );
}
