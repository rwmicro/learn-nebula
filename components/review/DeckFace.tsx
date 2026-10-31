"use client";

import { useMemo } from "react";
import { adaptDeckCss, adaptInlineStyles } from "@/lib/deck-css";
import { useDarkTheme } from "@/lib/use-dark";

/**
 * One face of an Anki card, in the site's type and theme. The deck's own CSS
 * and the card's inline styles are rewritten by lib/deck-css.ts to apply
 * inside this wrapper only (the CSS used to be injected over the whole page)
 * and to give up the card's frame, fonts and greys to the site. In dark mode the wrapper and the card carry
 * Anki's night-mode classes, so decks that ship a dark theme use it.
 * Shared by the deck page's browse mode (Flashcards.tsx) and every review
 * session (ReviewSession.tsx). Card HTML is the site's own build output
 * (scripts/build-anki.mjs sanitizes it).
 */
export function DeckFace({
  slug,
  css,
  html,
  zoom = 1,
  faceRef,
}: {
  slug: string;
  css: string;
  html: string;
  zoom?: number;
  faceRef?: React.Ref<HTMLDivElement>;
}) {
  const dark = useDarkTheme();
  const scoped = useMemo(() => (css ? adaptDeckCss(css, `[data-deck-scope="${cssString(slug)}"]`) : ""), [css, slug]);
  const face = useMemo(() => adaptInlineStyles(html), [html]);
  const night = dark ? " night_mode nightMode" : "";
  return (
    <div className={`deck-scope${night}`} data-deck-scope={slug}>
      {scoped && <style dangerouslySetInnerHTML={{ __html: scoped }} />}
      <div
        ref={faceRef}
        className={`card${night} [&_.pron]:mt-3`}
        style={zoom !== 1 ? { zoom } : undefined}
        dangerouslySetInnerHTML={{ __html: face }}
      />
    </div>
  );
}

/** A slug inside a quoted CSS attribute selector (slugs are [a-z0-9-], but
 *  the selector must never break out of its quotes). */
function cssString(s: string): string {
  return s.replace(/["\\\n]/g, "");
}
