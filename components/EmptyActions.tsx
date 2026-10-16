"use client";

import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

/** Where to go from an empty review screen (nothing started, nothing saved):
 *  the decks, or a path whose notes end on questions to keep. `text` says
 *  why the screen is empty. Phones also show a cards icon above the title
 *  (app.css moves it up with `order`). */
export function EmptyActions({ text }: { text?: string }) {
  const locale = useLocale();
  return (
    <>
      <span className="review-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <rect x="4" y="7" width="12" height="13" rx="2" />
          <path d="M8 4h10a2 2 0 0 1 2 2v11" />
        </svg>
      </span>
      {text && <p className="review-empty-text">{text}</p>}
      <div className="review-empty-actions">
        {/* Plain links, like the rest of /cartes/ (scripts/prune-rsc.mjs). */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="review-empty-btn review-empty-btn--primary" href="/cartes/">
          {t("reviewEmpty.decks", undefined, locale)}
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="review-empty-btn" href="/parcours/">
          {t("reviewEmpty.path", undefined, locale)}
        </a>
      </div>
    </>
  );
}
