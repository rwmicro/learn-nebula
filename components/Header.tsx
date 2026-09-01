import { UnifrakturMaguntia } from "next/font/google";
import type { Doc } from "@/lib/content";
import { t } from "@/lib/i18n";
import { LangSwitcher } from "@/components/LangSwitcher";
import { EditionDate } from "@/components/EditionDate";

// Blackletter wordmark, à la New York Times. next/font self-hosts the file at
// build time (served from our origin), so `font-src 'self'` keeps holding and
// the rest of the page stays on Newsreader. Reserved for the masthead title.
const blackletter = UnifrakturMaguntia({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

const navLink =
  "text-black no-underline underline-offset-[3px] hover:bg-transparent hover:underline focus-visible:underline";

/** New-York-Times-style masthead in three tiers:
 *  1. utility bar — search · language "editions" · graph CTA
 *  2. masthead — dateline (left) · blackletter wordmark (center) · tagline (right)
 *  3. centered section nav between a hairline and a thick double rule.
 *  Black & white only; Tailwind + fluid type (text-micro/meta/wordmark). */
export default function Header({ doc }: { doc: Doc }) {
  // Build-time "edition" date; <EditionDate> localizes it to the active language.
  const editionIso = new Date().toISOString();

  return (
    <header className="relative mx-auto max-w-300 px-4 text-black @container">
      {/* Mobile-only hamburger (#13): on phones the masthead keeps only the
          wordmark; the language editions and the section nav collapse behind
          this toggle. CSS-only (a visually-hidden peer checkbox) so it works in
          the static export with no JS; peer-focus-visible surfaces a focus ring
          on the label since the real control is the sr-only checkbox. */}
      <input
        id="gk-menu"
        type="checkbox"
        className="peer sr-only"
        aria-label={t("nav.menu")}
      />
      <label
        htmlFor="gk-menu"
        className="absolute right-2 top-3 z-20 inline-flex cursor-pointer items-center justify-center rounded-[3px] p-1.5 text-black peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-black peer-checked:[&_.gk-ic-open]:hidden peer-checked:[&_.gk-ic-close]:block sm:hidden"
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" className="gk-ic-open">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" className="gk-ic-close hidden">
          <path d="M6 6l12 12M18 6l-12 12" />
        </svg>
      </label>

      {/* 1. utility bar: language "editions" — hidden on mobile until the
          hamburger is toggled, always shown from sm up. */}
      <div className="hidden py-2 text-center peer-checked:block sm:block">
        <LangSwitcher />
      </div>

      {/* 2. masthead: dateline · wordmark · tagline. On mobile the dateline is
          hidden, so collapse to a single centred column (otherwise the title
          lands in the empty left 1fr and reads off-centre). */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-4 py-4">
          <EditionDate
            iso={editionIso}
            // pr-4 keeps a gutter between the (left-aligned, wrapping) dateline
            // and the wordmark: on long days ("dimanche") the date used to fill
            // its column right up to the title. 1rem is the widest padding that
            // still fits "DIMANCHE" without breaking at the ≥640px column width.
            className="hidden sm:block sm:pr-4 text-micro uppercase tracking-[0.04em] text-[#787369]"
          />
          <a
            href="/"
            className="justify-self-center text-black no-underline hover:bg-transparent"
          >
            <h1
              className={`${blackletter.className} m-0 border-0 p-0 font-normal text-wordmark not-italic leading-[0.9] whitespace-nowrap`}
            >
              {doc.frontmatter.title}
            </h1>
          </a>
      </div>
      <div className="border-t-[1.5px] border-black" />
      <div className="mt-0.5 border-t-[1.5px] border-black" />
      
      {/* 3. section nav between a hairline and a thick double rule — also folded
          into the mobile hamburger (#13). */}
      <nav aria-label={t("home.footerNavAria")} className="hidden peer-checked:block sm:block">
        <ul className="m-0 flex list-none flex-wrap justify-center gap-x-7 gap-y-1 px-0 py-2 text-small font-semibold uppercase tracking-[0.08em] border-b border-neutral-200">
          <li className="m-0">
            <a href="/#applied-sciences" className={navLink} data-i18n="nav.appliedsciences">
              {t("nav.appliedsciences")}
            </a>
          </li>
          <li className="m-0">
           ·
          </li>
          <li className="m-0">
            <a href="/#social-sciences" className={navLink} data-i18n="nav.socialsciences">
              {t("nav.socialsciences")}
            </a>
          </li>
                    <li className="m-0">
           ·
          </li>
          <li className="m-0">
            <a href="/graph/" className={navLink} data-i18n="nav.graph">
              {t("nav.graph")}
            </a>
          </li>
        </ul>
      </nav>

    </header>
  );
}
