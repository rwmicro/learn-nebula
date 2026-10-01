"use client";

// Vault health — GET /api/admin/vault-health, the report scripts/vault-health.ts
// writes at build time (data/vault-health.json, never a public file). One
// collapsible section per problem kind, each listing the notes to fix.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  CardHeader,
  CountBadge,
  Dot,
  ErrorLine,
  Muted,
  NoteLink,
  RefreshButton,
  Unauthorized,
  adminFetch,
  fmtDateTime,
  plural,
} from "./shared";

interface NoteRef {
  slug: string;
  title: string;
}
interface Report {
  generatedAt: string;
  notes: number;
  brokenLinks: (NoteRef & { links: { kind: string; target: string; reason: string }[] })[];
  nearEmpty: (NoteRef & { chars: number })[];
  frontmatter: (NoteRef & { missing: string[]; none: boolean })[];
  audio: (NoteRef & { clips: { src: string; problem: "missing" | "empty" | "lfs" }[] })[];
  english: (NoteRef & { en: number; fr: number; es: number; ratio: number })[];
}

const AUDIO_PROBLEM: Record<string, string> = {
  missing: "introuvable",
  empty: "fichier vide (0 octet)",
  lfs: "pointeur git-lfs non téléchargé",
};

export function VaultHealthCard({ token, onUnauthorized }: { token: string; onUnauthorized: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setReport(await adminFetch<Report>("/api/admin/vault-health", token));
      setError(null);
      setMissing(false);
    } catch (e) {
      if (e instanceof Unauthorized) onUnauthorized();
      else if (e instanceof Error && e.message === "HTTP 404") setMissing(true);
      else setError("Impossible de charger le rapport du coffre.");
    } finally {
      setBusy(false);
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    load();
  }, [load]);

  const total = report
    ? report.brokenLinks.length +
      report.nearEmpty.length +
      report.frontmatter.length +
      report.audio.length +
      report.english.length
    : 0;

  return (
    <section id="admin-health" className="admin-card">
      <CardHeader title="santé du coffre">
        <RefreshButton busy={busy} onClick={load} label="Recharger le rapport du coffre" />
      </CardHeader>
      {error && <ErrorLine>{error}</ErrorLine>}
      {missing && (
        <Muted>Pas de rapport sur ce serveur — il est produit par le build (scripts/vault-health.ts).</Muted>
      )}
      {!report && !error && !missing && <Muted>Chargement…</Muted>}
      {report && (
        <>
          <p className="m-0 mb-3 flex items-center gap-2 text-small text-muted-warm">
            <Dot color={total ? "var(--warn)" : "var(--garden)"} />
            {report.notes} notes analysées au build du {fmtDateTime(report.generatedAt)}
            {total ? "" : " — rien à signaler"}
          </p>
          <div className="admin-health">
            <Section
              title="Liens cassés"
              count={report.brokenLinks.length}
              hint="[[liens]] vers une note introuvable, et liens Markdown vers un .md — le site ne les convertit pas (404) : écrire [[Note]] à la place."
            >
              {report.brokenLinks.map((n) => (
                <NoteItem key={n.slug} note={n} meta={plural(n.links.length, "lien")}>
                  <ul className="admin-sublist">
                    {n.links.slice(0, 8).map((l) => (
                      <li key={`${l.kind}:${l.target}`}>
                        <code>{l.kind === "wikilink" ? `[[${l.target}]]` : `(${l.target})`}</code> — {l.reason}
                      </li>
                    ))}
                    {n.links.length > 8 && <li>… et {n.links.length - 8} autres</li>}
                  </ul>
                </NoteItem>
              ))}
            </Section>
            <Section title="Notes quasi vides" count={report.nearEmpty.length} hint="Moins de 200 caractères de texte.">
              {report.nearEmpty.map((n) => (
                <NoteItem key={n.slug} note={n} meta={plural(n.chars, "caractère")} />
              ))}
            </Section>
            <Section
              title="Frontmatter incomplet"
              count={report.frontmatter.length}
              hint="Champs attendus : title, domain, subdomain, tags, date."
            >
              {report.frontmatter.map((n) => (
                <NoteItem
                  key={n.slug}
                  note={n}
                  meta={n.none ? "aucun frontmatter" : `manque : ${n.missing.join(", ")}`}
                />
              ))}
            </Section>
            <Section
              title="Audio manquant ou vide"
              count={report.audio.length}
              hint="Clips de prononciation absents, vides ou restés en pointeur LFS."
            >
              {report.audio.map((n) => (
                <NoteItem key={n.slug} note={n} meta={plural(n.clips.length, "clip")}>
                  <ul className="admin-sublist">
                    {n.clips.slice(0, 8).map((c) => (
                      <li key={c.src}>
                        <code>{c.src.split("/").pop()}</code> — {AUDIO_PROBLEM[c.problem] ?? c.problem}
                      </li>
                    ))}
                    {n.clips.length > 8 && <li>… et {n.clips.length - 8} autres</li>}
                  </ul>
                </NoteItem>
              ))}
            </Section>
            <Section
              title="Notes surtout en anglais"
              count={report.english.length}
              hint="Heuristique sur les mots-outils ; ajouter « lang: en » au frontmatter si c'est voulu."
            >
              {report.english.map((n) => (
                <NoteItem key={n.slug} note={n} meta={`${Math.round(n.ratio * 100)} % anglais`} />
              ))}
            </Section>
          </div>
        </>
      )}
    </section>
  );
}

function Section({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count: number;
  hint: string;
  children: ReactNode;
}) {
  return (
    <details className="admin-details">
      <summary className="text-small">
        <span className="admin-details-title text-ink">{title}</span>
        <CountBadge>{count}</CountBadge>
      </summary>
      <div className="admin-details-body">
        <p className="m-0 mb-2 text-micro text-muted-warm">{hint}</p>
        {count === 0 ? <Muted>Rien à signaler.</Muted> : <ul className="admin-notes">{children}</ul>}
      </div>
    </details>
  );
}

function NoteItem({ note, meta, children }: { note: NoteRef; meta?: string; children?: ReactNode }) {
  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <NoteLink slug={note.slug}>{note.title}</NoteLink>
        {meta && <span className="text-micro text-muted-warm">{meta}</span>}
      </div>
      {children}
    </li>
  );
}
