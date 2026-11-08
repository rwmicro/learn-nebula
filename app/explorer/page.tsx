import type { Metadata } from "next";
import { redirect } from "next/navigation";

// /explorer/ was the phone tab bar's third tab, the garden's other views as
// big tiles. Those views now open the Notes tab (components/explore/NotesViews.tsx)
// and the home's "Sommaire": the page had become a third copy of the same
// links, reachable from nowhere. Old links land on /notes/ (the static export
// writes a meta refresh).
export const metadata: Metadata = { robots: { index: false } };

export default function ExplorerPage() {
  redirect("/notes/");
}
