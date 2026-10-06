"use client";

// Faits à vérifier — GET /api/admin/facts, the list scripts/facts-to-check.ts
// builds from the vault's sources/a-verifier.md checklist (data/
// facts-to-check.json, never a public file). Open lines grouped by note, each
// with the note's page and its file on GitHub to fix it; ticking the line
// (`- [x]`) in the checklist removes it at the next build.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  CardHeader,
  CountBadge,
  Dot,
  ErrorLine,
  FOCUS_RING,
  Muted,
  RefreshButton,
  Unauthorized,
  adminFetch,
  fmtDateTime,
  plural,
} from "./shared";

interface Item {
  line: number;
  claim: string;
  sources: string;
  urls: string[];
  section: string;
}
interface Group {
  target: string | null;
  title: string | null;
  url: string | null;
  path: string | null;
  editUrl: string | null;
  items: Item[];
}
interface Report {
  generatedAt: string;
  source: { path: string; found: boolean; editUrl: string | null };
  total: number;
  done: number;
  open: number;
  unresolved: number;
  byNote: Group[];
}

const LINK_CLASS = `rounded text-garden underline-offset-2 hover:underline ${FOCUS_RING}`;

/** The sources text with its URLs clickable (shown as their host). */
function withLinks(text: string, urls: string[]): ReactNode[] {
  if (!urls.length) return [text];
  const out: ReactNode[] = [];
  let rest = text;
  urls.forEach((u, i) => {
    const at = rest.indexOf(u);
    if (at < 0) return;
    out.push(rest.slice(0, at));
    let host = u;
    try {
      host = new URL(u).hostname.replace(/^www\./, "");
    } catch {
      /* keep the raw URL */
    }
    out.push(
      <a key={i} href={u} target="_blank" rel="noopener noreferrer" className={LINK_CLASS} title={u}>
        {host}
      </a>,
    );
    rest = rest.slice(at + u.length);
  });
  out.push(rest);
  return out;
}

export function FactsToCheckCard({ token, onUnauthorized }: { token: string; onUnauthorized: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setReport(await adminFetch<Report>("/api/admin/facts", token));
      setError(null);
      setMissing(false);
    } catch (e) {
      if (e instanceof Unauthorized) onUnauthorized();
      else if (e instanceof Error && e.message === "HTTP 404") setMissing(true);
      else setError("Impossible de charger les faits à vérifier.");
    } finally {
      setBusy(false);
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section id="admin-facts" className="admin-card">
      <CardHeader title="faits à vérifier" count={report ? report.open : undefined}>
        <RefreshButton busy={busy} onClick={load} label="Recharger les faits à vérifier" />
      </CardHeader>
      {error && <ErrorLine>{error}</ErrorLine>}
      {missing && (
        <Muted>Pas de liste sur ce serveur — elle est produite par le build (scripts/facts-to-check.ts).</Muted>
      )}
      {!report && !error && !missing && <Muted>Chargement…</Muted>}
      {report && !report.source.found && (
        <Muted>
          Pas de <code>{report.source.path}</code> dans le coffre au build du {fmtDateTime(report.generatedAt)}.
        </Muted>
      )}
      {report && report.source.found && (
        <>
          <p className="m-0 mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted-warm">
            <Dot color={report.open ? "var(--warn)" : "var(--garden)"} />
            {report.open
              ? `${plural(report.open, "affirmation")} à vérifier sur ${plural(report.byNote.length, "note")}`
              : "Tout est vérifié"}
            {" · "}
            {plural(report.done, "corrigée", "corrigées")} — build du {fmtDateTime(report.generatedAt)}
          </p>
          <p className="m-0 mb-3 text-micro text-muted-warm">
            Une ligne <code>- [ ] [[Note]] — affirmation — sources</code> par fait dans{" "}
            {report.source.editUrl ? (
              <a href={report.source.editUrl} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                {report.source.path}
              </a>
            ) : (
              <code>{report.source.path}</code>
            )}{" "}
            ; cocher <code>[x]</code> une fois la note corrigée.
            {report.unresolved > 0 &&
              ` ${plural(report.unresolved, "ligne pointe", "lignes pointent")} vers une note introuvable.`}
          </p>
          {report.byNote.length === 0 ? (
            <Muted>Rien à vérifier.</Muted>
          ) : (
            <ul className="admin-notes" aria-label="Faits à vérifier par note">
              {report.byNote.map((g) => (
                <li key={g.target ?? "(sans note)"}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="flex flex-wrap items-baseline gap-2">
                      {g.url ? (
                        <a href={g.url} className={LINK_CLASS}>
                          {g.title ?? g.target}
                        </a>
                      ) : (
                        <span className="text-ink">
                          {g.target ? (
                            <>
                              <code>[[{g.target}]]</code>{" "}
                              <span className="text-micro text-danger">introuvable</span>
                            </>
                          ) : (
                            "Sans note"
                          )}
                        </span>
                      )}
                      <CountBadge>{g.items.length}</CountBadge>
                    </span>
                    {g.editUrl && (
                      <a
                        href={g.editUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-micro ${LINK_CLASS}`}
                      >
                        Modifier sur GitHub
                      </a>
                    )}
                  </div>
                  <ul className="admin-sublist">
                    {g.items.map((it) => (
                      <li key={it.line}>
                        <span className="text-ink">{it.claim}</span>
                        {it.sources && (
                          <span className="block text-micro text-muted-warm">
                            → {withLinks(it.sources, it.urls)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export default FactsToCheckCard;
