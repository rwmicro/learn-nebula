"use client";

import { useEffect, useState } from "react";
import { CircularGraph } from "@/components/explore/CircularGraph";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import type { GraphData } from "@/lib/graph-data";

/** The phone layer's breakpoint (global.css): the graph is not offered there. */
const PHONE = "(max-width: 639.98px)";

/** /graph/ fetches its data (/graph-data.json, lib/home-data.ts) instead of
 *  inlining it: 2.4 MB of RSC payload in the page before. The version query
 *  is the build's content hash, as on the home page.
 *
 *  Phones get no graph (every link to it is `.gk-wide-only`): someone who
 *  lands here anyway is sent on to the notes, and the data is never fetched. */
export function GraphLoader({ version }: { version: string }) {
  const locale = useLocale();
  const [data, setData] = useState<GraphData | null>(null);
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (window.matchMedia(PHONE).matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only check
      setPhone(true);
      return;
    }
    let cancelled = false;
    fetch(`/graph-data.json?v=${version}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: GraphData | null) => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [version]);
  if (phone) {
    return (
      <main className="graph-phone">
        <h1>{t("graph.phoneTitle", undefined, locale)}</h1>
        <p>{t("graph.phoneText", undefined, locale)}</p>
        <a className="graph-phone-link" href="/notes/">
          {t("graph.phoneLink", undefined, locale)}
        </a>
      </main>
    );
  }
  return data ? <CircularGraph data={data} /> : null;
}
