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
  const here = (href: string) => (href === "/" ? path === "/" : path.startsWith(norm(href)));
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
