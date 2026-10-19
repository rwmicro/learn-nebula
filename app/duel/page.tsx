import type { Metadata } from "next";
import { Duel } from "@/components/Duel";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/duel.css";

// noindex: a private two-player room (the code is in the hash), empty for a
// crawler. Reached from a note's "Défier quelqu'un" / "Lancer un tandem".
export const metadata: Metadata = {
  title: `À deux · ${SITE_TITLE}`,
  description: "Un duel de révision ou un tandem de langue, en direct avec quelqu'un que tu invites.",
  robots: { index: false },
};

export default function DuelPage() {
  return <Duel />;
}
