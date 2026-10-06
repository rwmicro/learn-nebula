"use client";

// Prérequis suggérés — GET /api/admin/prereq-suggestions, the draft edges
// scripts/prereq-suggestions.ts writes at build time (data/
// prereq-suggestions.json, never a public file; heuristics in
// lib/prereq-suggest.ts). "Accepter" opens a pull request on the vault
// (PrereqAcceptButton, when the server has a token); "Copier" copies the
// ready-to-paste frontmatter line; "Ignorer" is remembered in this browser only.

import { useMemo, useState } from "react";
import {
  BUTTON_CLASS,
  CardHeader,
  CountBadge,
  Dot,
  ErrorLine,
  Muted,
  NoteLink,
  RefreshButton,
  fmtDateTime,
  plural,
  type AdminCardProps,
} from "./shared";
import PrereqAcceptButton from "./PrereqAcceptButton";
import {
  URLS,
  ignoredKey as keyOf,
  toggleIgnored,
  useAdminResource,
  useIgnoredPrereqs,
} from "./store";

interface Suggestion {
  slug: string;
  title: string;
  confidence: number;
  reasons: string[];
  yaml: string;
  /** Wikilink target to add; absent from reports built before "Accepter". */
  link?: string;
  path: { slug: string; name: string } | null;
}
interface NoteGroup {
  slug: string;
  title: string;
  /** The note's file in the vault repo; absent from older reports. */
  notePath?: string;
  existing: string[];
  yamlAll: string;
  best: number;
  suggestions: Suggestion[];
}
export interface PrereqReport {
  generatedAt: string;
  notes: number;
  total: number;
  joinPath: number;
  newPath: number;
  excluded: {
    candidates: number;
    already: number;
    implied: number;
    cycle: number;
    reverse: number;
  };
  byNote: NoteGroup[];
}
type Report = PrereqReport;

/** Suggestions still to decide on (not ignored in this browser) — the card's
 *  count and the dashboard tile's. */
export function livePrereqCount(
  report: PrereqReport | null,
  ignored: Set<string>,
): number {
  let n = 0;
  for (const g of report?.byNote ?? []) {
    for (const s of g.suggestions) if (!ignored.has(keyOf(g.slug, s.slug))) n++;
  }
  return n;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API refused (insecure origin, permissions): old-school copy.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function PrereqSuggestionsCard({
  token,
  onUnauthorized,
  onToast,
}: AdminCardProps) {
  const res = useAdminResource<Report>(URLS.prereqs, token, onUnauthorized);
  const report = res.data;
  const ignored = useIgnoredPrereqs();
  const [showIgnored, setShowIgnored] = useState(false);
  const toggleIgnore = (note: string, prereq: string) =>
    toggleIgnored(keyOf(note, prereq));

  const copy = async (text: string) => {
    onToast(
      (await copyText(text))
        ? "Ligne de frontmatter copiée."
        : "Copie impossible — sélectionnez la ligne à la main.",
    );
  };

  // Visible groups: ignored suggestions hidden unless asked for; a group
  // whose every suggestion is ignored goes too.
  const { groups, visible, noteCount, ignoredCount, joinPath, newPath } =
    useMemo(() => {
      const groups: (NoteGroup & { shown: Suggestion[] })[] = [];
      let visible = 0;
      let ignoredCount = 0;
      let joinPath = 0;
      let newPath = 0;
      let noteCount = 0;
      for (const g of report?.byNote ?? []) {
        const shown = g.suggestions.filter((s) => {
          const ign = ignored.has(keyOf(g.slug, s.slug));
          if (ign) ignoredCount++;
          else if (s.path) joinPath++;
          else newPath++;
          return showIgnored || !ign;
        });
        const live = shown.filter(
          (s) => !ignored.has(keyOf(g.slug, s.slug)),
        ).length;
        visible += live;
        if (live) noteCount++;
        if (shown.length) groups.push({ ...g, shown });
      }
      return { groups, visible, noteCount, ignoredCount, joinPath, newPath };
    }, [report, ignored, showIgnored]);

  return (
    <section id="admin-prereqs" className="admin-card">
      <CardHeader
        title="prérequis suggérés"
        count={report ? visible : undefined}
      >
        <RefreshButton
          busy={res.busy}
          onClick={() => res.reload()}
          label="Recharger les suggestions de prérequis"
        />
      </CardHeader>
      {res.failed && (
        <ErrorLine>
          Impossible de charger les suggestions de prérequis.
        </ErrorLine>
      )}
      {res.missing && (
        <Muted>
          Pas de suggestions sur ce serveur — elles sont produites par le build
          (scripts/prereq-suggestions.ts).
        </Muted>
      )}
      {!report && !res.failed && !res.missing && <Muted>Chargement…</Muted>}
      {report && (
        <>
          <p className="m-0 mb-1 flex items-center gap-2 text-small text-muted-warm">
            <Dot color={visible ? "var(--warn)" : "var(--garden)"} />
            {plural(visible, "suggestion")} sur {plural(noteCount, "note")} —
            build du {fmtDateTime(report.generatedAt)}
          </p>
          <p className="m-0 mb-2 text-micro text-muted-warm">
            {plural(joinPath, "suggestion")}{" "}
            {joinPath > 1 ? "rejoindraient" : "rejoindrait"} un parcours
            existant · {newPath}{" "}
            {newPath > 1
              ? "lanceraient ou agrandiraient"
              : "lancerait ou agrandirait"}{" "}
            un nouveau groupe. Tirées des liens : citation dans
            l&apos;introduction, « déjà vu dans / rappel / prérequis », « voir /
            cf. », ordre des dossiers numérotés. Écartées :{" "}
            {report.excluded.already} déjà listées, {report.excluded.implied}{" "}
            déjà implicites, {report.excluded.cycle} qui créeraient une boucle,{" "}
            {report.excluded.reverse} ambiguës (citations croisées).
          </p>
          {ignoredCount > 0 && (
            <label className="mb-2 flex items-center gap-2 text-micro text-muted-warm">
              <input
                type="checkbox"
                checked={showIgnored}
                onChange={(e) => setShowIgnored(e.target.checked)}
              />
              Afficher les{" "}
              {plural(
                ignoredCount,
                "suggestion ignorée",
                "suggestions ignorées",
              )}
            </label>
          )}
          {groups.length === 0 ? (
            <Muted>Rien à proposer.</Muted>
          ) : (
            <ul
              className="admin-notes admin-prereqs"
              aria-label="Suggestions par note"
            >
              {groups.map((g) => {
                const live = g.shown.filter(
                  (s) => !ignored.has(keyOf(g.slug, s.slug)),
                );
                return (
                  <li key={g.slug}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span>
                        <NoteLink slug={g.slug}>{g.title}</NoteLink>
                        {g.existing.length > 0 && (
                          <span className="ml-2 text-micro text-muted-warm">
                            déjà : {g.existing.join(", ")}
                          </span>
                        )}
                      </span>
                      {live.length > 1 && (
                        <span className="flex flex-wrap gap-1">
                          {g.notePath && (
                            <PrereqAcceptButton
                              token={token}
                              onUnauthorized={onUnauthorized}
                              onToast={onToast}
                              items={live
                                .filter((s) => s.link)
                                .map((s) => ({
                                  notePath: g.notePath!,
                                  link: s.link!,
                                }))}
                            />
                          )}
                          <button
                            type="button"
                            className={BUTTON_CLASS}
                            onClick={() => copy(g.yamlAll)}
                            aria-label={`Copier la ligne prerequis avec les ${live.length} suggestions pour ${g.title}`}
                          >
                            Tout copier
                          </button>
                        </span>
                      )}
                    </div>
                    <ul className="admin-prereq-list">
                      {g.shown.map((s) => {
                        const ign = ignored.has(keyOf(g.slug, s.slug));
                        return (
                          <li
                            key={s.slug}
                            className={ign ? "is-ignored" : undefined}
                          >
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <span className="text-micro text-muted-warm">
                                avant :
                              </span>
                              <NoteLink slug={s.slug}>{s.title}</NoteLink>
                              <CountBadge>
                                {Math.round(s.confidence * 100)} %
                              </CountBadge>
                              <span className="admin-prereq-path text-micro">
                                {s.path
                                  ? `parcours « ${s.path.name} »`
                                  : "nouveau groupe"}
                              </span>
                              <span className="ml-auto flex gap-1">
                                {g.notePath && s.link && (
                                  <PrereqAcceptButton
                                    token={token}
                                    onUnauthorized={onUnauthorized}
                                    onToast={onToast}
                                    items={[
                                      { notePath: g.notePath, link: s.link },
                                    ]}
                                    disabled={ign}
                                  />
                                )}
                                <button
                                  type="button"
                                  className={BUTTON_CLASS}
                                  onClick={() => copy(s.yaml)}
                                  disabled={ign}
                                  aria-label={`Copier la ligne prerequis : ${s.title} avant ${g.title}`}
                                >
                                  Copier
                                </button>
                                <button
                                  type="button"
                                  className={BUTTON_CLASS}
                                  onClick={() => toggleIgnore(g.slug, s.slug)}
                                  aria-pressed={ign}
                                  aria-label={`${ign ? "Rétablir" : "Ignorer"} la suggestion ${s.title} avant ${g.title}`}
                                >
                                  {ign ? "Rétablir" : "Ignorer"}
                                </button>
                              </span>
                            </div>
                            <ul className="admin-sublist">
                              {s.reasons.map((r) => (
                                <li key={r}>{r}</li>
                              ))}
                            </ul>
                            <code className="admin-prereq-yaml">{s.yaml}</code>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
