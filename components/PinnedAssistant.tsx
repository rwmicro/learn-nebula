"use client";

// The single "Ask the garden" assistant. Mounted site-wide in the root layout.
//   • Home: opened (and pinned) from the "Demander au jardin" pushpin button.
//   • Notes: a floating sprout trigger opens it (the note "AI" button), and
//     the selection toolbar's "Expliquer" (public/js/selection-menu.js, a
//     `gk:explain` event) opens it with the passage pinned as context and
//     asks for an explanation straight away. Elsewhere, selecting text shows
//     an "ask about this" button that pins the passage.
//   • Once open it docks — draggable by its header, resizable by its top-left
//     corner — and persists across navigation (pinned flag, position and size in
//     localStorage). There is only ever ONE assistant.
//   • "Avec mes mots" in the selection toolbar (`gk:explain-own`) switches it
//     to "explique-le avec tes mots": the reader explains the pinned passage
//     and gets feedback (POST /api/ask/explain). The "Socratique" toggle makes
//     the assistant answer with questions (`socratic: true`).
//   • Chrome's on-device AI (lib/browser-ai.ts) first, where present: the
//     question's language is detected and sent as `lang`, and the explain /
//     socratic-on-a-passage answers run on the device's model when it covers
//     the language — the server answers everything else.
// Shares the NDJSON wire format with the home assistant via readAskStream.

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { readAskStream, type AskSource } from "@/lib/ask-stream";
import { markdownToHtml } from "@/lib/markdown-lite";
import { detectLanguage, promptAvailable, promptOnDevice } from "@/lib/browser-ai";
import {
  ASK_LANG_NAMES,
  MAX_EXPLAIN_TEXT,
  SOCRATIC_RULES,
  explainSystem,
  explainUser,
  replyLangHint,
} from "@/lib/ask-prompts";
// Type-only: erased at build, so lib/content.ts (node:fs) never reaches the bundle.
import type { ScopeOption } from "@/lib/content";

const KEY = "gkChatPinned";
const POS_KEY = "gkChatPos";
const SIZE_KEY = "gkChatSize";
const SCOPE_KEY = "gkChatScope";
const SOCRATIC_KEY = "gkChatSocratic";

/** System prompt for a socratic answer on the device, grounded on the pinned
 *  passage alone (the device has no access to the notes index). */
function socraticDeviceSystem(lang: string): string {
  return [
    "Tu es l'assistant de « Garden of Knowledge », un jardin de notes personnel.",
    "- Appuie-toi uniquement sur le passage fourni par l'utilisateur.",
    SOCRATIC_RULES,
    lang ? `- Réponds en ${ASK_LANG_NAMES[lang]}.` : "- Réponds dans la langue de la question.",
  ].join("\n");
}

const SPROUT = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 20h10" />
    <path d="M10 20c5.5-2.5.8-6.4 3-10" />
    <path d="M9 12C6 12 4 9.5 4 6c3.5 0 5 2 5 4" />
    <path d="M15 10c3 0 5-2.5 5-6-3.5 0-5 2-5 5" />
  </svg>
);

export function PinnedAssistant({ scopes = [] }: { scopes?: ScopeOption[] }) {
  const locale = useLocale();
  const tr = (k: string) => t(k, undefined, locale);
  const [pinned, setPinned] = useState(false);
  const [isNote, setIsNote] = useState(false);
  // Anchored by right/bottom offsets (not left/top) so growing content — a
  // streamed answer or a pinned passage — extends UPWARD instead of pushing the
  // panel off the bottom of the screen.
  const [pos, setPos] = useState<{ right: number; bottom: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<AskSource[]>([]);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState("");
  // Retrieval scope: "" = the whole garden, else a language folder slug.
  const [scope, setScope] = useState("");
  const [candidate, setCandidate] = useState<{ text: string; x: number; y: number } | null>(null);
  // "ask" = questions; "own" = the reader explains the pinned passage.
  const [mode, setMode] = useState<"ask" | "own">("ask");
  const [socratic, setSocratic] = useState(false);
  // The last answer came from the device's model, not the server.
  const [onDevice, setOnDevice] = useState(false);
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const rez = useRef<{ right: number; bottom: number } | null>(null);
  // Latest ask(), for the window-level `gk:explain` listener below.
  const askRef = useRef<(text: string, sel?: string) => void>(() => {});

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

  useEffect(() => {
    try {
      setPinned(localStorage.getItem(KEY) === "1");
      const p = localStorage.getItem(POS_KEY);
      if (p) setPos(JSON.parse(p));
      const s = localStorage.getItem(SIZE_KEY);
      if (s) setSize(JSON.parse(s));
    } catch {
      /* localStorage unavailable */
    }
    setIsNote(location.pathname.startsWith("/posts/"));
    const onPin = () => open();
    // "Expliquer" from the note selection toolbar: pin the passage, open,
    // and ask the server's default "explain this passage" question (an
    // empty question + a selection — /api/ask fills it in the reply language).
    const onExplain = (e: Event) => {
      const text = String((e as CustomEvent<{ text?: string }>).detail?.text ?? "")
        .trim()
        .slice(0, 4000);
      if (!text) return;
      setSelection(text);
      setQuestion("");
      setMode("ask");
      open();
      askRef.current("", text);
    };
    // "Avec mes mots": pin the passage and wait for the reader's explanation.
    const onExplainOwn = (e: Event) => {
      const text = String((e as CustomEvent<{ text?: string }>).detail?.text ?? "")
        .trim()
        .slice(0, 4000);
      if (!text) return;
      abortRef.current?.abort();
      setSelection(text);
      setQuestion("");
      setAnswer("");
      setSources([]);
      setAsked(false);
      setBusy(false);
      setMode("own");
      open();
      requestAnimationFrame(() => ownRef.current?.focus());
    };
    try {
      setSocratic(localStorage.getItem(SOCRATIC_KEY) === "1");
    } catch {
      /* localStorage unavailable */
    }
    window.addEventListener("gk:pin-chat", onPin);
    window.addEventListener("gk:explain", onExplain);
    window.addEventListener("gk:explain-own", onExplainOwn);
    return () => {
      window.removeEventListener("gk:pin-chat", onPin);
      window.removeEventListener("gk:explain", onExplain);
      window.removeEventListener("gk:explain-own", onExplainOwn);
    };
  }, []);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Pick the retrieval scope: the language folder of the note being read wins
  // (asking "comment se forme la négation ?" inside a Kabyle note should search
  // Kabyle, not all 18 languages), otherwise the last explicit choice.
  useEffect(() => {
    let stored = "";
    try {
      stored = localStorage.getItem(SCOPE_KEY) ?? "";
    } catch {
      /* localStorage unavailable */
    }
    const here = scopes.find((s) => location.pathname.startsWith(`/posts/${s.slug}/`));
    setScope(here ? here.slug : scopes.some((s) => s.slug === stored) ? stored : "");
  }, [scopes]);

  function toggleSocratic(on: boolean) {
    setSocratic(on);
    try {
      localStorage.setItem(SOCRATIC_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function chooseScope(value: string) {
    setScope(value);
    try {
      localStorage.setItem(SCOPE_KEY, value);
    } catch {
      /* ignore */
    }
  }

  // --- "ask about a selection" (notes) -------------------------------------
  useEffect(() => {
    function check() {
      // Note pages have their own selection toolbar (selection-menu.js).
      if (location.pathname.startsWith("/posts/")) return setCandidate(null);
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return setCandidate(null);
      const text = sel.toString().trim();
      if (text.length < 2 || text.length > 4000) return setCandidate(null);
      const node = sel.anchorNode;
      const el = node && (node.nodeType === 1 ? (node as Element) : node.parentElement);
      const main = document.getElementById("main");
      if (!main || !el || !main.contains(el) || el.closest(".gk-pinned")) {
        return setCandidate(null);
      }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) return setCandidate(null);
      setCandidate({
        text,
        x: Math.max(6, Math.min(r.left, window.innerWidth - 170)),
        y: Math.max(6, r.top - 40),
      });
    }
    const onUp = () => requestAnimationFrame(check);
    const onSelChange = () => {
      const s = window.getSelection();
      if (!s || s.isCollapsed) setCandidate(null);
    };
    const onScroll = () => setCandidate(null);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("selectionchange", onSelChange);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("selectionchange", onSelChange);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // --- drag by the header --------------------------------------------------
  function onHeadDown(e: ReactPointerEvent) {
    if ((e.target as Element).closest("button, label, input")) return;
    const el = panelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onHeadMove(e: ReactPointerEvent) {
    if (!drag.current) return;
    const el = panelRef.current;
    const w = el?.offsetWidth ?? 320;
    const h = el?.offsetHeight ?? 200;
    const left = e.clientX - drag.current.dx;
    const top = e.clientY - drag.current.dy;
    setPos({
      right: Math.max(4, Math.min(window.innerWidth - w - 4, window.innerWidth - left - w)),
      bottom: Math.max(4, Math.min(window.innerHeight - h - 4, window.innerHeight - top - h)),
    });
  }
  function onHeadUp(e: ReactPointerEvent) {
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

  // --- resize by the top-left corner (grows into the screen) ---------------
  function onRezDown(e: ReactPointerEvent) {
    const el = panelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    rez.current = { right: r.right, bottom: r.bottom };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    e.stopPropagation();
  }
  function onRezMove(e: ReactPointerEvent) {
    if (!rez.current) return;
    const maxW = Math.min(window.innerWidth * 0.92, 900);
    const maxH = window.innerHeight * 0.88;
    const w = Math.max(300, Math.min(maxW, rez.current.right - e.clientX));
    const h = Math.max(180, Math.min(maxH, rez.current.bottom - e.clientY));
    // Right/bottom-anchored, so a larger size already grows up-left — no
    // reposition needed.
    setSize({ w, h });
  }
  function onRezUp(e: ReactPointerEvent) {
    if (rez.current && size) {
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify(size));
      } catch {
        /* ignore */
      }
    }
    rez.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  }

  // Only for the default "Explain this passage." filler question (asked with
  // no typed text — see ask()'s call site): picking it from `locale` (the
  // site's UI language) meant a reader who never touched the language switcher
  // — so `locale` sits at its French build default — got a French filler
  // regardless of what language they actually read in. A saved locale choice
  // is a real signal and wins; absent that, the browser/OS language is a much
  // better guess than always falling back to French. Doesn't affect `locale`
  // itself, which still (correctly) drives this component's own UI strings.
  function preferredReplyLocale(): string {
    try {
      const saved = localStorage.getItem("locale");
      if (saved) return saved;
    } catch {
      /* localStorage unavailable */
    }
    return (navigator.language || "fr").slice(0, 2).toLowerCase();
  }

  /** Run one prompt on the device's model when it covers `lang`; false when
   *  it doesn't (or fails before answering), so the caller asks the server. */
  async function tryDevice(ctrl: AbortController, lang: string, system: string, prompt: string) {
    if (!(await promptAvailable(lang))) return false;
    try {
      const out = await promptOnDevice({
        system,
        prompt,
        lang,
        signal: ctrl.signal,
        onText: (t2) => setAnswer(t2),
        onDownload: (f) => setAnswer(t("askAi.deviceDownloading", { n: Math.round(f * 100) }, locale)),
      });
      if (!out) return false;
      setAnswer(out);
      setOnDevice(true);
      setBusy(false);
      if (abortRef.current === ctrl) abortRef.current = null;
      return true;
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return true; // superseded
      return false;
    }
  }

  async function ask(text: string, sel: string = selection) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAsked(true);
    setAnswer("");
    setSources([]);
    setOnDevice(false);
    setBusy(true);

    // The question's own language (on-device detector; null when absent or
    // unsure, the server then follows the question).
    const lang = replyLangHint((await detectLanguage(text, { allowDownload: true })) ?? "");
    if (ctrl.signal.aborted) return;
    // Socratic on a pinned passage: the passage is all the grounding needed,
    // so the device's model can take it.
    if (socratic && sel) {
      const prompt = `Passage :\n« ${sel} »\n\nQuestion : ${text || tr("askAi.socraticDefault")}`;
      if (await tryDevice(ctrl, lang || preferredReplyLocale(), socraticDeviceSystem(lang), prompt)) return;
    }

    let resp: Response;
    try {
      resp = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: text,
          selection: sel || undefined,
          locale: preferredReplyLocale(),
          scope: scope || undefined,
          lang: lang || undefined,
          socratic: socratic || undefined,
        }),
        signal: ctrl.signal,
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setAnswer(tr("askAi.errorReach"));
      setBusy(false);
      return;
    }
    await readAnswer(resp, ctrl);
  }

  // "Explique-le avec tes mots": feedback on the reader's explanation of the
  // pinned passage — on the device when it can, else POST /api/ask/explain.
  async function explainOwn(text: string) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAsked(true);
    setAnswer("");
    setSources([]);
    setOnDevice(false);
    setBusy(true);
    const passage = selection;
    const title =
      document.querySelector("main h1")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 200) ?? "";
    const lang = replyLangHint((await detectLanguage(text, { allowDownload: true })) ?? "");
    if (ctrl.signal.aborted) return;
    if (
      await tryDevice(
        ctrl,
        lang || preferredReplyLocale(),
        explainSystem(lang),
        explainUser(passage, text, title),
      )
    )
      return;
    let resp: Response;
    try {
      resp = await fetch("/api/ask/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passage, explanation: text, title, lang: lang || undefined }),
        signal: ctrl.signal,
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setAnswer(tr("askAi.errorReach"));
      setBusy(false);
      return;
    }
    await readAnswer(resp, ctrl);
  }

  async function readAnswer(resp: Response, ctrl: AbortController) {
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

  // Keep the `gk:explain` listener on the latest ask() (it reads `scope`).
  useEffect(() => {
    askRef.current = ask;
  });

  // The "ask about this passage" button floats near a text selection on notes.
  const selBtn = candidate && (
    <button
      type="button"
      className="gk-sel-btn"
      style={{ left: candidate.x, top: candidate.y }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        setSelection(candidate.text);
        open();
        setCandidate(null);
        window.getSelection()?.removeAllRanges();
        requestAnimationFrame(() => inputRef.current?.focus());
      }}
    >
      {SPROUT}
      <span>{tr("askAi.selButton")}</span>
    </button>
  );

  if (!pinned) {
    return (
      <>
        {selBtn}
        {isNote && (
          <button type="button" className="gk-pinned-trigger" onClick={open}>
            {SPROUT}
            <span className="gk-pinned-trigger-label">{tr("askAi.trigger")}</span>
          </button>
        )}
      </>
    );
  }

  const style: React.CSSProperties = {
    ...(pos ? { right: pos.right, bottom: pos.bottom, left: "auto", top: "auto" } : {}),
    ...(size ? { width: size.w, height: size.h, maxHeight: "92vh" } : {}),
  };

  return (
    <>
      {selBtn}
      <section ref={panelRef} className="gk-pinned" style={style} aria-label={tr("home.askLabel")}>
        <span
          className="gk-pinned-resize"
          aria-hidden="true"
          onPointerDown={onRezDown}
          onPointerMove={onRezMove}
          onPointerUp={onRezUp}
          onPointerLeave={onRezUp}
        />
        <header
          className="gk-pinned-head"
          onPointerDown={onHeadDown}
          onPointerMove={onHeadMove}
          onPointerUp={onHeadUp}
          onPointerLeave={onHeadUp}
        >
          <span className="gk-pinned-grip" aria-hidden="true">{SPROUT}</span>
          <span className="gk-pinned-title">{tr("home.askLabel")}</span>
          {mode === "ask" && (
            <label className="gk-pinned-socratic" title={tr("askAi.socraticHint")}>
              <input
                type="checkbox"
                checked={socratic}
                onChange={(e) => toggleSocratic(e.target.checked)}
              />
              <span>{tr("askAi.socratic")}</span>
            </label>
          )}
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

        {/* Conversation area — always present so the input stays pinned at the
            bottom of the panel (chat layout), with answers/sources above it. */}
        <div className="gk-pinned-body">
          {selection && (
            <div className="gk-pinned-chip">
              <span>{selection.length > 90 ? selection.slice(0, 90) + "…" : selection}</span>
              <button
                type="button"
                onClick={() => {
                  setSelection("");
                  setMode("ask");
                }}
                aria-label={tr("askAi.removeChipAria")}
              >
                ×
              </button>
            </div>
          )}
          {asked ? (
            busy ? (
              // Plain text while streaming: a partial, unbalanced `**` or `[`
              // would render wrong mid-stream. Muted live region so screen
              // readers don't re-announce every chunk.
              <p className="gk-pinned-answer" aria-live="off">
                {answer || "…"}
              </p>
            ) : (
              // A <div>, not <p>: markdownToHtml emits block-level tags
              // (<p>, <ul>, <ol>) — nesting those inside a <p> is invalid HTML.
              <div
                className="gk-pinned-answer"
                aria-live="polite"
                dangerouslySetInnerHTML={{ __html: markdownToHtml(answer) }}
              />
            )
          ) : mode === "own" ? (
            <p className="gk-pinned-hint">{tr("askAi.ownIntro")}</p>
          ) : (
            !selection && <p className="gk-pinned-hint">{tr("home.askIntro")}</p>
          )}
          {asked && !busy && onDevice && (
            <p className="gk-pinned-device">{tr("askAi.onDevice")}</p>
          )}
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

        {/* Retrieval scope. Sits just above the input: it qualifies the question
            you're about to ask, and keeps a query about one language from
            retrieving chunks of the seventeen others. */}
        {mode === "ask" && scopes.length > 0 && (
          <div className="gk-pinned-scope">
            <label htmlFor="gk-chat-scope">{tr("askAi.scopeLabel")}</label>
            <select
              id="gk-chat-scope"
              value={scope}
              onChange={(e) => chooseScope(e.target.value)}
            >
              <option value="">{tr("askAi.scopeAll")}</option>
              {scopes.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <form
          className={mode === "own" ? "gk-pinned-form gk-pinned-form--own" : "gk-pinned-form"}
          onSubmit={(e) => {
            e.preventDefault();
            const text = question.trim();
            if (mode === "own") {
              if (text && selection && !busy) explainOwn(text);
              return;
            }
            if ((text || selection) && !busy) ask(text);
          }}
        >
          {mode === "own" ? (
            <textarea
              ref={ownRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter breaks the line (as in the input).
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={3}
              maxLength={MAX_EXPLAIN_TEXT}
              disabled={busy}
              placeholder={tr("askAi.ownPlaceholder")}
              aria-label={tr("askAi.ownAria")}
            />
          ) : (
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={1000}
            autoComplete="off"
            disabled={busy}
            placeholder={selection ? tr("askAi.placeholderWithSelection") : tr("home.askPlaceholder")}
            aria-label={tr("home.askAria")}
          />
          )}
          <button type="submit" disabled={busy}>
            {tr("home.askSend")}
          </button>
        </form>
      </section>
    </>
  );
}
