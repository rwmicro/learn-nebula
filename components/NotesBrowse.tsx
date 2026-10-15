"use client";

import { useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { useReadingStore } from "@/components/HomeContent";
import {
  isRead,
  savedProgress,
  type ReadingStore,
} from "@/lib/reading-progress";
import type { FolderRow, NoteRow } from "@/lib/notes-browse";
import { splitRank } from "@/lib/folder-label";
import { FamilyIcon } from "@/components/HomeDashboard";

// The read state of the "Notes" tab (app/notes/): how many notes of each
// folder this reader has read, the state of each note (read, started, not
// yet), the filter chips over a folder's notes, and the "Reprendre ici" card,
// which remembers the last folder opened. All of it lives in this browser
// (gkReading, gkNotesLast), as on the rest of the site.

const LAST_KEY = "gkNotesLast";

export interface LastFolder {
  slug: string;
  name: string;
  /** Parents' names, discipline first, for the card's second line. */
  trail: string;
  family: string | null;
}

/** Read notes under a folder: every read slug that starts with its prefix. */
function readUnder(store: ReadingStore, slug: string): number {
  const prefix = `${slug}/`;
  let n = 0;
  for (const [k, e] of Object.entries(store))
    if (e.r != null && k.startsWith(prefix)) n++;
  return n;
}

function useT() {
  const locale = useLocale();
  return (key: string, vars?: Record<string, string | number>) =>
    t(key, vars, locale);
}

const chev = (
  <svg className="nb-chev" viewBox="0 0 24 24" aria-hidden="true">
    <path d="m9 6 6 6-6 6" />
  </svg>
);

/** Sub-folder rows, each with its count and, once started, a read bar. */
export function FolderRows({ rows }: { rows: FolderRow[] }) {
  const store = useReadingStore();
  const tr = useT();
  return (
    <ul className="nb-list">
      {rows.map((f) => {
        const read = Math.min(f.count, readUnder(store, f.slug));
        return (
          <li key={f.slug} data-family={f.family ?? undefined}>
            <a href={`/notes/${f.slug}/`} className="nb-row">
              <span
                className={`nb-ico${f.family !== undefined ? " nb-ico-fam" : ""}`}
                aria-hidden="true"
              >
                {f.family !== undefined ? (
                  <FamilyIcon family={f.family} />
                ) : (
                  <svg viewBox="0 0 24 24">
                    <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
                  </svg>
                )}
              </span>
              <span className="nb-tx">
                <b>
                  {(() => {
                    if (f.key) return tr(f.key);
                    const { rank, label } = splitRank(f.name);
                    return rank ? (
                      <>
                        <span className="nb-rank">{rank}</span> {label}
                      </>
                    ) : (
                      label
                    );
                  })()}
                </b>
                <small>
                  {tr(f.count === 1 ? "notesTab.countOne" : "notesTab.count", {
                    n: f.count,
                  })}
                  {read > 0 && (
                    <>
                      {" "}
                      ·{" "}
                      {tr(read === 1 ? "notesTab.readOne" : "notesTab.read", {
                        n: read,
                      })}
                    </>
                  )}
                </small>
                {read > 0 && (
                  <span className="nb-bar" aria-hidden="true">
                    <i
                      style={{
                        width: `${Math.max(3, (read / f.count) * 100)}%`,
                      }}
                    />
                  </span>
                )}
              </span>
              {chev}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

type Filter = "all" | "unread" | "started" | "read";

function stateOf(
  store: ReadingStore,
  n: NoteRow,
): Exclude<Filter, "all"> | null {
  if (!n.slug) return null;
  if (isRead(store, n.slug)) return "read";
  return savedProgress(store, n.slug) != null ? "started" : "unread";
}

/** A folder's own notes, in folder order, with their state and the chips
 *  that keep only what is left to read. */
export function NoteRows({ notes }: { notes: NoteRow[] }) {
  const store = useReadingStore();
  const tr = useT();
  const [filter, setFilter] = useState<Filter>("all");
  const states = useMemo(
    () => notes.map((n) => stateOf(store, n)),
    [notes, store],
  );
  const counts = useMemo(() => {
    const c = { all: notes.length, unread: 0, started: 0, read: 0 };
    for (const s of states) if (s) c[s]++;
    return c;
  }, [notes, states]);
  const anyState = counts.read + counts.started > 0;
  const shown = notes.filter(
    (_, i) => filter === "all" || states[i] === filter,
  );

  return (
    <>
      {anyState && notes.length >= 4 && (
        <div
          className="nb-chips"
          role="group"
          aria-label={tr("notesTab.filterAria")}
        >
          {(["all", "unread", "started", "read"] as const).map((f) =>
            f !== "all" && counts[f] === 0 ? null : (
              <button
                key={f}
                type="button"
                className="nb-chip"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {tr(`notesTab.filter.${f}`)} <small>{counts[f]}</small>
              </button>
            ),
          )}
        </div>
      )}
      <ul className="nb-list">
        {shown.map((n) => {
          const s = stateOf(store, n);
          return (
            <li key={n.href}>
              <a
                href={n.href}
                className="nb-row nb-note"
                {...(n.asset ? { target: "_blank", rel: "noopener" } : {})}
              >
                <span
                  className={`nb-st nb-st-${s ?? (n.deck ? "deck" : "file")}`}
                  aria-hidden="true"
                >
                  {s === "read" && (
                    <svg viewBox="0 0 24 24">
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  )}
                  {n.deck && (
                    <svg viewBox="0 0 24 24">
                      <rect x="4" y="7" width="12" height="13" rx="2" />
                      <path d="M8 7V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-3" />
                    </svg>
                  )}
                  {n.asset && (
                    <svg viewBox="0 0 24 24">
                      <path d="M7 3h7l5 5v13H7z" />
                      <path d="M14 3v5h5" />
                    </svg>
                  )}
                </span>
                <span className="nb-tx">
                  <b>{n.title}</b>
                  {s && s !== "unread" && (
                    <span className="sr-only">
                      {" "}
                      ({tr(`notesTab.state.${s}`)})
                    </span>
                  )}
                </span>
                <span className="nb-min">
                  {n.deck
                    ? tr("notesTab.deck")
                    : n.asset
                      ? "PDF"
                      : n.minutes
                        ? tr("dash.min", { m: n.minutes })
                        : null}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Remembers this folder as the last one opened (for "Reprendre ici"). */
export function RememberFolder(props: LastFolder) {
  useEffect(() => {
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify(props));
    } catch {
      /* storage blocked: the card simply never shows */
    }
  }, [props]);
  return null;
}

/** "Reprendre ici": the last folder opened, on the tab's first screen. */
export function ResumeFolder() {
  const tr = useT();
  const [last, setLast] = useState<LastFolder | null>(null);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only state
      if (v && typeof v.slug === "string" && typeof v.name === "string")
        setLast(v);
    } catch {
      /* nothing remembered */
    }
  }, []);
  if (!last) return null;
  return (
    <section className="nb-sec">
      <h2 className="nb-h">{tr("notesTab.resume")}</h2>
      <ul className="nb-list" data-family={last.family ?? undefined}>
        <li>
          <a href={`/notes/${last.slug}/`} className="nb-row">
            <span className="nb-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
              </svg>
            </span>
            <span className="nb-tx">
              <b>{last.name}</b>
              {last.trail && <small>{last.trail}</small>}
            </span>
            {chev}
          </a>
        </li>
      </ul>
    </section>
  );
}
