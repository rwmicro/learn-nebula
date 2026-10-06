"use client";

// Reconstruire le site — POST /api/admin/rebuild dispatches the image
// workflow (.github/workflows/docker.yml, on main) through the GitHub API;
// GET /api/admin/builds lists its last five runs. The workflow only pushes a
// new image to GHCR: the server still has to pull it and restart (the
// "version en ligne" card tells when that has happened). Disabled, naming the
// variable, when GITHUB_TOKEN is unset.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUTTON_CLASS,
  CardHeader,
  Dot,
  ErrorLine,
  FOCUS_RING,
  Muted,
  RefreshButton,
  Unauthorized,
  fmtDateTime,
} from "./shared";
import { adminJson, answerError } from "./admin-api";

interface Run {
  id: number;
  status: string | null;
  conclusion: string | null;
  event: string | null;
  created_at: string;
  html_url: string;
  title: string | null;
}
interface Builds {
  enabled: boolean;
  repo: string;
  workflow: string;
  envVar: string;
  runs: Run[];
}

const ACTIVE = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);
const POLL_ACTIVE_MS = 15_000;

const EVENT_LABEL: Record<string, string> = {
  workflow_dispatch: "manuel",
  workflow_run: "après CI",
  repository_dispatch: "pensine",
  schedule: "nuit",
  push: "push",
};

function runState(r: Run): { label: string; color: string } {
  if (r.status && ACTIVE.has(r.status)) {
    return { label: r.status === "in_progress" ? "en cours" : "en attente", color: "var(--warn)" };
  }
  switch (r.conclusion) {
    case "success":
      return { label: "réussi", color: "var(--garden)" };
    case "failure":
    case "timed_out":
    case "startup_failure":
      return { label: "échec", color: "var(--danger)" };
    case "cancelled":
      return { label: "annulé", color: "var(--faint)" };
    case "skipped":
      return { label: "ignoré", color: "var(--faint)" };
    default:
      return { label: r.conclusion ?? r.status ?? "?", color: "var(--faint)" };
  }
}

export function RebuildCard({
  token,
  onUnauthorized,
  onToast,
}: {
  token: string;
  onUnauthorized: () => void;
  onToast?: (message: string) => void;
}) {
  const [data, setData] = useState<Builds | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setBusy(true);
      try {
        const a = await adminJson<Builds>("/api/admin/builds", token);
        if (a.data) setData(a.data);
        setError(a.ok ? null : answerError(a, "Impossible de lister les builds"));
      } catch (e) {
        if (e instanceof Unauthorized) onUnauthorized();
        else if (!opts.silent) setError("Impossible de lister les builds.");
      } finally {
        if (!opts.silent) setBusy(false);
      }
    },
    [token, onUnauthorized],
  );

  useEffect(() => {
    load();
  }, [load]);

  // While a run is queued or running, keep its status fresh.
  const active = data?.runs.some((r) => r.status && ACTIVE.has(r.status)) ?? false;
  useEffect(() => {
    if (!active) return;
    pollRef.current = setTimeout(() => load({ silent: true }), POLL_ACTIVE_MS);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [active, data, load]);

  const rebuild = async () => {
    setDispatching(true);
    try {
      const a = await adminJson<{ ok: boolean }>("/api/admin/rebuild", token, { method: "POST" });
      if (a.ok) {
        onToast?.("Reconstruction lancée — le run apparaît dans quelques secondes.");
        // GitHub lists the dispatched run a few seconds later.
        setTimeout(() => load({ silent: true }), 4_000);
      } else {
        setError(answerError(a, "Lancement impossible"));
      }
    } catch (e) {
      if (e instanceof Unauthorized) onUnauthorized();
      else setError("Lancement impossible.");
    } finally {
      setDispatching(false);
    }
  };

  const disabled = data !== null && !data.enabled;

  return (
    <section id="admin-rebuild" className="admin-card">
      <CardHeader title="reconstruire le site">
        <RefreshButton busy={busy} onClick={() => load()} label="Actualiser la liste des builds" />
      </CardHeader>
      <p className="m-0 mb-3 text-small text-muted-warm">
        Relance le workflow d&apos;image Docker
        {data ? (
          <>
            {" "}
            (<code>{data.workflow}</code> sur <code>{data.repo}</code>, branche main)
          </>
        ) : null}{" "}
        : notes à jour depuis pensine, site reconstruit, image poussée sur GHCR. Le serveur doit
        ensuite tirer la nouvelle image et redémarrer pour la servir.
      </p>

      {disabled ? (
        <Muted>
          Désactivé — définir <code>{data.envVar}</code> (jeton fine-grained, Actions en
          lecture/écriture sur {data.repo}) dans l&apos;environnement du serveur.
        </Muted>
      ) : (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={BUTTON_CLASS}
            onClick={rebuild}
            disabled={!data || dispatching || active}
            title={active ? "Un build est déjà en cours" : undefined}
          >
            {dispatching ? "Lancement…" : "Reconstruire maintenant"}
          </button>
          {active && <span className="text-micro text-muted-warm">un build est en cours</span>}
        </div>
      )}

      {error && <ErrorLine>{error}</ErrorLine>}
      {!data && !error && <Muted>Chargement…</Muted>}
      {data?.enabled && data.runs.length === 0 && !error && <Muted>Aucun run pour l&apos;instant.</Muted>}
      {data && data.runs.length > 0 && (
        <ul className="admin-log text-small" aria-label="Derniers builds">
          {data.runs.map((r) => {
            const s = runState(r);
            return (
              <li key={r.id}>
                <time>{fmtDateTime(r.created_at)}</time>
                <span className="flex items-center gap-1 text-ink-2" style={{ order: 2 }}>
                  <Dot color={s.color} />
                  {s.label}
                </span>
                {r.event && (
                  <span className="rounded-full bg-wash-2 px-2 py-px text-micro text-ink-2" style={{ order: 2 }}>
                    {EVENT_LABEL[r.event] ?? r.event}
                  </span>
                )}
                <a
                  href={r.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`ml-auto rounded text-garden underline-offset-2 hover:underline ${FOCUS_RING}`}
                  style={{ order: 2 }}
                >
                  voir le run
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default RebuildCard;
