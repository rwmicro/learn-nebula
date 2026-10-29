"use client";

import { usePathname } from "next/navigation";

/** The menu's links, with the current section marked (aria-current). A note
 *  page counts as no section; /parcours/x/ counts as Parcours. */
export function SiteNavLinks({
  links,
}: {
  links: { href: string; key: string; label: string }[];
}) {
  const norm = (p: string) => (p.endsWith("/") ? p : `${p}/`);
  const path = norm(usePathname() ?? "/");
  // A tab stays lit on the pages it leads to, as on the phone's tab bar:
  // a note, the graph and the timeline are under Notes; Défis and the
  // account under Moi.
  const ALSO: Record<string, string[]> = {
    "/notes/": ["/posts/", "/graph/", "/frise/", "/themes/", "/jardin/"],
    "/progression/": ["/defis/", "/compte/"],
  };
  const here = (href: string) =>
    href === "/" ? path === "/" : [href, ...(ALSO[href] ?? [])].some((h) => path.startsWith(norm(h)));
  return (
    <ul>
      {links.map((l) => (
        <li key={l.href}>
          <a href={l.href} data-i18n={l.key} aria-current={here(l.href) ? "page" : undefined}>
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
