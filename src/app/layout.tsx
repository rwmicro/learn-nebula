import { getTreeData } from "@/lib/treeData"
import "../styles/globals.css"
import { GeistSans } from "geist/font/sans"
import FileTree from "@/components/Tree"
import Header from "@/components/Header"
import "katex/dist/katex.min.css"

export const metadata = {
  metadataBase: new URL("https://pensine.nebula.li"),
  title: "Pensine - Garden of Knowledge",
  description:
    "Here you will find my garden of knowledge, a place where I share all the subjects I have mastered or am in the process of learning.",
  openGraph: {
    images: ["/open-graph-image.jpg"],
  },
  twitter: {
    images: ["/twitter-image.jpg"],
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const treeData = await getTreeData()

  return (
    <html lang="en" className={GeistSans.className}>
      <head>
        <meta name="generator" content="Next.js" />
        <meta name="application-name" content="Pensine" />
        <meta name="referrer" content="origin-when-cross-origin" />
        <meta name="rating" content="general" />
        <meta name="author" content="Martin" />
        <meta name="creator" content="Martin" />
        <meta name="publisher" content="Nebula" />
        <meta
          name="format-detection"
          content="email=no, address=no, telephone=no"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="robots" content="all" />
        <link rel="canonical" href="https://pensine.nebula.li" />
        <meta property="og:title" content="Pensine - Garden of Knowledge" />
        <meta
          property="og:description"
          content="Here you will find my garden of knowledge, a place where I share all the subjects I have mastered or am in the process of learning."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://pensine.nebula.li" />
        <meta
          property="og:image"
          content="https://pensine.nebula.li/opengraph-image.png"
        />
        <meta property="og:site_name" content="Pensine - Garden of Knowledge" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:locale" content="fr_FR" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Pensine - Garden of Knowledge" />
        <meta
          name="twitter:description"
          content="Here you will find my garden of knowledge, a place where I share all the subjects I have mastered or am in the process of learning."
        />
        <meta
          name="twitter:image"
          content="https://pensine.nebula.li/twitter-image.png"
        />
        <meta name="twitter:site" content="@pensine" />
        <meta name="twitter:creator" content="@martin" />
      </head>
      <body>
        <Header />
        <div className="flex flex-row w-full">
          <div className="hidden xl:block h-screen max-h-[93vh]">
            <FileTree tree={treeData} hidePosibility={true} />
          </div>
          {children}
        </div>
      </body>
    </html>
  )
}
