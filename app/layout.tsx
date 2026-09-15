import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { SITE_TITLE, SITE_DESCRIPTION, SITE_URL, buildCSP } from "@/lib/site";
import { DEFAULT_LOCALE, LOCALES, getMessages, t } from "@/lib/i18n";
import { getLanguageScopes } from "@/lib/content";
import { Footer } from "@/components/Footer";
import { PinnedAssistant } from "@/components/PinnedAssistant";
import "../assets/css/fonts.css";
// Global frame only (Tailwind + @theme + html/body/main margins). Article
// typography lives in main.css, loaded per-route on note pages / 404.
import "../assets/css/global.css";

// Inline every message bundle so the runtime swap (/js/i18n.js) has them all
// available without a second fetch — built from LOCALES so a new language is
// picked up automatically. `<` is escaped to avoid a `</script>` break-out.
const I18N_BOOTSTRAP = `window.__i18n = {
  defaultLocale: ${JSON.stringify(DEFAULT_LOCALE)},
  bundles: ${JSON.stringify(Object.fromEntries(LOCALES.map((l) => [l, getMessages(l)]))).replace(/</g, "\\u003c")}
};
/* Shared helpers, defined synchronously so every afterInteractive module
   (audio.js, comments.js, translate.js…) can use them without
   redefining their own copy or racing /js/i18n.js. */
window.__i18n.escapeHtml = function (s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
};
window.__i18n.hash = function (s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
};
window.__i18n.getActiveLocale = function () {
  return window.__i18n.locale || window.__i18n.defaultLocale;
};`.replace(/<\/script/gi, "<\\/script");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  // Favicon/apple-touch icons are auto-detected from app/icon.png & app/apple-icon.png.
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fcfcfc",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={buildCSP()} />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        {/* Body font: preloaded so text paints in the real face sooner (the
            metric-matched fallback already prevents layout shift). */}
        <link
          rel="preload"
          href="/fonts/alegreya-normal-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:start-[0.6rem] focus:top-[0.6rem] focus:z-[2000] border border-[#111] bg-white px-4 py-2 [font-family:'Alegreya_Sans',sans-serif]"
          data-i18n="layout.skipLink"
        >
          {t("layout.skipLink")}
        </a>
        <script
          // Sync inline: must run before any vanilla module (audio.js, comments.js,
          // …) so they can read window.__i18n.t at load. Loader-blocking is fine
          // — the bundle is small (< 6 KB).
          dangerouslySetInnerHTML={{ __html: I18N_BOOTSTRAP }}
        />
        <Script src="/js/i18n.js" strategy="afterInteractive" />
        {children}
        <Footer />
        {/* Pinnable "Ask the garden" — hidden until pinned from the home chat,
            then docked bottom-right on every page (persists via localStorage).
            The language folders feed its retrieval-scope picker (read at build). */}
        <PinnedAssistant scopes={getLanguageScopes()} />
        {/* Site-wide enhancers. Note-page-only behaviours (TOC, audio, comments,
            the floating assistant, …) load per-route via <NoteScripts /> so the
            home page no longer pulls scripts it doesn't use. */}
        <Script src="/js/instantpage.js" strategy="afterInteractive" />
        <Script src="/js/lightbox.js" strategy="afterInteractive" />
        {/* Pronunciation clips (.pron-btn): notes render them via Markdown
            (![word](clip.mp3)) and /cartes decks via [sound:clip.mp3], so this
            loads everywhere rather than only through <NoteScripts />. */}
        <Script src="/js/pronounce.js" strategy="afterInteractive" />
        {/* Service worker: offline reading of visited notes + instant repeat
            loads. It never caches /api/*. */}
        <Script src="/js/sw-register.js" strategy="afterInteractive" />
        {/* Cloudflare Web Analytics (cookieless). Set NEXT_PUBLIC_CF_BEACON_TOKEN
            in the Pages env (from the Cloudflare dashboard) to enable it; unset
            in dev/local so no analytics are sent. */}
        {process.env.NEXT_PUBLIC_CF_BEACON_TOKEN && (
          <Script
            src="https://static.cloudflareinsights.com/beacon.min.js"
            strategy="afterInteractive"
            data-cf-beacon={`{"token": "${process.env.NEXT_PUBLIC_CF_BEACON_TOKEN}"}`}
          />
        )}
      </body>
    </html>
  );
}
