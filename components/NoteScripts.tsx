import Script from "next/script";

/**
 * Vanilla enhancers that only make sense on a note page (they hook into elements
 * SinglePage renders: TOC, audio button, text-size / wide-text toggles, the
 * translate menu, the slide-in aside, the sticky header, and the comments form
 * + Turnstile). Loaded here instead of in the root layout so the home and graph
 * routes don't pull them.
 *
 * These remain plain JS for now (they manipulate the Markdown-rendered article
 * DOM, drag/position UI, etc.); they're the "impossible without rework" cases.
 */
export function NoteScripts() {
  return (
    <>
      {/* Single bundle of the note enhancers (toc, audio, font-size, wide-text,
          translate, aside-toggle, sticky-header, reading-state, mermaid-render, widgets-loader, scroll-focus, related,
          comments, youtube, popover, copy-links, selection-menu), generated
          by scripts/bundle-js.mjs. quiz / glossary: <NoteFeatureScripts>. */}
      <Script src="/js/note.bundle.js" strategy="afterInteractive" />
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        defer
      />
    </>
  );
}

/**
 * The note enhancers only some notes need, each its own small bundle
 * (scripts/bundle-js.mjs): quiz.js for `[!quiz]` cards, glossary.js for the
 * glossary marks. SinglePage knows at build time whether the note has any
 * (renderMarkdown's hasQuiz / hasGlossary), so a note with neither downloads neither.
 */
export function NoteFeatureScripts({
  quiz,
  glossary,
}: {
  quiz: boolean;
  glossary: boolean;
}) {
  return (
    <>
      {quiz && <Script src="/js/quiz.bundle.js" strategy="afterInteractive" />}
      {glossary && (
        <Script src="/js/glossary.bundle.js" strategy="afterInteractive" />
      )}
    </>
  );
}
