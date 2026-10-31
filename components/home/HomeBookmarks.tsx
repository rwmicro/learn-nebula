"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { listBookmarks, loadBookmarks, BOOKMARKS_KEY } from "@/lib/personal";

/** Home: the latest notes kept "à lire plus tard" (lib/personal.ts), next to
 *  "Reprendre". Nothing when the list is empty. */
export function HomeBookmarks() {
  const locale = useLocale();
  const [list, setList] = useState<ReturnType<typeof listBookmarks>>([]);
  useEffect(() => {
    const load = () => setList(listBookmarks(loadBookmarks()));
    load();
    const onStorage = (e: StorageEvent) => e.key === BOOKMARKS_KEY && load();
    window.addEventListener("storage", onStorage);
    window.addEventListener("gk:progress-synced", load);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("gk:progress-synced", load);
    };
  }, []);
  if (!list.length) return null;
  const shown = list.slice(0, 5);
  return (
    <div data-pagefind-ignore className="home-bookmarks mb-10 flex flex-wrap items-baseline gap-x-3 gap-y-2">
      <span className="text-micro font-semibold uppercase tracking-[0.1em] text-muted-warm">
        {t("marks.bookmarksTitle", undefined, locale)}
      </span>
      {shown.map((b) => (
        <a
          key={b.slug}
          href={`/posts/${b.slug.split("/").map(encodeURIComponent).join("/")}/`}
          className="rounded-full border border-rule-strong px-3 py-0.5 text-small text-ink no-underline hover:border-ink hover:bg-wash"
        >
          {b.title}
        </a>
      ))}
      {list.length > shown.length && (
        <a href="/progression/" className="text-small text-link">
          {t("marks.more", { n: list.length - shown.length }, locale)}
        </a>
      )}
    </div>
  );
}
