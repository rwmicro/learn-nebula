import type { Metadata } from "next";
import { ChessPlay } from "@/components/play/ChessPlay";
import { AppBack } from "@/components/layout/AppBack";
import { getAllPosts } from "@/lib/content";
import { CHESS_NOTES, type ChessTopic } from "@/lib/chess-play";
import { t } from "@/lib/i18n";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/echecs.css";
import { PageHeader } from "@/components/ui/PageHeader";

// A game against Stockfish, the reader's Elo and a review that points each
// mistake to a chess note of the vault. Only the notes that exist at build
// are linked, so a renamed note drops its link rather than a 404.
export const metadata: Metadata = {
  title: `Jouer aux échecs · ${SITE_TITLE}`,
  description: "Une partie contre Stockfish, à votre niveau, puis la revue de vos erreurs avec la note qui en parle.",
};

export default function EchecsPage() {
  const posts = new Map(getAllPosts().map((d) => [d.slug, d.frontmatter.title]));
  const notes: Partial<Record<ChessTopic, { href: string; title: string }>> = {};
  for (const [topic, slug] of Object.entries(CHESS_NOTES) as [ChessTopic, string][]) {
    const title = posts.get(slug);
    if (title) notes[topic] = { href: `/posts/${slug}/`, title };
  }
  return (
    <main id="main" className="echecs">
      <PageHeader
        name="echecs"
        back={{ href: "/notes/", labelKey: "tabbar.notes" }}
        title={t("chess.title")}
        titleProps={{ "data-i18n": "chess.title" }}
      />
      <ChessPlay notes={notes} />
    </main>
  );
}
