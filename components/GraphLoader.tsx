"use client";

import { useEffect, useState } from "react";
import { CircularGraph } from "@/components/CircularGraph";
import type { GraphData } from "@/lib/graph-data";

/** /graph/ fetches its data (/graph-data.json, lib/home-data.ts) instead of
 *  inlining it: 2.4 MB of RSC payload in the page before. The version query
 *  is the build's content hash, as on the home page. */
export function GraphLoader({ version }: { version: string }) {
  const [data, setData] = useState<GraphData | null>(null);
  useEffect(() => {
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
  return data ? <CircularGraph data={data} /> : null;
}
