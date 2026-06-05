import type React from "react"
import "@/styles/globals.css"
import { GeistSans } from "geist/font/sans"
import FileTree from "@/components/tree"
import Header from "@/components/header"
import { ErrorBoundary } from "@/components/error-boundary"
import { ThemeProvider } from "@/components/theme-provider"
import { SkipLink } from "@/components/skip-link"
import { ReadingPrefsApplier } from "@/components/ReadingPrefs"
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration"
import "katex/dist/katex.min.css"
import type { Metadata, Viewport } from "next"

const siteConfig = {
  name: "Pensine - Garden of Knowledge",
  description:
    "Here you will find my garden of knowledge, a place where I share all the subjects I have mastered or am in the process of learning.",
  url: "https://pensine.nebula.li",
  author: "Martin",
  creator: "Martin",
  publisher: "Nebula",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
}

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [
    "pensine",
    "garden of knowledge",
    "knowledge base",
    "learning",
    "education",
    "notes",
    "documentation",
    "wiki",
  ],
  authors: [{ name: siteConfig.author }],
  creator: siteConfig.creator,
  publisher: siteConfig.publisher,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: ["fr_FR"],
    url: siteConfig.url,
    title: siteConfig.name,
    description: siteConfig.description,
    siteName: siteConfig.name,
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: siteConfig.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    site: "@pensine",
    creator: "@martin",
    images: ["/twitter-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [
      { rel: "mask-icon", url: "/favicon.svg", color: "#000000" },
    ],
  },
  manifest: "/site.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: siteConfig.name,
  },
  applicationName: siteConfig.name,
  referrer: "origin-when-cross-origin",
  category: "education",
  classification: "education",
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "msapplication-TileColor": "#000000",
    "msapplication-config": "/browserconfig.xml",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    author: {
      "@type": "Person",
      name: siteConfig.author,
    },
    publisher: {
      "@type": "Organization",
      name: siteConfig.publisher,
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteConfig.url}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  }

  return (
    <html lang="fr" className={GeistSans.className} suppressHydrationWarning>
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <link rel="canonical" href={siteConfig.url} />
        <link rel="preconnect" href="https://assets.nebula.li" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://assets.nebula.li" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="rating" content="general" />
        <meta name="apple-mobile-web-app-title" content="Pensine" />
      </head>
      <body className="bg-[var(--c-bg)] text-[var(--c-text-1)] h-dvh overflow-hidden flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <ReadingPrefsApplier />
          <ServiceWorkerRegistration />
          <ErrorBoundary>
            <SkipLink />
            <Header />
            <div className="flex flex-row w-full flex-1 overflow-hidden">
              <div className="hidden lg:block h-full">
                <FileTree hidePosibility={true} />
              </div>
              <main id="main-content" className="flex-1 h-full overflow-hidden">
                {children}
              </main>
            </div>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  )
}
