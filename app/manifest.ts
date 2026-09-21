import type { MetadataRoute } from "next";
import { SITE_TITLE, SITE_DESCRIPTION } from "@/lib/site";

export const dynamic = "force-static";

// Web app manifest: enables a polished "add to home screen" on Android/Chrome
// (name, icons, colours). Next links it automatically as /manifest.webmanifest.
// iOS uses app/apple-icon.png; the <link rel="icon"> tags come from
// app/icon.png (32px, the tab) and app/icon1.png (192px, bookmarks and
// shortcuts) — a browser picks one by its `sizes`, so the tab no longer pulls a
// 512px painting down to paint sixteen pixels.
//
// Every icon here is a palettised PNG. The source is a photograph of an
// impressionist canvas, so a 256-colour palette sounds lossy, but dithered at
// these sizes it measures a mean error of 3/255 and is indistinguishable at 3x
// zoom — for a quarter of the bytes (the set went 2184 KB → 446 KB).
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
      // Maskable variant has padding so Android's circle/squircle mask never
      // clips the painting.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
