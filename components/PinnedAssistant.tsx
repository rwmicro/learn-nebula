"use client";

// The single "Ask the garden" assistant. Mounted site-wide in the root layout.
//   • Home: opened (and pinned) from the "Demander au jardin" pushpin button.
//   • Notes: a floating sprout trigger opens it (the note "AI" button).
//   • Once open it docks (draggable anywhere) and persists across navigation
//     (pinned flag + last position in localStorage), so there is only ever ONE
//     assistant — clicking the note button again never spawns a second.
// Shares the NDJSON wire format with the home + note assistants via readAskStream.

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { readAskStream, type AskSource } from "@/lib/ask-stream";

const KEY = "gkChatPinned";
const POS_KEY = "gkChatPos";

const SPROUT = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 20h10" />
    <path d="M10 20c5.5-2.5.8-6.4 3-10" />
    <path d="M9 12C6 12 4 9.5 4 6c3.5 0 5 2 5 4" />
    <path d="M15 10c3 0 5-2.5 5-6-3.5 0-5 2-5 5" />
  </svg>
);

export function PinnedAssistant() {
  const locale = useLocale();
  const tr = (k: string) => t(k, undefined, locale);
  const [pinned, setPinned] = useState(false);
  const [isNote, setIsNote] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<AskSource[]>([]);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    try {
      setPinned(localStorage.getItem(KEY) === "1");
      const raw = localStorage.getItem(POS_KEY);
      if (raw) setPos(JSON.parse(raw));
    } catch {
      /* localStorage unavailable */
    }
    setIsNote(location.pathname.startsWith("/posts/"));
    const onPin = () => open();
    window.addEventListener("gk:pin-chat", onPin);
    return () => window.removeEventListener("gk:pin-chat", onPin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => abortRef.current?.abort(), []);

  function open() {
    setPinned(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  }
  function close() {
    setPinned(false);
    try {
      localStorage.setItem(KEY, "0");
    } catch {
      /* ignore */
    }
  }

  // --- drag by the header (like the note assistant) ------------------------
  function onHeadPointerDown(e: ReactPointerEvent) {
    if ((e.target as Element).closest("button")) return; // let the × through
    const el = panelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onHeadPointerMove(e: ReactPointerEvent) {
    if (!drag.current) return;
    const el = panelRef.current;
    const w = el?.offsetWidth ?? 320;
    const h = el?.offsetHeight ?? 200;
    const left = Math.max(4, Math.min(window.innerWidth - w - 4, e.clientX - drag.current.dx));
    const top = Math.max(4, Math.min(window.innerHeight - h - 4, e.clientY - drag.current.dy));
    setPos({ left, top });
  }
  function onHeadPointerUp(e: ReactPointerEvent) {
    if (drag.current && pos) {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(pos));
      } catch {
        /* ignore */
      }
    }
    drag.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
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

  // Note pages get a trigger (the "AI" button) when the assistant isn't open.
  if (!pinned) {
    if (!isNote) return null;
    return (
      <button type="button" className="gk-pinned-trigger" onClick={open}>
        {SPROUT}
        <span>{tr("askAi.trigger")}</span>
      </button>
    );
  }

  const style = pos ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" } : undefined;

  return (
    <section
      ref={panelRef}
      className="gk-pinned"
      style={style}
      aria-label={tr("home.askLabel")}
    >
      <header
        className="gk-pinned-head"
        onPointerDown={onHeadPointerDown}
        onPointerMove={onHeadPointerMove}
        onPointerUp={onHeadPointerUp}
        onPointerLeave={onHeadPointerUp}
      >
        <span className="gk-pinned-grip" aria-hidden="true">{SPROUT}</span>
        <span className="gk-pinned-title">{tr("home.askLabel")}</span>
        <button
          type="button"
          className="gk-pinned-close"
          onClick={close}
          aria-label={tr("home.unpinChat")}
          title={tr("home.unpinChat")}
        >
          ×
        </button>
      </header>

      {asked && (
        <div className="gk-pinned-body">
          <p className="gk-pinned-answer">{answer || (busy ? "…" : "")}</p>
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
