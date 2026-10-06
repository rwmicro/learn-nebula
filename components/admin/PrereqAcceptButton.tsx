"use client";

// "Accepter" on a prerequisite suggestion — POST /api/admin/prereq-accept
// adds the wikilink(s) to the notes' `prerequis:` frontmatter on a new branch
// of the vault repo and opens one pull request (server/github.ts); the button
// then links to it. One item reads "Accepter", several "Accepter la
// sélection". Disabled, naming the variable, when the server has no
// PENSINE_TOKEN / GITHUB_TOKEN.

import { useEffect, useState } from "react";
import { BUTTON_CLASS, FOCUS_RING, Unauthorized } from "./shared";
import { adminJson, answerError } from "./admin-api";

export interface PrereqAcceptItem {
  /** The note's file in the vault repo (data/prereq-suggestions.json `notePath`). */
  notePath: string;
  /** Wikilink target to add (the suggestion's `link`). */
  link: string;
}

interface Status {
  enabled: boolean;
  repo: string;
  envVar: string;
}
interface Result {
  url: string | null;
  branch: string | null;
  notes: { notePath: string; added: string[]; skipped: string[] }[];
}

// One status request per token for every button on the page.
let statusCache: { token: string; promise: Promise<Status | null> } | null = null;
function loadStatus(token: string): Promise<Status | null> {
  if (statusCache?.token !== token) {
    const promise = adminJson<Status>("/api/admin/prereq-accept", token).then(
      (a) => (a.ok ? a.data : null),
      (e) => {
        statusCache = null;
        throw e;
      },
    );
    statusCache = { token, promise };
  }
  return statusCache.promise;
}

export function PrereqAcceptButton({
  token,
  onUnauthorized,
  items,
  onToast,
  onAccepted,
  label,
  disabled = false,
}: {
  token: string;
  onUnauthorized: () => void;
  items: PrereqAcceptItem[];
  onToast?: (message: string) => void;
  /** Called with the PR URL (null when everything was already listed). */
  onAccepted?: (url: string | null) => void;
  /** Overrides "Accepter" / "Accepter la sélection". */
  label?: string;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStatus(token)
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((e) => {
        if (e instanceof Unauthorized) onUnauthorized();
      });
    return () => {
      cancelled = true;
    };
  }, [token, onUnauthorized]);

  const accept = async () => {
    setBusy(true);
    try {
      const a = await adminJson<Result>("/api/admin/prereq-accept", token, {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      if (!a.ok || !a.data) {
        onToast?.(answerError(a, "Pull request impossible"));
        return;
      }
      setPrUrl(a.data.url);
      onAccepted?.(a.data.url);
      onToast?.(a.data.url ? "Pull request ouverte sur pensine." : "Déjà présent dans le frontmatter — rien à faire.");
    } catch (e) {
      if (e instanceof Unauthorized) onUnauthorized();
      else onToast?.("Pull request impossible.");
    } finally {
      setBusy(false);
    }
  };

  if (prUrl) {
    return (
      <a
        href={prUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`shrink-0 rounded px-1 py-1 text-small text-garden underline-offset-2 hover:underline ${FOCUS_RING}`}
      >
        PR #{prUrl.split("/").pop()}
      </a>
    );
  }

  const off = status !== null && !status.enabled;
  const text = label ?? (items.length > 1 ? "Accepter la sélection" : "Accepter");
  return (
    <button
      type="button"
      className={BUTTON_CLASS}
      onClick={accept}
      disabled={disabled || busy || !status || off || items.length === 0}
      title={
        off
          ? `Désactivé — définir ${status.envVar} (ou GITHUB_TOKEN) sur le serveur`
          : `Ouvrir une pull request sur ${status?.repo ?? "pensine"}`
      }
      aria-label={
        items.length > 1
          ? `${text} : ${items.length} prérequis en une pull request`
          : `${text} : ajouter ${items[0]?.link ?? ""} aux prérequis par une pull request`
      }
    >
      {busy ? "…" : text}
    </button>
  );
}

export default PrereqAcceptButton;
