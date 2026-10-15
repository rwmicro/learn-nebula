"use client";

import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

/** Where to go from an empty review screen (nothing started, nothing saved):
 *  the decks, or a path whose notes end on questions to keep. */
export function EmptyActions() {
  const locale = useLocale();
  return (
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
  );
}
