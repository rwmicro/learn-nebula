"use client";

// Signalements — GET /api/admin/reports. A reader selected a passage of a note
// and said what is wrong with it ("Signaler une erreur" in the selection menu,
// lib/feedback.ts → POST /api/report). "Traité" moves it to the handled list
// (PATCH /api/admin/reports); handled reports are kept 90 days.

import { useState } from "react";
import {
  BUTTON_CLASS,
  CardHeader,
  ErrorLine,
  Muted,
  NoteLink,
  RefreshButton,
  Unauthorized,
  adminFetch,
  fmtDateTime,
  fmtShort,
  type AdminCardProps,
} from "./shared";
import { URLS, setResource, useAdminResource } from "./store";

interface Report {
  id: number;
  slug: string;
  passage: string;
  remark: string;
  created_at: number;
  done_at: number | null;
}
export interface ReportsData {
  open: Report[];
  done: Report[];
}

export const REPORTS_ID = "admin-reports";

/** The note, scrolled to the passage (a text fragment) where the browser can. */
function passageHref(r: Report): string {
  const words = r.passage.split(/\s+/).slice(0, 8).join(" ");
  return `/posts/${r.slug}/#:~:text=${encodeURIComponent(words)}`;
}

export function ReportsCard({ token, onUnauthorized, onToast }: AdminCardProps) {
  const res = useAdminResource<ReportsData>(URLS.reports, token, onUnauthorized);
  const data = res.data;
  const error = res.failed ? (res.error ?? "Impossible de charger les signalements.") : null;
  const [busy, setBusy] = useState<number | null>(null);

  const mark = async (r: Report, done: boolean) => {
    setBusy(r.id);
    try {
      await adminFetch(URLS.reports, token, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: r.id, done }),
      });
      setResource<ReportsData>(URLS.reports, (d) => {
        const open = (d?.open ?? []).filter((x) => x.id !== r.id);
        const doneList = (d?.done ?? []).filter((x) => x.id !== r.id);
        const moved = { ...r, done_at: done ? Date.now() : null };
        return done ? { open, done: [moved, ...doneList] } : { open: [moved, ...open], done: doneList };
      });
      onToast(done ? "Signalement traité." : "Signalement rouvert.");
    } catch (e) {
      if (e instanceof Unauthorized) onUnauthorized();
      else onToast("Mise à jour impossible.");
    } finally {
      setBusy(null);
    }
  };

  const item = (r: Report, done: boolean) => (
    <li key={r.id} className="admin-report border-b border-rule py-3 last:border-0">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3 text-small">
        <NoteLink slug={r.slug} />
        <span className="text-micro text-muted-warm" title={fmtDateTime(r.created_at)}>
          {fmtShort(r.created_at)}
        </span>
      </div>
      <blockquote className="m-0 mb-1 border-s-2 border-rule-strong ps-2 text-small italic">
        <a href={passageHref(r)} className="text-ink no-underline hover:underline" title="Ouvrir la note au passage">
          {r.passage}
        </a>
      </blockquote>
      <p className="m-0 mb-2 whitespace-pre-line text-small">{r.remark}</p>
      <button
        type="button"
        className={`${BUTTON_CLASS} admin-btn-sm`}
        disabled={busy === r.id}
        onClick={() => mark(r, !done)}
      >
        {done ? "Rouvrir" : "Traité"}
      </button>
    </li>
  );

  return (
    <section id={REPORTS_ID} className="admin-card">
      <CardHeader title="signalements" count={data ? data.open.length : undefined}>
        <RefreshButton busy={res.busy} onClick={() => res.reload()} label="Recharger les signalements" />
      </CardHeader>
      <p className="m-0 mb-3 text-small text-muted-warm">
        Passages signalés par des lecteurs depuis le menu de sélection d&apos;une note.
      </p>
      {error && <ErrorLine>{error}</ErrorLine>}
      {!data && !error && <Muted>Chargement…</Muted>}
      {data && data.open.length === 0 && <Muted>Aucun signalement en attente.</Muted>}
      {data && data.open.length > 0 && <ul className="m-0 list-none p-0">{data.open.map((r) => item(r, false))}</ul>}
      {data && data.done.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-small text-muted-warm">Traités récemment ({data.done.length})</summary>
          <ul className="m-0 list-none p-0">{data.done.map((r) => item(r, true))}</ul>
        </details>
      )}
    </section>
  );
}

export default ReportsCard;
