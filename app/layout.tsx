import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { SITE_TITLE, SITE_DESCRIPTION, SITE_URL, buildCSP } from "@/lib/site";
import { Footer } from "@/components/Footer";
import "../assets/css/fonts.css";
import "../assets/css/main.css";
import "../assets/css/syntax.css";

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
        <a href="#main" className="skip-link">
          Aller au contenu
        </a>
        {children}
        <Footer />
        <Script src="/js/instantpage.js" strategy="afterInteractive" />
        <Script src="/js/lightbox.js" strategy="afterInteractive" />
        <Script src="/js/toc.js" strategy="afterInteractive" />
        <Script src="/js/ask.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
