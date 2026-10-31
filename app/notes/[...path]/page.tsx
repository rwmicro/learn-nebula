import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFolderPages, type FolderRef } from "@/lib/notes-browse";
import { splitRank } from "@/lib/folder-label";
import { t } from "@/lib/i18n";
import { SITE_TITLE } from "@/lib/site";
import { FolderRows, NoteRows, RememberFolder } from "@/components/explore/NotesBrowse";
import "@/assets/css/notes-browse.css";

// One folder of the "Notes" tab (see app/notes/page.tsx): a back link to its
// parent, the reading paths that live in it, its sub-folders, then its own
// notes in folder order with their reading time and state.

type Params = { params: Promise<{ path: string[] }> };

export function generateStaticParams() {
  const slugs = [...getFolderPages().keys()];
  // `output: "export"` refuses a dynamic route with no params (an empty
  // content/posts): one placeholder that renders as a 404, as /cartes/ does.
  return slugs.length
    ? slugs.map((s) => ({ path: s.split("/") }))
    : [{ path: ["_"] }];
}

function find(path: string[]) {
  return getFolderPages().get(path.map(decodeURIComponent).join("/"));
}

/** A folder's name: its translation when it has one, else its on-disk name
 *  without the "01-" order prefix. */
function Name({ f }: { f: FolderRef }) {
  if (f.key) return <span data-i18n={f.key}>{t(f.key)}</span>;
  return <>{splitRank(f.name).label}</>;
}
function plainName(f: FolderRef): string {
  return f.key ? t(f.key) : splitRank(f.name).label;
}

function Count({ n }: { n: number }) {
  const key = n === 1 ? "notesTab.countOne" : "notesTab.count";
  return (
    <span data-i18n={key} data-i18n-vars={JSON.stringify({ n })}>
      {t(key, { n })}
    </span>
  );
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const f = find((await params).path);
  return {
    title: `${f ? plainName(f) : t("notesTab.title")} · ${SITE_TITLE}`,
    // A list of links to notes that are indexed themselves.
    robots: { index: false },
  };
}

export default async function FolderPage({ params }: Params) {
  const f = find((await params).path);
  if (!f) notFound();
  const parent = f.crumbs[f.crumbs.length - 1];
  const sub = f.folders.length;
  const trail = f.crumbs.slice(1).map(plainName).join(" › ");
  return (
    <main id="main" className="app-page nb" data-family={f.family ?? undefined}>
      <a
        className="nb-back"
        href={parent ? `/notes/${parent.slug}/` : "/notes/"}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m15 5-7 7 7 7" />
        </svg>
        {parent ? (
          <Name f={parent} />
        ) : (
          <span data-i18n="notesTab.title">{t("notesTab.title")}</span>
        )}
      </a>
      <header className="app-large-title">
        <h1>
          <Name f={f} />
        </h1>
        <p>
          <Count n={f.count} />
          {sub > 1 && (
            <>
              {" · "}
              <span
                data-i18n="notesTab.folders"
                data-i18n-vars={JSON.stringify({ n: sub })}
              >
                {t("notesTab.folders", { n: sub })}
              </span>
            </>
          )}
        </p>
      </header>

      {f.paths.length > 0 && (
        <ul className="nb-paths">
          {f.paths.slice(0, 3).map((p) => (
            <li key={p.slug}>
              <a href={`/parcours/${p.slug}/`} className="nb-path">
                <span className="nb-path-tx">
                  <small data-i18n="notesTab.path">{t("notesTab.path")}</small>
                  <b>{p.name}</b>
                  <Count n={p.count} />
                </span>
                <span className="nb-play" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M8 5.5v13l10.5-6.5Z" />
                  </svg>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {sub > 0 && (
        <section className="nb-sec">
          {f.notes.length > 0 && (
            <h2 className="nb-h" data-i18n="notesTab.subfolders">
              {t("notesTab.subfolders")}
            </h2>
          )}
          <FolderRows rows={f.folders} />
        </section>
      )}
      {f.notes.length > 0 && (
        <section className="nb-sec">
          {sub > 0 && (
            <h2 className="nb-h" data-i18n="notesTab.here">
              {t("notesTab.here")}
            </h2>
          )}
          <NoteRows notes={f.notes} />
        </section>
      )}
      <RememberFolder
        slug={f.slug}
        name={plainName(f)}
        trail={trail}
        family={f.family}
      />
    </main>
  );
}
