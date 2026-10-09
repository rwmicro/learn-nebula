"use client";

// /progression/ — what this browser remembers (read notes, Anki card states,
// saved note questions), and the three ways to carry it elsewhere: a dated
// JSON file, a file import (validated, previewed, then merged or replacing),
// and a transfer link that holds the data compressed in its #fragment. All of
// it runs client-side; the format and merge rules are lib/progress-transfer.ts.

import { MyMarks } from "@/components/MyMarks";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { CHANGE_EVENT } from "@/lib/reading-progress";
import {
  LINK_PARAM,
  MAX_LINK_CHARS,
  PROGRESS_IMPORTED_EVENT,
  REFRESH_EVENTS,
  applyPlan,
  canCompress,
  collectProgress,
  decodeTransfer,
  downloadExport,
  encodeTransfer,
  exportText,
  hasChanges,
  payloadFromHash,
  planImport,
  progressStorage,
  summarize,
  validateImport,
  type ImportError,
  type ImportMode,
  type KindId,
  type ProgressFile,
  type Summary,
} from "@/lib/progress-transfer";
import type { AnkiDeck } from "@/lib/anki";
import { ReviewStats } from "@/components/ReviewStats";

interface Pending {
  file: ProgressFile;
  dropped: number;
  source: { kind: "file"; name: string } | { kind: "link" };
}

type Status = { tone: "ok" | "error" | "info"; text: string } | null;

const ERROR_KEY: Record<ImportError, string> = {
  json: "errJson",
  format: "errFormat",
  version: "errVersion",
  empty: "errEmpty",
};

export function Progression({ decks = [] }: { decks?: AnkiDeck[] }) {
  const locale = useLocale();
  const tr = useCallback(
    (k: string, vars?: Record<string, string | number>) =>
      t(`progression.${k}`, vars, locale),
    [locale],
  );
  // undefined: not read yet (static HTML); null: storage blocked.
  const [summary, setSummary] = useState<Summary | null | undefined>(undefined);
  const [status, setStatus] = useState<Status>(null);
  const [linkText, setLinkText] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [mode, setMode] = useState<ImportMode>("merge");
  const fileInput = useRef<HTMLInputElement>(null);
  const importBtn = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const refresh = useCallback(() => {
    const store = progressStorage();
    setSummary(store ? summarize(collectProgress(store)) : null);
  }, []);

  const openPending = useCallback((p: Pending) => {
    setMode("merge");
    setPending(p);
  }, []);

  // The confirmation is a modal <dialog>: opened once its content is there.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (pending && !d.open) d.showModal();
    else if (!pending && d.open) d.close();
  }, [pending]);

  useEffect(() => {
    refresh();
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    // Arrived with a transfer link, or from the palette's "Importer" (also
    // when the hash changes while the page is open).
    const onHash = () => {
      const hash = window.location.hash;
      const payload = payloadFromHash(hash);
      if (payload) {
        // Out of the address bar (and history) at once: the data has no
        // business staying in a URL that could be copied on.
        history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
        decodeTransfer(payload)
          .then((text) => {
            const v = validateImport(text);
            if (v.ok)
              openPending({
                file: v.file,
                dropped: v.dropped,
                source: { kind: "link" },
              });
            else setStatus({ tone: "error", text: tr(ERROR_KEY[v.error]) });
          })
          .catch(() => setStatus({ tone: "error", text: tr("errLink") }));
      } else if (hash === "#importer") {
        importBtn.current?.focus();
      }
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("hashchange", onHash);
    };
    // tr changes with the locale; the hash is only read on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, openPending]);

  const onExport = () => {
    const name = downloadExport();
    setLinkText(null);
    setStatus(
      name
        ? { tone: "ok", text: tr("exported", { file: name }) }
        : { tone: "error", text: tr("noStorage") },
    );
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // the same file can be picked again
    if (!f) return;
    setLinkText(null);
    let text: string;
    try {
      // A progress file is small; anything past 20 MB is not one.
      if (f.size > 20 * 1024 * 1024) throw new Error("size");
      text = await f.text();
    } catch {
      setStatus({ tone: "error", text: tr("errRead") });
      return;
    }
    const v = validateImport(text);
    if (!v.ok) {
      setStatus({ tone: "error", text: tr(ERROR_KEY[v.error]) });
      return;
    }
    setStatus(null);
    openPending({
      file: v.file,
      dropped: v.dropped,
      source: { kind: "file", name: f.name },
    });
  };

  const onLink = async () => {
    const store = progressStorage();
    setLinkText(null);
    if (!store) return setStatus({ tone: "error", text: tr("noStorage") });
    if (!canCompress())
      return setStatus({ tone: "error", text: tr("linkUnsupported") });
    const items = collectProgress(store);
    if (!Object.keys(items).length)
      return setStatus({ tone: "info", text: tr("nothing") });
    const payload = await encodeTransfer(exportText(store));
    const url = `${window.location.origin}/progression/#${LINK_PARAM}=${payload}`;
    if (url.length > MAX_LINK_CHARS) {
      return setStatus({
        tone: "error",
        text: tr("linkTooBig", { n: url.length, max: MAX_LINK_CHARS }),
      });
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus({ tone: "ok", text: tr("linkCopied", { n: url.length }) });
    } catch {
      setLinkText(url);
      setStatus({ tone: "info", text: tr("linkShown") });
    }
  };

  const store = typeof window === "undefined" ? null : progressStorage();
  const plan =
    pending && store
      ? planImport(collectProgress(store), pending.file.items, mode)
      : null;

  const close = (msg: Status) => {
    setPending(null);
    setStatus(msg);
    importBtn.current?.focus();
  };
  const onConfirm = () => {
    if (!plan || !store) return close({ tone: "error", text: tr("noStorage") });
    const ok = applyPlan(store, plan);
    window.dispatchEvent(new Event(CHANGE_EVENT));
    for (const e of REFRESH_EVENTS) window.dispatchEvent(new Event(e));
    window.dispatchEvent(new Event(PROGRESS_IMPORTED_EVENT));
    refresh();
    close(
      ok
        ? { tone: "ok", text: tr("done") }
        : { tone: "error", text: tr("doneError") },
    );
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    if (!iso || Number.isNaN(d.getTime())) return "—";
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "long",
        timeStyle: "short",
      }).format(d);
    } catch {
      return d.toISOString().slice(0, 16).replace("T", " ");
    }
  };

  const incoming = pending ? summarize(pending.file.items) : null;
  const kinds: [KindId, string][] = [
    ["reading", "kindReading"],
    ["decks", "kindDecks"],
    ["questions", "kindQuestions"],
    ["known", "kindKnown"],
    ["targets", "kindTargets"],
    ["bookmarks", "kindBookmarks"],
    ["highlights", "kindHighlights"],
    ["activity", "kindActivity"],
    ["reviewLog", "kindReviewLog"],
  ];

  // Nothing recorded in this browser yet: a word of welcome and a way in,
  // rather than seven zeros, an empty calendar and empty review charts.
  const fresh =
    !!summary &&
    !summary.read &&
    !summary.started &&
    !summary.cards &&
    !summary.questions &&
    !summary.known &&
    !summary.targets &&
    !summary.bookmarks &&
    !summary.highlights &&
    !summary.activeDays;

  return (
    <main className="progression" data-pagefind-ignore>
      {/* A plain link: next/link would make scripts/prune-rsc.mjs keep every RSC payload. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="progression-back">
        ← {t("nav.home", undefined, locale)}
      </a>
      <h1 className="progression-title">{tr("title")}</h1>
      <p className="progression-intro">{tr("intro")}</p>

      <section
        className="progression-summary"
        aria-labelledby="progression-summary-title"
        hidden={fresh}
      >
        <h2 id="progression-summary-title" className="progression-h2">
          {tr("summaryTitle")}
        </h2>
        {summary === null ? (
          <p className="progression-muted">{tr("noStorage")}</p>
        ) : (
          <>
            <dl className="progression-stats" aria-busy={summary === undefined}>
              <Stat n={summary?.read} label={tr("statRead")} />
              <Stat n={summary?.started} label={tr("statStarted")} />
              <Stat n={summary?.cards} label={tr("statCards")} />
              <Stat n={summary?.questions} label={tr("statQuestions")} />
              <Stat n={summary?.known} label={tr("statKnown")} />
              <Stat n={summary?.bookmarks} label={tr("statBookmarks")} />
              <Stat n={summary?.highlights} label={tr("statHighlights")} />
            </dl>
          </>
        )}
      </section>

      {fresh ? (
        <section
          className="progression-welcome"
          aria-labelledby="progression-welcome-title"
        >
          <h2
            id="progression-welcome-title"
            className="progression-welcome-title"
          >
            {tr("welcomeTitle")}
          </h2>
          <p>{tr("welcomeText")}</p>
          <p className="progression-welcome-acts">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              className="progression-btn progression-btn--primary"
              href="/parcours/"
            >
              {tr("welcomePaths")} →
            </a>
            <button
              type="button"
              className="progression-btn"
              onClick={() => fileInput.current?.click()}
            >
              {tr("welcomeImport")}
            </button>
          </p>
        </section>
      ) : (
        <>
          <MyMarks />
          <ReviewStats decks={decks} />
        </>
      )}

      <section className="progression-actions" aria-label={tr("title")}>
        <div className="progression-action">
          <h2 className="progression-h2">{tr("exportTitle")}</h2>
          <p>{tr("exportText")}</p>
          <button
            type="button"
            className="progression-btn progression-btn--primary"
            onClick={onExport}
            disabled={summary === null}
          >
            <Icon d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />
            {tr("exportButton")}
          </button>
        </div>
        <div className="progression-action">
          <h2 className="progression-h2">{tr("importTitle")}</h2>
          <p>{tr("importText")}</p>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={onFile}
          />
          <button
            ref={importBtn}
            type="button"
            className="progression-btn"
            onClick={() => fileInput.current?.click()}
            disabled={summary === null}
          >
            <Icon d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 19.5h14" />
            {tr("importButton")}
          </button>
        </div>
        <div className="progression-action">
          <h2 className="progression-h2">{tr("linkTitle")}</h2>
          <p>{tr("linkText")}</p>
          <button
            type="button"
            className="progression-btn"
            onClick={onLink}
            disabled={summary === null}
          >
            <Icon d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1" />
            {tr("linkButton")}
          </button>
        </div>
      </section>

      <p
        className={`progression-status${status ? ` is-${status.tone}` : ""}`}
        role="status"
        aria-live="polite"
      >
        {status?.text}
      </p>
      {linkText && (
        <label className="progression-link">
          <span>{tr("linkLabel")}</span>
          <textarea
            readOnly
            rows={3}
            value={linkText}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}

      <p className="progression-privacy">{tr("privacy")}</p>

      <dialog
        ref={dialog}
        className="progression-dialog"
        aria-labelledby="progression-confirm-title"
        onCancel={(e) => {
          e.preventDefault();
          close({ tone: "info", text: tr("cancelled") });
        }}
      >
        {pending && incoming && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            <h2
              id="progression-confirm-title"
              className="progression-dialog-title"
            >
              {tr("confirmTitle")}
            </h2>
            <p className="progression-muted">
              {pending.source.kind === "file"
                ? tr("fromFile", {
                    name: pending.source.name,
                    date: fmtDate(pending.file.exportedAt),
                  })
                : tr("fromLink", { date: fmtDate(pending.file.exportedAt) })}
            </p>
            <p className="progression-incoming">
              {tr("incoming")} <strong>{incoming.read}</strong> {tr("statRead")}{" "}
              · <strong>{incoming.cards}</strong> {tr("statCards")} ·{" "}
              <strong>{incoming.questions}</strong> {tr("statQuestions")}
            </p>

            <fieldset className="progression-modes">
              <legend>{tr("modeLegend")}</legend>
              {(["merge", "replace"] as const).map((m) => (
                <label
                  key={m}
                  className={`progression-mode${mode === m ? " is-on" : ""}`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                  />
                  <span>
                    <strong>
                      {tr(m === "merge" ? "modeMerge" : "modeReplace")}
                    </strong>
                    <span className="progression-mode-hint">
                      {tr(m === "merge" ? "modeMergeHint" : "modeReplaceHint")}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <h3 className="progression-h3">{tr("changesTitle")}</h3>
            {plan && hasChanges(plan) ? (
              <table className="progression-changes">
                <tbody>
                  {kinds.map(([kind, label]) => {
                    const c = plan.changes[kind];
                    if (!c.added && !c.updated && !c.removed && !c.unchanged)
                      return null;
                    return (
                      <tr key={kind}>
                        <th scope="row">{tr(label)}</th>
                        <td>
                          {c.added > 0 && (
                            <span className="is-added">
                              {tr("chAdded", { n: c.added })}
                            </span>
                          )}
                          {c.updated > 0 && (
                            <span className="is-updated">
                              {tr("chUpdated", { n: c.updated })}
                            </span>
                          )}
                          {c.removed > 0 && (
                            <span className="is-removed">
                              {tr("chRemoved", { n: c.removed })}
                            </span>
                          )}
                          {c.unchanged > 0 && (
                            <span className="is-same">
                              {tr("chUnchanged", { n: c.unchanged })}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="progression-muted">{tr("noChange")}</p>
            )}
            {pending.dropped > 0 && (
              <p className="progression-muted">
                {tr("dropped", { n: pending.dropped })}
              </p>
            )}

            <div className="progression-dialog-actions">
              <button
                type="button"
                className="progression-btn"
                onClick={() => close({ tone: "info", text: tr("cancelled") })}
              >
                {tr("cancel")}
              </button>
              <button
                type="submit"
                className={`progression-btn progression-btn--primary${mode === "replace" ? " is-danger" : ""}`}
                disabled={!plan || !hasChanges(plan)}
                autoFocus
              >
                {tr("confirm")}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </main>
  );
}

function Stat({ n, label }: { n: number | undefined; label: string }) {
  return (
    <div className="progression-stat">
      <dt>{label}</dt>
      <dd>{n === undefined ? "–" : n.toLocaleString()}</dd>
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}
