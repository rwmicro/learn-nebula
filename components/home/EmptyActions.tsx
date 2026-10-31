"use client";

import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { SCENES, type SceneKey } from "@/lib/deco-art";

/** Where to go from an empty review screen (nothing started, nothing saved):
 *  the decks, or a path whose notes end on questions to keep. `text` says
 *  why the screen is empty; `scene` draws one of lib/deco-art.ts's scenes
 *  above it (app.css moves it up with `order`) when the screen has none. */
export function EmptyActions({ text, scene }: { text?: string; scene?: SceneKey }) {
  const locale = useLocale();
  return (
    <>
      {scene && <div className="review-empty-scene deco" dangerouslySetInnerHTML={{ __html: SCENES[scene] }} />}
      {text && <p className="review-empty-text">{text}</p>}
      <div className="review-empty-actions">
        {/* Plain links, like the rest of /cartes/ (scripts/prune-rsc.mjs). */}
        <a className="review-empty-btn review-empty-btn--primary" href="/cartes/">
          {t("reviewEmpty.decks", undefined, locale)}
        </a>
        <a className="review-empty-btn" href="/parcours/">
          {t("reviewEmpty.path", undefined, locale)}
        </a>
      </div>
    </>
  );
}
