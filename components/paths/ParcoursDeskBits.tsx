"use client";

import { useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { CHANGE_EVENT, loadStore, type ReadingStore } from "@/lib/reading-progress";
import { fold } from "@/lib/palette-match";
import type { PathFamily } from "@/lib/path-family";

// The desktop /parcours/'s small client parts (components/paths/ParcoursDesk.tsx
// renders the page): the reader's progress laid on the cards and the lines,
// the filter bar, "see the others" and the dice.

/** The reading store, kept in sync with other tabs and bfcache restores. */
export function useStore(): ReadingStore {
  const [store, setStore] = useState<ReadingStore>({});
  useEffect(() => {
    const load = () => setStore(loadStore());
    load();
    window.addEventListener("storage", load);
    window.addEventListener("pageshow", load);
    window.addEventListener(CHANGE_EVENT, load);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener("pageshow", load);
      window.removeEventListener(CHANGE_EVENT, load);
    };
  }, []);
  return store;
}

const readOf = (store: ReadingStore, slugs: string[]) => slugs.filter((s) => store[s]?.r != null).length;

/** Cards: "on" (begun) with a bar and "3 / 8 · en cours", or "done" with the
 *  seal. Lines: stations read, the one in progress, the segments up to it. */
export function DeskMarks() {
  const store = useStore();
  const locale = useLocale();
  useEffect(() => {
    const root = document.querySelector(".pcd");
    if (!root) return;
    root.querySelectorAll<HTMLElement>("[data-pcd-card]").forEach((card) => {
      const slugs = (card.dataset.slugs ?? "").split(" ").filter(Boolean);
      const read = readOf(store, slugs);
      const done = read > 0 && read === slugs.length;
      card.classList.toggle("on", read > 0 && !done);
      card.classList.toggle("done", done);
      card.style.setProperty("--w", `${Math.round((100 * read) / Math.max(1, slugs.length))}%`);
      const st = card.querySelector<HTMLElement>("[data-pcd-st]");
      if (st) st.textContent = done ? t("pcd.doneSt", undefined, locale) : read ? t("pcd.onSt", { r: read, t: slugs.length }, locale) : "";
    });
    const state = new Map<string, "dn" | "cur" | "">();
    root.querySelectorAll<SVGAElement>("[data-pcd-station]").forEach((a) => {
      const slugs = (a.dataset.slugs ?? "").split(" ").filter(Boolean);
      const read = readOf(store, slugs);
      const s = read === 0 ? "" : read === slugs.length ? "dn" : "cur";
      state.set(a.dataset.pcdStation!, s);
      a.classList.toggle("dn", s === "dn");
      a.classList.toggle("cur", s === "cur");
      a.querySelector("circle")?.setAttribute("r", s === "cur" ? "9" : "7");
    });
    root.querySelectorAll<SVGLineElement>("line[data-to]").forEach((l) => l.classList.toggle("dn", !!state.get(l.dataset.to!)));
  }, [store, locale]);
  return null;
}

/** Search, one chip per family, and the jumps to the three sections. */
export function DeskFilter({ total, families }: { total: number; families: { id: PathFamily; count: number }[] }) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  const [q, setQ] = useState("");
  const [family, setFamily] = useState<PathFamily | "">("");
  const [seg, setSeg] = useState("salles");
  const tokens = useMemo(() => fold(q).split(/\s+/).filter(Boolean), [q]);
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".pcd");
    if (!root) return;
    const on = !!family || tokens.length > 0;
    root.toggleAttribute("data-filtering", on);
    root.querySelectorAll<HTMLElement>("[data-pcd-room]").forEach((room) => {
      let any = false;
      room.querySelectorAll<HTMLElement>("[data-pcd-card]").forEach((c) => {
        const ok = (!family || room.dataset.family === family) && tokens.every((tok) => (c.dataset.search ?? "").includes(tok));
        c.hidden = !ok;
        any ||= ok;
      });
      room.hidden = !any;
    });
  }, [family, tokens]);
  const jump = (id: string) => {
    setSeg(id);
    document.getElementById(`pcd-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className="pcd-filter" role="search">
      <div className="pcd-in">
        <label className="pcd-q">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("parcours.filterPlaceholder")} aria-label={tr("parcours.filterAria")} autoComplete="off" />
        </label>
        <span className="pcd-chips" role="group" aria-label={tr("parcours.filterFamilies")}>
          <button type="button" aria-pressed={family === ""} onClick={() => setFamily("")}>
            {tr("parcours.filterAll")} <i>{total}</i>
          </button>
          {families.map((f) => (
            <button key={f.id} type="button" data-family={f.id} aria-pressed={family === f.id} onClick={() => setFamily(family === f.id ? "" : f.id)}>
              {tr(`parcours.family.${f.id}`)} <i>{f.count}</i>
            </button>
          ))}
        </span>
        <span className="pcd-seg">
          {(["salles", "lignes", "duree"] as const).map((id) => (
            <button key={id} type="button" aria-pressed={seg === id} onClick={() => jump(id)}>
              {tr(`pcd.seg_${id}`)}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}

/** "Voir les 14 autres parcours de la salle". */
export function DeskMore({ n }: { n: number }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      className="pcd-more"
      aria-expanded={open}
      onClick={(e) => {
        const body = (e.currentTarget as HTMLElement).closest(".pcd-body");
        body?.toggleAttribute("data-open", !open);
        setOpen(!open);
      }}
    >
      {t(open ? "pcd.less" : "pcd.more", { n }, locale)} <span aria-hidden="true">{open ? "↑" : "→"}</span>
    </button>
  );
}

/** A path not begun, at random. */
export function DeskDice({ slugs }: { slugs: [string, string[]][] }) {
  const locale = useLocale();
  const store = useStore();
  return (
    <button
      type="button"
      className="pcd-btn"
      onClick={() => {
        const fresh = slugs.filter(([, notes]) => readOf(store, notes) === 0);
        const pool = fresh.length ? fresh : slugs;
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the site moves between documents, never through the router
        window.location.assign(`/parcours/${pool[Math.floor(Math.random() * pool.length)][0]}/`);
      }}
    >
      {t("pcd.diceBtn", undefined, locale)}
    </button>
  );
}
