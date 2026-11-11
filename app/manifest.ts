import type { MetadataRoute } from "next";
import { SITE_TITLE, SITE_DESCRIPTION } from "@/lib/site";

export const dynamic = "force-static";

// Web app manifest: enables a polished "add to home screen" on Android/Chrome
// (name, icons, colours). Next links it automatically as /manifest.webmanifest.
// iOS uses /apple-icon.png (full bleed: iOS rounds it itself); the
// <link rel="icon"> tags come from `metadata.icons` in app/layout.tsx (32px
// for the tab, light and dark, 192px for bookmarks) — a browser picks one by
// its `sizes`, so the tab never pulls a 512px image down to paint sixteen
// pixels.
//
// The logo is a linocut: an arch, a fern crosier, a sun, on paper. Every
// icon here is a palettised, dithered PNG: the paper grain survives 256
// colours, for a sixth of the bytes.
export default function manifest(): MetadataRoute.Manifest {
  return {
    // `id` pins the app's identity across deploys, so a later change to
    // start_url doesn't register as a different app.
    id: "/",
    name: SITE_TITLE,
    short_name: SITE_TITLE,
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    lang: "fr",
    categories: ["education", "books", "productivity"],
    display: "standalone",
    background_color: "#fcfcfc",
    theme_color: "#fcfcfc",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Maskable variant: full-bleed paper, the arch inside the 80% safe
      // circle so Android's circle/squircle mask never clips it.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Long press on the installed icon (Chrome on Android, Windows, macOS;
    // Safari on iOS ignores them). Android shows at most four. Icons are
    // drawn by scripts/build-pwa-icons.mjs.
    shortcuts: [
      {
        name: "Tout réviser",
        short_name: "Réviser",
        description: "Les cartes et questions à revoir aujourd’hui.",
        url: "/cartes/aujourdhui/",
        icons: [{ src: "/icons/raccourci-reviser.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "Parcours de lecture",
        short_name: "Parcours",
        description: "Des suites de notes à lire dans l’ordre.",
        url: "/parcours/",
        icons: [{ src: "/icons/raccourci-parcours.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "Parler une langue",
        short_name: "Parler",
        description: "Converser avec un partenaire à voix haute.",
        url: "/parler/",
        icons: [{ src: "/icons/raccourci-parler.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "Une note au hasard",
        short_name: "Au hasard",
        description: "Ouvrir une note tirée au sort.",
        url: "/hasard/",
        icons: [{ src: "/icons/raccourci-hasard.png", sizes: "96x96", type: "image/png" }],
      },
    ],
  };
}
