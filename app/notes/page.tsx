import type { Metadata } from "next";
import { getAllPosts, INDEX_NOTE } from "@/lib/content";
import { getTopFolders } from "@/lib/notes-browse";
import { t } from "@/lib/i18n";
import { SITE_TITLE } from "@/lib/site";
import { FolderRows, ResumeFolder } from "@/components/NotesBrowse";
import { NotesViews } from "@/components/NotesViews";
import "@/assets/css/notes-browse.css";

export const metadata: Metadata = {
  title: `${t("notesTab.title")} · ${SITE_TITLE}`,
  description: t("notesTab.metaDesc"),
};

// "Notes", the third tab of the phone tab bar (components/MobileTabBar.tsx):
// the garden's other views in a row of tiles (what the Explorer tab held),
// the last folder opened, then the disciplines of the two top groups. Each
// row opens /notes/<folder>/ (app/notes/[...path]/page.tsx), and so on down
// to the notes. Desktop gets the same pages; its home keeps the full tree.

export default function NotesPage() {
  const notes = getAllPosts().filter((d) => d.rawPath !== INDEX_NOTE).length;
  const nf = new Intl.NumberFormat("fr-FR");
  return (
    <main id="main" className="app-page nb">
      <header className="app-large-title">
        <h1 data-i18n="notesTab.title">{t("notesTab.title")}</h1>
        <p
          data-i18n="notesTab.lede"
          data-i18n-vars={JSON.stringify({ n: nf.format(notes) })}
        >
          {t("notesTab.lede", { n: nf.format(notes) })}
        </p>
      </header>
      <button
        type="button"
        className="nb-search"
        data-palette-open
        aria-haspopup="dialog"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <span data-i18n="notesTab.search">{t("notesTab.search")}</span>
      </button>
      <NotesViews />
      <ResumeFolder />
      {getTopFolders().map((top) => (
        <section key={top.slug} className="nb-sec">
          <h2 className="nb-h">
            {top.key ? <span data-i18n={top.key}>{t(top.key)}</span> : top.name}
          </h2>
          <FolderRows rows={top.folders} />
        </section>
      ))}
    </main>
  );
}
