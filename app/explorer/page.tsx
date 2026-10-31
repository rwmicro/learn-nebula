import type { Metadata } from "next";
import { getAllPosts, INDEX_NOTE } from "@/lib/content";
import { t } from "@/lib/i18n";
import { SITE_TITLE } from "@/lib/site";

export const metadata: Metadata = {
  title: `${t("explorer.metaTitle")} · ${SITE_TITLE}`,
  description: t("explorer.lede"),
};

// "Explorer", the third tab of the phone tab bar (components/layout/MobileTabBar.tsx):
// the garden's other views (graph, timeline, map, themes, numbers, data, a
// random note) as big tiles, so a phone reaches them without the site menu.
// Desktop gets the same page; it is simply not in the desktop menu.

const ic = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const TILES: { key: string; href: string; family: string; icon: React.ReactNode }[] = [
  {
    key: "frise",
    href: "/frise/",
    family: "pensee",
    icon: (
      <svg viewBox="0 0 24 24" {...ic}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    key: "carte",
    href: "/carte/",
    family: "societe",
    icon: (
      <svg viewBox="0 0 24 24" {...ic}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
      </svg>
    ),
  },
  {
    key: "themes",
    href: "/themes/",
    family: "sciences",
    icon: (
      <svg viewBox="0 0 24 24" {...ic}>
        <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
      </svg>
    ),
  },
  {
    key: "jardin",
    href: "/jardin/",
    family: "arts",
    icon: (
      <svg viewBox="0 0 24 24" {...ic}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    key: "donnees",
    href: "/donnees/",
    family: "informatique",
    icon: (
      <svg viewBox="0 0 24 24" {...ic}>
        <ellipse cx="12" cy="5.5" rx="8" ry="2.5" />
        <path d="M4 5.5v13c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-13M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5" />
      </svg>
    ),
  },
  {
    key: "random",
    href: "/hasard/",
    family: "jeux",
    icon: (
      <svg viewBox="0 0 24 24" {...ic}>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <circle cx="8" cy="8" r="1.2" fill="currentColor" />
        <circle cx="16" cy="16" r="1.2" fill="currentColor" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      </svg>
    ),
  },
];

export default function ExplorerPage() {
  const notes = getAllPosts().filter((d) => d.rawPath !== INDEX_NOTE).length;
  const nf = new Intl.NumberFormat("fr-FR");
  return (
    <main id="main" className="app-page explorer">
      <header className="app-large-title">
        <h1 data-i18n="explorer.title">{t("explorer.title")}</h1>
        <p data-i18n="explorer.lede">{t("explorer.lede")}</p>
      </header>
      <ul className="explorer-grid">
        <li className="explorer-wide" data-family="vivant">
          <a href="/graph/" className="explorer-tile">
            <svg className="explorer-art" viewBox="0 0 190 160" aria-hidden="true">
              <path d="M95 80C60 60 40 30 10 20M95 80c40-20 60-50 90-55M95 80c-30 25-50 50-60 75M95 80c25 20 45 50 70 70M95 80c0-30 5-55 20-78" />
              <circle cx="95" cy="80" r="6" />
              <circle cx="10" cy="20" r="4" />
              <circle cx="185" cy="25" r="4" />
              <circle cx="35" cy="155" r="4" />
              <circle cx="165" cy="150" r="4" />
              <circle cx="115" cy="2" r="4" />
            </svg>
            <span className="explorer-text">
              <b data-i18n="explorer.graph">{t("explorer.graph")}</b>
              <small>
                {nf.format(notes)} · <span data-i18n="explorer.graphDesc">{t("explorer.graphDesc")}</span>
              </small>
            </span>
          </a>
        </li>
        {TILES.map((tile) => (
          <li key={tile.key} data-family={tile.family}>
            <a href={tile.href} className="explorer-tile">
              <span className="explorer-icon" aria-hidden="true">
                {tile.icon}
              </span>
              <span className="explorer-text">
                <b data-i18n={`explorer.${tile.key}`}>{t(`explorer.${tile.key}`)}</b>
                <small data-i18n={`explorer.${tile.key}Desc`}>{t(`explorer.${tile.key}Desc`)}</small>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
