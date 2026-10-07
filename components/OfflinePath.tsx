"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

/** Cache the service worker keeps for good (public/sw.js never trims it). */
const SAVED_CACHE = "gk-saved";

/**
 * "Disponible hors ligne" on a reading path: puts the path page and every one
 * of its notes in the service worker's keep-forever cache, so the whole path
 * reads on a train with no network. The pages' scripts and styles are shared
 * site-wide and already cached by any visit; images inside notes are fetched
 * only when seen online. A second click removes the copies.
 */
export function OfflinePath({ slug, hrefs }: { slug: string; hrefs: string[] }) {
  const locale = useLocale();
  const [state, setState] = useState<"" | "busy" | "saved" | "unsupported">("");
  const [done, setDone] = useState(0);
  const urls = [`/parcours/${encodeURIComponent(slug)}/`, ...hrefs];

  useEffect(() => {
    if (typeof caches === "undefined" || !("serviceWorker" in navigator)) {
      setState("unsupported");
      return;
    }
    void caches
      .open(SAVED_CACHE)
      .then((c) => Promise.all(urls.map((u) => c.match(u))))
      .then((hits) => hits.every(Boolean) && setState("saved"))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (state === "unsupported") return null;

  async function save() {
    setState("busy");
    setDone(0);
    try {
      const c = await caches.open(SAVED_CACHE);
      let n = 0;
      // A few at a time: kind to the server and to a phone on a weak network.
      for (let i = 0; i < urls.length; i += 4) {
        await Promise.all(
          urls.slice(i, i + 4).map(async (u) => {
            try {
              const r = await fetch(u, { cache: "no-cache" });
              if (r.ok) await c.put(u, r);
            } catch {
              /* one missing note doesn't stop the rest */
            }
            setDone(++n);
          }),
        );
      }
      setState("saved");
    } catch {
      setState("");
    }
  }
  async function drop() {
    const c = await caches.open(SAVED_CACHE);
    await Promise.all(urls.map((u) => c.delete(u)));
    setState("");
  }

  return (
    <p className="offline-path">
      {state === "saved" ? (
        <>
          <span className="offline-path-ok">{t("offline.saved", { n: urls.length - 1 }, locale)}</span>{" "}
          <button type="button" className="offline-path-btn" onClick={() => void drop()}>
            {t("offline.remove", undefined, locale)}
          </button>
        </>
      ) : (
        <button type="button" className="offline-path-btn" disabled={state === "busy"} onClick={() => void save()}>
          {state === "busy"
            ? t("offline.saving", { n: done, total: urls.length }, locale)
            : t("offline.save", undefined, locale)}
        </button>
      )}
    </p>
  );
}
