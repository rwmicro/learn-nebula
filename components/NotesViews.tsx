import { t } from "@/lib/i18n";

// The garden's other views as a row of small tiles at the top of the "Notes"
// tab (app/notes/page.tsx): what the Explorer tab used to hold. Server-side
// only; labels swap at runtime through data-i18n like the rest of the page.

const ic = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const VIEWS: {
  key: string;
  href: string;
  family: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "graph",
    href: "/graph/",
    family: "vivant",
    icon: (
      <svg viewBox="0 0 24 24" {...ic}>
        <circle cx="6" cy="7" r="2.2" />
        <circle cx="18" cy="6" r="2.2" />
        <circle cx="12" cy="17" r="2.5" />
        <path d="m7.8 8.5 3 6.4M16.7 7.7l-3.5 7.2M8.2 7l7.6-.8" />
      </svg>
    ),
  },
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
    key: "echecs",
    href: "/echecs/",
    family: "jeux",
    icon: (
      <svg viewBox="0 0 24 24" {...ic}>
        <path d="M8 21h8M9 21l.8-6h4.4l.8 6M9.5 15c-1-1.5-1.5-3-1-4.5L10 8h4l1.5 2.5c.5 1.5 0 3-1 4.5M10 8 9 5h6l-1 3M12 3v2" />
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

export function NotesViews() {
  return (
    <section className="nb-sec" aria-labelledby="nb-views-h">
      <h2 className="nb-h" id="nb-views-h" data-i18n="notesTab.views">
        {t("notesTab.views")}
      </h2>
      <ul className="nb-views">
        {VIEWS.map((v) => (
          <li key={v.key} data-family={v.family}>
            <a href={v.href} className="nb-view">
              <span className="nb-view-ic" aria-hidden="true">
                {v.icon}
              </span>
              <b data-i18n={`notesTab.view.${v.key}`}>
                {t(`notesTab.view.${v.key}`)}
              </b>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
