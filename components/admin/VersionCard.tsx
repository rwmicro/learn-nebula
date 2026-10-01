"use client";

// "Is the live site up to date with the vault?" — GET /api/admin/version
// (server/version.ts): what the running image was built from vs. pensine's
// latest commit on GitHub.

import { useCallback, useEffect, useState } from "react";
import {
  CardHeader,
  Dot,
  ErrorLine,
  FOCUS_RING,
  Muted,
  RefreshButton,
  Unauthorized,
  adminFetch,
  fmtDateTime,
} from "./shared";

interface VersionStatus {
  build: {
    builtAt: string | null;
    site: { sha: string | null };
    pensine: { repo: string | null; sha: string | null; date: string | null; subject: string | null };
  } | null;
  latest: { sha: string; date: string | null; subject: string | null } | null;
  behind: number | null;
  status: "up-to-date" | "behind" | "unknown";
}

const SITE_REPO = "rwmicro/learn-nebula";
const DEFAULT_VAULT_REPO = "rwmicro/pensine";

function Sha({ repo, sha }: { repo: string; sha: string | null | undefined }) {
  if (!sha) return <span className="text-muted-warm">inconnu</span>;
  return (
    <a
      href={`https://github.com/${repo}/commit/${sha}`}
      className={`rounded font-mono text-[0.85em] text-garden underline-offset-2 hover:underline ${FOCUS_RING}`}
    >
      {sha.slice(0, 7)}
    </a>
  );
}

export function VersionCard({ token, onUnauthorized }: { token: string; onUnauthorized: () => void }) {
  const [data, setData] = useState<VersionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await adminFetch<VersionStatus>("/api/admin/version", token));
      setError(null);
    } catch (e) {
      if (e instanceof Unauthorized) onUnauthorized();
      else setError("Impossible de lire la version en ligne.");
    } finally {
      setBusy(false);
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    load();
  }, [load]);

  const vaultRepo = data?.build?.pensine.repo ?? DEFAULT_VAULT_REPO;
  const served = data?.build?.pensine;

  return (
    <section className="admin-card">
      <CardHeader title="version en ligne">
        <RefreshButton busy={busy} onClick={load} label="Revérifier la version en ligne" />
      </CardHeader>
      {error && <ErrorLine>{error}</ErrorLine>}
      {!data && !error && <Muted>Chargement…</Muted>}
      {data && (
        <>
          <StatusLine data={data} vaultRepo={vaultRepo} />
          <dl className="admin-dl m-0 mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small">
            <dt className="text-muted-warm">Build</dt>
            <dd className="m-0">
              {data.build ? (
                <>
                  {fmtDateTime(data.build.builtAt)} · site <Sha repo={SITE_REPO} sha={data.build.site.sha} />
                </>
              ) : (
                <span className="text-muted-warm">aucune info de build (data/build-info.json absent)</span>
              )}
            </dd>
            <dt className="text-muted-warm">Pensine servie</dt>
            <dd className="m-0">
              <Sha repo={vaultRepo} sha={served?.sha} />
              {served?.date && <> · {fmtDateTime(served.date)}</>}
              {served?.subject && <span className="admin-subject text-muted-warm"> — {served.subject}</span>}
            </dd>
            <dt className="text-muted-warm">Dernière pensine</dt>
            <dd className="m-0">
              {data.latest ? (
                <>
                  <Sha repo={vaultRepo} sha={data.latest.sha} />
                  {data.latest.date && <> · {fmtDateTime(data.latest.date)}</>}
                  {data.latest.subject && (
                    <span className="admin-subject text-muted-warm"> — {data.latest.subject}</span>
                  )}
                </>
              ) : (
                <span className="text-muted-warm">GitHub injoignable depuis le serveur</span>
              )}
            </dd>
          </dl>
        </>
      )}
    </section>
  );
}

function StatusLine({ data, vaultRepo }: { data: VersionStatus; vaultRepo: string }) {
  if (data.status === "up-to-date") {
    return (
      <p className="m-0 flex items-center gap-2 text-body font-semibold text-ink">
        <Dot color="var(--garden)" />à jour
      </p>
    );
  }
  if (data.status === "behind") {
    const served = data.build?.pensine.sha;
    const n = data.behind;
    return (
      <div className="admin-behind rounded border px-3 py-2 text-small">
        <p className="m-0 flex items-center gap-2 font-semibold text-ink">
          <Dot color="var(--warn)" />
          {n ? `En retard de ${n} commit${n > 1 ? "s" : ""}` : "En retard"} — pull l&apos;image sur le serveur
        </p>
        {served && data.latest && (
          <a
            href={`https://github.com/${vaultRepo}/compare/${served}...${data.latest.sha}`}
            className={`mt-1 inline-block rounded text-garden underline-offset-2 hover:underline ${FOCUS_RING}`}
          >
            voir les changements
          </a>
        )}
      </div>
    );
  }
  const why = !data.build?.pensine.sha
    ? "le build n'a pas enregistré de commit pensine"
    : "dernier commit pensine inconnu (GitHub injoignable)";
  return (
    <p className="m-0 flex items-center gap-2 text-small text-muted-warm">
      <Dot color="var(--faint)" />
      État inconnu — {why}.
    </p>
  );
}
