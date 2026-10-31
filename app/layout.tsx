import type { Metadata, Viewport } from "next";
import Script from "next/script";
import {
  SITE_TITLE,
  SITE_DESCRIPTION,
  SITE_URL,
  FEED_ALTERNATES,
  buildCSP,
} from "@/lib/site";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { i18nAssetUrls } from "@/lib/i18n-assets";
import { jsAsset } from "@/lib/js-assets";
import { getLanguageScopes } from "@/lib/content";
import { notesIndexVersion, paletteExtraVersion } from "@/lib/home-data";
import { Footer } from "@/components/layout/Footer";
import { GardenChat } from "@/components/chat/GardenChat";
import { SiteBar } from "@/components/layout/SiteBar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import "../assets/css/fonts.css";
// Global frame only (Tailwind + @theme + html/body/main margins). Article
// typography lives in main.css, loaded per-route on note pages / 404.
import "../assets/css/global.css";
// Command palette + its trigger buttons, and the view-transition rules.
import "../assets/css/palette.css";
// Phone "app" layer: the glass tab bar, the sticky top bar, safe areas and
// the shared phone components (large titles, tiles).
import "../assets/css/phone";
import "../assets/css/chat.css";

// Message bundles are static files (/i18n/<locale>.<hash>.js, lib/i18n-assets.ts)
// cached for a year, not inlined: inlining all five cost ~220 KB per page, twice
// (Next repeats inline scripts in the RSC payload). This small bootstrap writes
// blocking <script> tags for the default bundle and, if the reader picked
// another language, that one too — so every vanilla module (audio.js,
// comments.js…) still finds window.__i18n.t's strings at load, in order. Same-
// origin document.write during parsing is allowed and keeps them blocking.
const I18N_BOOTSTRAP = `window.__i18n = window.__i18n || { bundles: {} };
window.__i18n.defaultLocale = ${JSON.stringify(DEFAULT_LOCALE)};
window.__i18n.assets = ${JSON.stringify(i18nAssetUrls())};
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
};
(function () {
  var i = window.__i18n, a = i.assets, l = null;
  try { l = localStorage.getItem("locale"); } catch (e) {}
  document.write('<script src="' + a[i.defaultLocale] + '"><\\/script>');
  if (l && l !== i.defaultLocale && a[l]) document.write('<script src="' + a[l] + '"><\\/script>');
})();`;

// Applies the reader's stored theme (/js/theme.js) before first paint, so a
// pinned dark theme never flashes light (or the reverse). No stored choice =
// no attribute, and global.css follows prefers-color-scheme.
const THEME_BOOTSTRAP = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

// Cross-document view transitions (palette.css opts in with @view-transition):
// a note title clicked in a list (home, /themes/, /parcours/) morphs into the
// note's H1, which carries view-transition-name "note-title" (note-paths.css).
// The name goes on the clicked link only, in `pageswap`, right before the old
// page is captured: a list holds the same note twice (recent notes + tree), and
// two elements with one name would abort the transition. Coming back, the
// `pagereveal` side names the link to the note we came from, if it is on
// screen. Note → note navigations leave both H1s to morph into each other.
// Inline in <head> because `pagereveal` fires before the first frame, before
// any deferred script runs; a no-op where the API doesn't exist.
const VIEW_TRANSITIONS = `(function(){
if(!("onpagereveal" in window))return;
var N="note-title",last=null;
function path(u){try{var x=new URL(u,location.href);return x.origin===location.origin?x.pathname:null}catch(e){return null}}
function name(el){if(el.getClientRects().length>1)el.style.display="inline-block";el.style.viewTransitionName=N}
function unname(el){el.style.viewTransitionName="";el.style.display=""}
function onNote(){return location.pathname.indexOf("/posts/")===0}
addEventListener("click",function(e){last=e.target&&e.target.closest?e.target.closest("a[href]"):null},true);
addEventListener("pageswap",function(e){
if(!e.viewTransition||onNote())return;
var to=e.activation&&e.activation.entry&&path(e.activation.entry.url);
if(!to||to.indexOf("/posts/")!==0||!last||path(last.href)!==to)return;
name(last);
});
addEventListener("pagereveal",function(e){
if(!e.viewTransition||onNote())return;
var a=window.navigation&&navigation.activation;
var from=a&&a.from&&path(a.from.url);
if(!from||from.indexOf("/posts/")!==0)return;
var h=innerHeight,links=document.querySelectorAll('a[href="'+from.replace(/["\\\\]/g,"")+'"]');
for(var i=0;i<links.length;i++){var r=links[i].getBoundingClientRect();
if(r.width&&r.bottom>0&&r.top<h){var el=links[i];name(el);
e.viewTransition.finished.finally(function(){unname(el)});return}}
});
addEventListener("pageshow",function(e){if(e.persisted&&last)unname(last)});
})();`;

// Speculation rules (Chromium): prerender a same-site page the moment the
// reader shows intent, so the click finds it already laid out. `moderate` is
// a 200 ms hover on a desktop; on a phone (Chrome, since mid-2025) it is the prominent
// link nearest the last touch once scrolling has settled. Chrome keeps at most
// two of these alive (oldest dropped first), so the Pi serves one or two
// extra pages per visit — instant.page, which this replaces, prerendered
// every link that scrolled into view, up to ten at once.
// Left out: the API and anything stateful or live (account, admin, duel's
// WebSocket, /hasard/'s random pick), links with a query, downloads and new
// tabs. Firefox and Safari ignore the block; public/js/sw-register.js warms
// their next page through the service worker instead.
const SPECULATION_RULES = JSON.stringify({
  prerender: [
    {
      where: {
        and: [
          { href_matches: "/*" },
          { not: { href_matches: ["/api/*", "/admin/*", "/compte/*", "/duel/*", "/hasard/*"] } },
          { not: { selector_matches: "[data-no-instant], [download], [target=_blank], [href*='?'], [rel~=nofollow]" } },
        ],
      },
      eagerness: "moderate",
    },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  // Feed autodiscovery (<link rel="alternate" type="application/rss+xml">)
  // for app/feed.xml; lib/seo.ts repeats it for pages with a canonical URL.
  alternates: { types: FEED_ALTERNATES },
  // The linocut arch: E2-a on paper for light, the night version for a dark
  // OS (the tab follows the system, not the in-page toggle). Declared here
  // rather than as app/icon.png, which can't carry a `media` query. The
  // 192px one serves bookmarks and shortcuts; /favicon.ico (16-48px) is the
  // fallback for whatever asks for it by name.
  icons: {
    icon: [
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-dark-32.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Added to the home screen, the site opens full screen like an app. The
  // "default" status bar keeps its own strip, coloured by theme-color, so
  // the page never slides under it ("black-translucent" would force white
  // text, unreadable on the light theme).
  appleWebApp: { capable: true, title: SITE_TITLE, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lay the page under the notch and the home indicator; app.css keeps the
  // content clear of them with env(safe-area-inset-*).
  viewportFit: "cover",
  // Browser chrome follows the OS scheme (the explicit toggle can't reach it
  // without JS; the two values are global.css's --paper).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfc" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1b19" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: THEME_BOOTSTRAP sets data-theme before React
    // hydrates, which is the point.
    <html lang="fr" suppressHydrationWarning>
      <head>
        <meta httpEquiv="Content-Security-Policy" content={buildCSP({ meta: true })} />
        {/* Blocking and first in <head> on purpose: must run before the body
            paints. Covered by the CSP's script-src 'unsafe-inline'. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <script dangerouslySetInnerHTML={{ __html: VIEW_TRANSITIONS }} />
        <script type="speculationrules" dangerouslySetInnerHTML={{ __html: SPECULATION_RULES }} />
        {/* Sync, in <head>: must run before any vanilla module (audio.js,
            comments.js, …) so they can read window.__i18n.t at load. It only
            writes the tags for the cached bundle files (see I18N_BOOTSTRAP). */}
        <script dangerouslySetInnerHTML={{ __html: I18N_BOOTSTRAP }} />
        {/* Content hash of /notes-index.json for the command palette's lazy
            fetch (?v=), so a new build never reads a cached old list. */}
        <meta name="gk-notes-index" content={notesIndexVersion()} />
        <meta name="gk-palette-extra" content={paletteExtraVersion()} />
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
          className="sr-only focus:not-sr-only focus:absolute focus:start-[0.6rem] focus:top-[0.6rem] focus:z-[2000] border border-ink bg-paper px-4 py-2 [font-family:'Alegreya_Sans',sans-serif]"
          data-i18n="layout.skipLink"
          data-pagefind-ignore=""
        >
          {t("layout.skipLink")}
        </a>
        {/* First of the deferred scripts, so it catches the others' errors. */}
        <Script src={jsAsset("error-beacon.js")} strategy="afterInteractive" />
        <Script src={jsAsset("i18n.js")} strategy="afterInteractive" />
        <SiteBar />
        {children}
        <Footer />
        <MobileTabBar />
        {/* Pinnable "Ask the garden" — hidden until pinned from the home chat,
            then docked bottom-right on every page (persists via localStorage).
            The language folders feed its retrieval-scope picker (read at build). */}
        <GardenChat scopes={getLanguageScopes()} />
        {/* Site-wide enhancers. Note-page-only behaviours (TOC, audio, comments,
            the floating assistant, …) load per-route via <NoteScripts /> so the
            home page no longer pulls scripts it doesn't use. */}
        <Script src={jsAsset("lightbox.js")} strategy="afterInteractive" />
        {/* Theme toggle buttons (masthead + note nav); the palette itself is CSS. */}
        <Script src={jsAsset("theme.js")} strategy="afterInteractive" />
        {/* Command palette (⌘K / Ctrl+K, "/"): built on first open; bundled
            with lib/palette-match.ts by scripts/bundle-js.mjs. */}
        <Script src={jsAsset("palette.bundle.js")} strategy="afterInteractive" />
        {/* Pronunciation clips (.pron-btn): notes render them via Markdown
            (![word](clip.mp3)) and /cartes decks via [sound:clip.mp3]. The
            loader is site-wide and tiny; it fetches /js/pronounce.bundle.js only
            once a clip is on the page. */}
        <Script src={jsAsset("pronounce-loader.js")} strategy="afterInteractive" />
        {/* Service worker: offline reading of visited notes + instant repeat
            loads. It never caches /api/*. */}
        <Script src={jsAsset("sw-register.js")} strategy="afterInteractive" />
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
