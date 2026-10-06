"use client";

// Vault health — GET /api/admin/vault-health, the report scripts/vault-health.ts
// writes at build time (data/vault-health.json, never a public file). One
// collapsible section per problem kind, each listing the notes to fix.

import type { ReactNode } from "react";
import {
  CardHeader,
  CountBadge,
  Dot,
  ErrorLine,
  FOCUS_RING,
  Muted,
  NoteLink,
  RefreshButton,
  fmtDateTime,
  plural,
  type AdminCardProps,
} from "./shared";
import { URLS, useAdminResource } from "./store";

interface NoteRef {
  slug: string;
  title: string;
  /** Vault-relative file path; absent from reports built before it existed. */
  path?: string;
}
export interface VaultReport {
  generatedAt: string;
  notes: number;
  brokenLinks: (NoteRef & { links: { kind: string; target: string; reason: string }[] })[];
  nearEmpty: (NoteRef & { chars: number })[];
  frontmatter: (NoteRef & { missing: string[]; none: boolean })[];
  audio: (NoteRef & { clips: { src: string; problem: "missing" | "empty" | "lfs" }[] })[];
  english: (NoteRef & { en: number; fr: number; es: number; ratio: number })[];
  /** Absent from reports built before prerequisites existed. */
  prereqCycles?: { members: NoteRef[]; broken: [NoteRef, NoteRef][] }[];
}
type Report = VaultReport;

const VAULT_EDIT = "https://github.com/rwmicro/pensine/edit/main/";

function editUrl(p: string): string {
  return VAULT_EDIT + p.split("/").map(encodeURIComponent).join("/");
}

/** Ids of the disclosures the dashboard tiles jump to. */
export const HEALTH_SECTION_IDS = {
  brokenLinks: "admin-health-links",
  audio: "admin-health-audio",
} as const;

const AUDIO_PROBLEM: Record<string, string> = {
  missing: "introuvable",
  empty: "fichier vide (0 octet)",
  lfs: "pointeur git-lfs non téléchargé",
};

export function VaultHealthCard({ token, onUnauthorized }: AdminCardProps) {
  const res = useAdminResource<Report>(URLS.vaultHealth, token, onUnauthorized);
  const report = res.data;

  const total = report
    ? report.brokenLinks.length +
      report.nearEmpty.length +
      report.frontmatter.length +
      report.audio.length +
      report.english.length +
      (report.prereqCycles?.length ?? 0)
    : 0;

  return (
    <section id="admin-health" className="admin-card">
      <CardHeader title="santé du coffre">
        <RefreshButton busy={res.busy} onClick={() => res.reload()} label="Recharger le rapport du coffre" />
      </CardHeader>
      {res.failed && <ErrorLine>Impossible de charger le rapport du coffre.</ErrorLine>}
      {res.missing && (
        <Muted>Pas de rapport sur ce serveur — il est produit par le build (scripts/vault-health.ts).</Muted>
      )}
      {!report && !res.failed && !res.missing && <Muted>Chargement…</Muted>}
      {report && (
        <>
          <p className="m-0 mb-3 flex items-center gap-2 text-small text-muted-warm">
            <Dot color={total ? "var(--warn)" : "var(--garden)"} />
            {report.notes} notes analysées au build du {fmtDateTime(report.generatedAt)}
            {total ? "" : " — rien à signaler"}
          </p>
          <div className="admin-health">
            <Section
              id={HEALTH_SECTION_IDS.brokenLinks}
              title="Liens cassés"
              count={report.brokenLinks.length}
              hint="[[liens]] vers une note introuvable, liens Markdown vers un .md qui ne nomme aucune note, et entrées « prerequis: » qui ne désignent aucune note publiée (le bloc « À lire avant » les omet)."
            >
              {report.brokenLinks.map((n) => (
                <NoteItem key={n.slug} note={n} meta={plural(n.links.length, "lien")}>
                  <ul className="admin-sublist">
                    {n.links.slice(0, 8).map((l) => (
                      <li key={`${l.kind}:${l.target}`}>
                        <code>
                          {l.kind === "wikilink"
                            ? `[[${l.target}]]`
                            : l.kind === "prerequis"
                              ? `prerequis: ${l.target}`
                              : `(${l.target})`}
                        </code>{" "}
                        — {l.reason}
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
              id={HEALTH_SECTION_IDS.audio}
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
            <Section
              title="Prérequis en boucle"
              count={report.prereqCycles?.length ?? 0}
              hint="Des notes qui se citent mutuellement en « prerequis: » — /parcours/ ignore la relation barrée pour les ordonner."
            >
              {(report.prereqCycles ?? []).map((c) => (
                <li key={c.members.map((m) => m.slug).join("|")}>
                  <div className="flex flex-wrap gap-x-2">
                    {c.members.map((m, i) => (
                      <span key={m.slug}>
                        {i > 0 && "· "}
                        <NoteLink slug={m.slug}>{m.title}</NoteLink>
                        {m.path && (
                          <>
                            {" "}
                            <EditLink path={m.path} title={m.title} short />
                          </>
                        )}
                      </span>
                    ))}
                  </div>
                  <ul className="admin-sublist">
                    {c.broken.map(([a, b]) => (
                      <li key={`${a.slug}>${b.slug}`}>
                        <s>{b.title} ← prerequis: {a.title}</s> — ignoré
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </Section>
          </div>
        </>
      )}
    </section>
  );
}

function Section({
  id,
  title,
  count,
  hint,
  children,
}: {
  id?: string;
  title: string;
  count: number;
  hint: string;
  children: ReactNode;
}) {
  return (
    <details id={id} className={`admin-details${count ? " has-items" : ""}`}>
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
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <NoteLink slug={note.slug}>{note.title}</NoteLink>
        <span className="admin-note-actions">
          {meta && <span className="text-micro text-muted-warm">{meta}</span>}
          <a href={`/posts/${note.slug}/`} className={`admin-note-action ${FOCUS_RING}`}>
            voir la note
          </a>
          {note.path && <EditLink path={note.path} title={note.title} />}
        </span>
      </div>
      {children}
    </li>
  );
}

function EditLink({ path, title, short = false }: { path: string; title: string; short?: boolean }) {
  return (
    <a
      href={editUrl(path)}
      target="_blank"
      rel="noopener noreferrer"
      title={`Modifier « ${title} » sur GitHub (${path})`}
      aria-label={short ? `Modifier « ${title} » sur GitHub` : undefined}
      className={`admin-note-action ${FOCUS_RING}`}
    >
      {short ? "modifier ↗" : "modifier sur GitHub ↗"}
    </a>
  );
}
