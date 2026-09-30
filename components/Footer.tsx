import { AUTHOR, ORIGINAL_AUTHOR, ORIGINAL_AUTHOR_URL } from "@/lib/site";

// Single site-wide footer, identical on the home page and note pages.
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer
      data-pagefind-ignore
      className="mt-10 border-t border-rule-strong pt-4 pb-4 xl:pb-0 text-small leading-relaxed text-ink-2 [container-type:inline-size]"
    >
      <div className="flex flex-col gap-3 min-[480px]:flex-row min-[480px]:items-start min-[480px]:gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="h-auto w-[5.25rem] shrink-0"
          src="/images/license.png"
          alt="Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License."
          width={88}
          height={31}
        />
        <div className="space-y-1">
          <p className="m-0">
            Copyright {year} · {AUTHOR}
          </p>
          {/* Prose links: `.footer-prose a` (global.css) gives them a persistent
              underline so they're distinguishable without colour (WCAG 1.4.1) —
              done in plain CSS, not a Tailwind utility, because the note-page
              `a { text-decoration: none }` (unlayered) would otherwise win. */}
          <p className="footer-prose m-0">
            Unless otherwise noted, site content is licensed under a{" "}
            <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">
              Creative Commons license
            </a>
            , and the source code under the{" "}
            <a href="https://www.gnu.org/licenses/gpl-3.0.html">GNU GPL</a>.
            Originally designed by{" "}
            <a href={ORIGINAL_AUTHOR_URL}>{ORIGINAL_AUTHOR}</a>.
          </p>
        </div>
      </div>
    </footer>
  );
}
