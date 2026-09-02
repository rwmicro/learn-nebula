"use client";

// A pinnable "Ask the garden" assistant. Mounted site-wide in the root layout,
// it stays hidden until the reader pins it from the home chat (the pushpin
// button dispatches "gk:pin-chat" and sets localStorage) — then it docks at the
// bottom-right and, because it lives in the layout and re-reads localStorage on
// every page load, it persists across navigation. Shares the NDJSON wire format
// with the home + note assistants via readAskStream.

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { readAskStream, type AskSource } from "@/lib/ask-stream";

const KEY = "gkChatPinned";

export function PinnedAssistant() {
  const locale = useLocale();
  const tr = (k: string) => t(k, undefined, locale);
  const [pinned, setPinned] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<AskSource[]>([]);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      setPinned(localStorage.getItem(KEY) === "1");
    } catch {
      /* localStorage unavailable */
    }
    const onPin = () => setPinned(true);
    window.addEventListener("gk:pin-chat", onPin);
    return () => window.removeEventListener("gk:pin-chat", onPin);
  }, []);
  useEffect(() => () => abortRef.current?.abort(), []);

  function unpin() {
    setPinned(false);
    try {
      localStorage.setItem(KEY, "0");
    } catch {
      /* ignore */
    }
  }

  async function ask(text: string) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAsked(true);
    setAnswer("");
    setSources([]);
    setBusy(true);

    let resp: Response;
    try {
      resp = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text, locale }),
        signal: ctrl.signal,
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setAnswer(tr("askAi.errorReach"));
      setBusy(false);
      return;
    }
    if (!resp.ok || !resp.body) {
      setAnswer(tr(resp.status === 429 ? "askAi.errorRate" : "askAi.errorUnavailable"));
      setBusy(false);
      return;
    }
    let raw = "";
    try {
      await readAskStream(resp.body, {
        onSources: (s) =>
          setSources(s.filter((x) => x && x.url && /^(https?:|\/)/.test(x.url))),
        onChunk: (t2) => {
          raw = t2;
          setAnswer(t2);
        },
        partialError: tr("askAi.errorPartial"),
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setAnswer(raw || tr("askAi.errorUnavailable"));
    }
    setBusy(false);
    if (abortRef.current === ctrl) abortRef.current = null;
  }

  if (!pinned) return null;

  return (
    <section className="gk-pinned" aria-label={tr("home.askLabel")}>
      <header className="gk-pinned-head">
        <span className="gk-pinned-title">{tr("home.askLabel")}</span>
        <button
          type="button"
          className="gk-pinned-close"
          onClick={unpin}
          aria-label={tr("home.unpinChat")}
          title={tr("home.unpinChat")}
        >
          ×
        </button>
      </header>

      {asked && (
        <div className="gk-pinned-body">
          <p className="gk-pinned-answer">
            {answer || (busy ? "…" : "")}
          </p>
          {sources.length > 0 && (
            <ul className="gk-pinned-sources">
              {sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url}>{s.title}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <form
        className="gk-pinned-form"
        onSubmit={(e) => {
          e.preventDefault();
          const text = question.trim();
          if (text && !busy) ask(text);
        }}
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={1000}
          autoComplete="off"
          disabled={busy}
          placeholder={tr("home.askPlaceholder")}
          aria-label={tr("home.askAria")}
        />
        <button type="submit" disabled={busy}>
          {tr("home.askSend")}
        </button>
      </form>
    </section>
  );
}
