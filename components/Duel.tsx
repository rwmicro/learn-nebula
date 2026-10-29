"use client";

import { SCENES } from "@/lib/deco-art";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { dayKey } from "@/lib/srs";
import { encodeQr, qrPath } from "@/lib/qr";
import {
  DUEL_MAX,
  ROUND_MS,
  dayIndex,
  duelOrder,
  fnv1a,
  parseHash,
  pointFor,
  tally,
  type Answer,
  type DuoMsg,
  type Round,
} from "@/lib/duel";
import {
  DuoLink,
  createRoom,
  duoSupported,
  fetchIce,
  micSupported,
  type DuoError,
  type DuoRoom,
  type IceInfo,
} from "@/lib/duo-rtc";
import { AppBack } from "@/components/AppBack";

// /duel/#<code> — two readers, two browsers, in direct contact (WebRTC):
// a revision duel on a note's multiple-choice questions, or a language
// tandem (an audio call with a shared phrase). The room code stays in the
// hash, so it never reaches a server log through a page request; the
// creator's first load also carries the host key (`#<code>~<key>`), moved
// to sessionStorage and dropped from the address at once, so the address
// bar shows the guest link. Nothing is stored server-side and nothing pays
// coins (lib/duel.ts).

interface Question {
  q: string;
  choices: { html: string; ok: boolean }[];
}
interface Phrase {
  text: string;
  src: string | null;
}
interface NoteData {
  title: string;
  questions: Question[];
  phrases: Phrase[];
}

type Phase =
  | "init"
  | "landing"
  | "unsupported"
  | "badlink"
  | "joining"
  | "consent"
  | "linking"
  | "live"
  | "ended"
  | "error";

const REVEAL_MS = 2600;

/** A note fragment ready to show here: KaTeX keeps its MathML (rendered
 *  natively), drops its HTML copy (its CSS isn't on this page). */
function clean(el: Element): string {
  const c = el.cloneNode(true) as Element;
  c.querySelectorAll(".katex-html, script, style, iframe, button, .quiz-why").forEach((n) => n.remove());
  c.querySelectorAll("*").forEach((n) => {
    for (const a of Array.from(n.attributes)) if (/^on/i.test(a.name)) n.removeAttribute(a.name);
  });
  return c.innerHTML.trim();
}

async function loadNote(ref: string): Promise<NoteData> {
  const r = await fetch(`/posts/${ref.split("/").map(encodeURIComponent).join("/")}/`);
  if (!r.ok) throw new Error(String(r.status));
  const doc = new DOMParser().parseFromString(await r.text(), "text/html");
  const body = doc.querySelector(".article-body") ?? doc.body;
  const questions: Question[] = [];
  body.querySelectorAll(".callout-quiz.quiz--choice").forEach((card) => {
    const qEl = card.querySelector(".quiz-question");
    const choices = Array.from(card.querySelectorAll(".quiz-choice")).map((b) => ({
      html: clean(b.querySelector(".quiz-choice-text") ?? b),
      ok: b.getAttribute("data-ok") === "1",
    }));
    if (qEl && choices.length >= 2 && choices.some((c) => c.ok)) questions.push({ q: clean(qEl), choices });
  });
  const seen = new Set<string>();
  const phrases: Phrase[] = [];
  body.querySelectorAll(".pron").forEach((p) => {
    const text = p.querySelector(".pron-label")?.textContent?.trim() ?? "";
    if (!text || text.length > 160 || seen.has(text)) return;
    seen.add(text);
    const src = p.querySelector(".pron-btn")?.getAttribute("data-pron-src") ?? null;
    phrases.push({ text, src: src && /^\/(?!\/)/.test(src) ? src : null });
  });
  const title = doc.querySelector("main h1")?.textContent?.trim() || doc.title.split(" · ")[0] || ref;
  return { title, questions, phrases };
}

const signature = (qs: Question[]) => fnv1a(qs.map((q) => q.q + q.choices.map((c) => c.html).join("|")).join("\n"));

function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

function readKey(code: string): string | null {
  try {
    return sessionStorage.getItem(`duo:key:${code}`);
  } catch {
    return null;
  }
}

function QrCodeView({ text, label }: { text: string; label: string }) {
  const qr = useMemo(() => {
    try {
      return encodeQr(text, "M");
    } catch {
      return null;
    }
  }, [text]);
  if (!qr) return null;
  const n = qr.size + 8;
  return (
    <svg className="duo-qr" viewBox={`0 0 ${n} ${n}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      <path d={qrPath(qr, 4)} fill="#000" />
    </svg>
  );
}

export function Duel() {
  const locale = useLocale();
  const tr = useCallback((k: string, v?: Record<string, string | number>) => t(k, v, locale), [locale]);

  const [phase, setPhase] = useState<Phase>("init");
  const [err, setErr] = useState<DuoError | "offline" | "mic" | "load" | "mismatch" | "create" | null>(null);
  const [room, setRoom] = useState<DuoRoom | null>(null);
  const [peerHere, setPeerHere] = useState(false);
  const [ice, setIce] = useState<IceInfo | null>(null);
  const [relay, setRelay] = useState(false);
  const [note, setNote] = useState<NoteData | null>(null);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [, bump] = useState(0);
  const rerender = () => bump((n) => n + 1);

  const linkRef = useRef<DuoLink | null>(null);
  const noteRef = useRef<NoteData | null>(null);
  const roomRef = useRef<DuoRoom | null>(null);

  // --- duel state (mutable; rerender() after each change) ---
  const game = useRef({
    order: [] as number[],
    rounds: [] as Round[],
    i: -1,
    stage: "wait" as "wait" | "question" | "reveal" | "end",
    t0: 0,
    timer: 0 as unknown as ReturnType<typeof setTimeout>,
    next: 0 as unknown as ReturnType<typeof setTimeout>,
    peerSig: null as string | null,
  });
  // --- tandem state ---
  const call = useRef({ muted: false, theyMuted: false, phrase: 0, stream: null as MediaStream | null });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const myRole = room?.role ?? "guest";
  const theirRole = myRole === "host" ? "guest" : "host";

  // ---- duel flow ---------------------------------------------------------

  const showRound = useCallback((i: number) => {
    const g = game.current;
    clearTimeout(g.timer);
    clearTimeout(g.next);
    g.i = i;
    g.stage = "question";
    g.t0 = performance.now();
    g.timer = setTimeout(() => answer(-1), ROUND_MS);
    rerender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settle = useCallback(() => {
    const g = game.current;
    const r = g.rounds[g.i];
    if (!r || g.stage !== "question" || !r.host || !r.guest) return;
    clearTimeout(g.timer);
    g.stage = "reveal";
    rerender();
    if (roomRef.current?.role !== "host") return;
    g.next = setTimeout(() => {
      const ln = linkRef.current;
      if (g.i + 1 < g.order.length) {
        ln?.send({ t: "q", i: g.i + 1 });
        showRound(g.i + 1);
      } else {
        ln?.send({ t: "end" });
        g.stage = "end";
        rerender();
      }
    }, REVEAL_MS);
  }, [showRound]);


  function answer(c: number) {
    const g = game.current;
    const role = roomRef.current?.role;
    if (!role || g.stage !== "question") return;
    const r = g.rounds[g.i];
    if (!r || r[role]) return;
    const ms = c < 0 ? ROUND_MS : Math.min(ROUND_MS, Math.max(0, Math.round(performance.now() - g.t0)));
    const a: Answer = { c, ms };
    r[role] = a;
    linkRef.current?.send({ t: "a", i: g.i, c, ms });
    rerender();
    settle();
  }

  const startGame = useCallback(
    (seed: number, count: number) => {
      const qs = noteRef.current?.questions ?? [];
      const g = game.current;
      g.order = duelOrder(qs.length, seed, count);
      g.rounds = g.order.map((qi) => ({ ok: qs[qi].choices.map((c) => c.ok) }));
      showRound(0);
    },
    [showRound],
  );

  const hostStart = useCallback(() => {
    const qs = noteRef.current?.questions ?? [];
    const seed = randomSeed();
    const count = Math.min(DUEL_MAX, qs.length);
    linkRef.current?.send({ t: "start", seed, count });
    startGame(seed, count);
  }, [startGame]);

  const onMessage = useCallback(
    (m: DuoMsg) => {
      const g = game.current;
      const role = roomRef.current?.role;
      const qs = noteRef.current?.questions ?? [];
      switch (m.t) {
        case "ready":
          g.peerSig = m.sig;
          if (role === "host") {
            if (m.sig !== signature(qs) || m.n !== qs.length) {
              linkRef.current?.send({ t: "mismatch" });
              setErr("mismatch");
            } else hostStart();
          }
          break;
        case "mismatch":
          setErr("mismatch");
          break;
        case "start":
          if (role === "guest" && m.count <= qs.length) startGame(m.seed, m.count);
          break;
        case "q":
          if (role === "guest" && m.i < g.order.length) showRound(m.i);
          break;
        case "a": {
          const r = g.rounds[m.i];
          const other = role === "host" ? "guest" : "host";
          if (r && !r[other] && m.c < r.ok.length) {
            r[other] = { c: m.c, ms: m.ms };
            rerender();
            if (m.i === g.i) settle();
          }
          break;
        }
        case "end":
          if (role === "guest") {
            clearTimeout(g.timer);
            g.stage = "end";
            rerender();
          }
          break;
        case "phrase": {
          const n = noteRef.current?.phrases.length ?? 0;
          if (m.i < n) call.current.phrase = m.i;
          rerender();
          break;
        }
        case "mute":
          call.current.theyMuted = m.on;
          rerender();
          break;
      }
    },
    [hostStart, settle, showRound, startGame],
  );

  // ---- connection ----------------------------------------------------------

  // Another room's link opened in this tab (or a new room made here): a hash
  // change alone doesn't reload the page, so start over for it.
  useEffect(() => {
    const other = () => location.reload();
    window.addEventListener("hashchange", other);
    return () => window.removeEventListener("hashchange", other);
  }, []);

  useEffect(() => {
    if (!duoSupported()) {
      setPhase("unsupported");
      return;
    }
    const h = parseHash(location.hash);
    if (!location.hash || location.hash === "#") {
      setPhase("landing");
      return;
    }
    if (!h) {
      setPhase("badlink");
      return;
    }
    if (h.key) {
      try {
        sessionStorage.setItem(`duo:key:${h.code}`, h.key);
      } catch {
        /* no storage: the key stays only in this load */
      }
    }
    // The address bar (and a copied URL) is the guest link from now on.
    history.replaceState(null, "", `${location.pathname}#${h.code}`);
    const key = h.key ?? readKey(h.code);
    setLink(`${location.origin}/duel/#${h.code}`);
    setPhase("joining");
    let cancelled = false;
    void fetchIce().then((info) => {
      if (cancelled) return;
      setIce(info);
      if (!info.ok) {
        setErr("offline");
        setPhase("error");
        return;
      }
      const ln = new DuoLink(h.code, key, {
        room(r, here) {
          roomRef.current = r;
          setRoom(r);
          setPeerHere(here);
          setPhase("consent");
          if (r.ref)
            loadNote(r.ref)
              .then((n) => {
                noteRef.current = n;
                call.current.phrase = dayIndex(dayKey(), n.phrases.length);
                setNote(n);
              })
              .catch(() => r.kind === "duel" && setErr("load"));
        },
        peer: (on) => setPeerHere(on),
        linking: () => setPhase("linking"),
        open() {
          setPhase("live");
          const n = noteRef.current;
          if (roomRef.current?.kind === "duel" && n)
            linkRef.current?.send({ t: "ready", sig: signature(n.questions), n: n.questions.length });
        },
        closed() {
          clearTimeout(game.current.timer);
          clearTimeout(game.current.next);
          setPhase("ended");
        },
        error(e) {
          setErr(e);
          setPhase(e === "failed" ? "consent" : "error");
        },
        message: (m) => onMessage(m),
        track(s) {
          if (audioRef.current) {
            audioRef.current.srcObject = s;
            void audioRef.current.play().catch(() => {});
          }
        },
      });
      linkRef.current = ln;
      ln.join();
    });
    const bye = () => linkRef.current?.close();
    window.addEventListener("pagehide", bye);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", bye);
      linkRef.current?.close();
      clearTimeout(game.current.timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      clearTimeout(game.current.next);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    const ln = linkRef.current;
    if (!ln || !ice || !room) return;
    setErr(null);
    let stream: MediaStream | null = call.current.stream;
    if (room.kind === "tandem" && !stream) {
      if (!micSupported()) {
        setErr("mic");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        call.current.stream = stream;
      } catch {
        setErr("mic");
        return;
      }
    }
    setPhase("linking");
    ln.start(ice, relay, stream);
  }

  async function newRoom(kind: "duel" | "tandem", ref: string | null) {
    setCreating(true);
    const url = await createRoom(kind, ref);
    setCreating(false);
    if (!url) {
      setErr("create");
      return;
    }
    // A hash change: the hashchange listener above reloads into the room.
    location.href = url;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link stays selectable */
    }
  }

  function toggleMute() {
    const c = call.current;
    c.muted = !c.muted;
    c.stream?.getAudioTracks().forEach((tk) => (tk.enabled = !c.muted));
    linkRef.current?.send({ t: "mute", on: c.muted });
    rerender();
  }

  function nextPhrase() {
    const n = note?.phrases.length ?? 0;
    if (n < 2) return;
    let i = call.current.phrase;
    while (i === call.current.phrase) i = Math.floor(Math.random() * n);
    call.current.phrase = i;
    linkRef.current?.send({ t: "phrase", i });
    rerender();
  }

  function hangUp() {
    linkRef.current?.close();
    clearTimeout(game.current.timer);
    clearTimeout(game.current.next);
    setPhase("ended");
  }

  // ---- views -------------------------------------------------------------

  const kind = room?.kind ?? "duel";
  const g = game.current;
  const errText = err
    ? err === "failed"
      ? tr(ice?.relay && !relay ? "duo.failed" : "duo.failedNoRelay")
      : tr(`duo.err.${err}`)
    : "";

  const noteLink = room?.ref ? `/posts/${room.ref}/` : null;

  const shareBlock = (
    <section className="duo-card duo-share">
      {/* A table with a board and a chair for the guest (lib/deco-art.ts). */}
      <div className="duo-scene deco" dangerouslySetInnerHTML={{ __html: SCENES.duel }} />
      <h2 className="duo-share-h">{tr(peerHere ? "duo.peerHere" : "duo.chairTitle")}</h2>
      <p>{tr("duo.share")}</p>
      <div className="duo-link">
        <input readOnly value={link} aria-label={tr("duo.linkAria")} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="duo-btn" onClick={copy}>
          {tr(copied ? "duo.copied" : "duo.copy")}
        </button>
      </div>
      {link && <QrCodeView text={link} label={tr("duo.qrAria")} />}
      <p className="duo-status" aria-live="polite">
        {tr(peerHere ? "duo.peerHere" : "duo.waiting")}
      </p>
    </section>
  );

  let body: React.ReactNode = null;

  if (phase === "init" || phase === "joining") {
    body = <p className="duo-muted">{tr("duo.joining")}</p>;
  } else if (phase === "unsupported") {
    body = <p className="duo-card">{tr("duo.unsupported")}</p>;
  } else if (phase === "badlink") {
    body = <p className="duo-card">{tr("duo.err.badlink")}</p>;
  } else if (phase === "landing") {
    body = (
      <>
        <p className="duo-lede">{tr("duo.landingLede")}</p>
        <section className="duo-card">
          <h2>{tr("tandem.title")}</h2>
          <p>{tr("tandem.lede")}</p>
          <button type="button" className="duo-btn duo-pri" disabled={creating || !micSupported()} onClick={() => newRoom("tandem", null)}>
            {tr(creating ? "duo.creating" : "duo.startTandem")}
          </button>
          {err === "create" && <p className="duo-err">{tr("duo.err.create")}</p>}
        </section>
        <p className="duo-note">{tr("duo.nothingStored")}</p>
      </>
    );
  } else if (phase === "error") {
    body = (
      <section className="duo-card">
        <p className="duo-err">{errText}</p>
        { }
        <a className="duo-btn" href="/duel/">
          {tr("duo.newRoom")}
        </a>
      </section>
    );
  } else if (phase === "consent" || phase === "linking") {
    body = (
      <>
        <p className="duo-lede">
          {kind === "duel" ? tr("duel.lede", { title: note?.title ?? "…" }) : tr("tandem.lede")}
        </p>
        {err === "load" && <p className="duo-err">{tr("duo.err.load")}</p>}
        {kind === "duel" && note && note.questions.length === 0 && <p className="duo-err">{tr("duel.noQuestions")}</p>}
        {room?.role === "host" && shareBlock}
        {room?.role === "guest" && !peerHere && <p className="duo-status">{tr("duo.hostAway")}</p>}
        <section className="duo-card duo-consent">
          <h2>{tr("duo.ipTitle")}</h2>
          <p>{tr("duo.ipNotice")}</p>
          <label className={`duo-check${ice?.relay ? "" : " is-off"}`}>
            <input type="checkbox" checked={relay} disabled={!ice?.relay || phase === "linking"} onChange={(e) => setRelay(e.target.checked)} />
            <span>
              {tr("duo.relay")}
              <small>{tr(ice?.relay ? "duo.relayHint" : "duo.relayOff")}</small>
            </span>
          </label>
          {kind === "tandem" && <p className="duo-muted">{tr("tandem.micNote")}</p>}
          {err && err !== "load" && <p className="duo-err">{errText}</p>}
          <button
            type="button"
            className="duo-btn duo-pri"
            disabled={phase === "linking" || (kind === "duel" && (!note || note.questions.length === 0))}
            onClick={connect}
          >
            {phase === "linking" ? tr("duo.linking") : tr(err === "failed" ? "duo.retry" : "duo.connect")}
          </button>
          {phase === "linking" && !peerHere && <p className="duo-status">{tr("duo.waiting")}</p>}
        </section>
        <p className="duo-note">{tr(kind === "duel" ? "duel.noCoins" : "duo.nothingStored")}</p>
      </>
    );
  } else if (phase === "live" && kind === "duel") {
    const score = tally(g.rounds.slice(0, g.stage === "question" ? g.i : g.i + 1));
    const q = g.i >= 0 ? note?.questions[g.order[g.i]] : undefined;
    const r = g.rounds[g.i];
    const mine = r?.[myRole];
    const theirs = r?.[theirRole];
    const point = g.stage === "reveal" && r ? pointFor(r.ok, r.host, r.guest) : null;
    body =
      err === "mismatch" ? (
        <p className="duo-card duo-err">{tr("duo.err.mismatch")}</p>
      ) : g.stage === "end" ? (
        <DuelEnd score={tally(g.rounds)} me={myRole} tr={tr} host={myRole === "host"} again={hostStart} noteLink={noteLink} />
      ) : !q || !r ? (
        <p className="duo-muted">{tr("duel.ready")}</p>
      ) : (
        <section className="duo-round" key={g.i}>
          <div className="duo-score" aria-live="polite">
            <span>
              {tr("duo.you")} <b>{score[myRole]}</b>
            </span>
            <span className="duo-qn">{tr("duel.question", { n: g.i + 1, total: g.order.length })}</span>
            <span>
              <b>{score[theirRole]}</b> {tr("duo.them")}
            </span>
          </div>
          {g.stage === "question" && <div className="duo-clock" style={{ animationDuration: `${ROUND_MS}ms` }} aria-hidden="true" />}
          <div className="duo-q" dangerouslySetInnerHTML={{ __html: q.q }} />
          <ol className="duo-choices" aria-label={tr("duel.choicesAria")}>
            {q.choices.map((c, ci) => {
              const cls = [
                "duo-choice",
                mine?.c === ci ? "is-mine" : "",
                g.stage === "reveal" && c.ok ? "is-ok" : "",
                g.stage === "reveal" && mine?.c === ci && !c.ok ? "is-wrong" : "",
                g.stage === "reveal" && theirs?.c === ci ? "is-theirs" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <li key={ci}>
                  <button type="button" className={cls} disabled={!!mine || g.stage !== "question"} onClick={() => answer(ci)}>
                    <span className="duo-key" aria-hidden="true">
                      {String.fromCharCode(65 + ci)}
                    </span>
                    <span dangerouslySetInnerHTML={{ __html: c.html }} />
                    {g.stage === "reveal" && theirs?.c === ci && <small className="duo-tag">{tr("duo.them")}</small>}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="duo-status" aria-live="polite">
            {g.stage === "reveal"
              ? tr(point === myRole ? "duel.pointYou" : point === theirRole ? "duel.pointThem" : point === "both" ? "duel.pointBoth" : "duel.pointNone")
              : theirs
                ? tr("duel.theyAnswered")
                : mine
                  ? tr("duel.waitThem")
                  : ""}
          </p>
        </section>
      );
  } else if (phase === "live" && kind === "tandem") {
    const c = call.current;
    const ph = note?.phrases[c.phrase];
    body = (
      <section className="duo-call">
        <p className="duo-live">
          <i aria-hidden="true" /> {tr("tandem.live")}
        </p>
        {c.theyMuted && <p className="duo-status">{tr("tandem.theyMuted")}</p>}
        {ph && (
          <div className="duo-card duo-phrase">
            <h2>{tr("tandem.phrase")}</h2>
            <p className="duo-phrase-tx">{ph.text}</p>
            <div className="duo-row">
              {ph.src && (
                <button type="button" className="duo-btn" onClick={() => void new Audio(ph.src as string).play().catch(() => {})}>
                  {tr("tandem.listen")}
                </button>
              )}
              {(note?.phrases.length ?? 0) > 1 && (
                <button type="button" className="duo-btn" onClick={nextPhrase}>
                  {tr("tandem.next")}
                </button>
              )}
            </div>
          </div>
        )}
        <div className="duo-row duo-controls">
          <button type="button" className="duo-btn" aria-pressed={c.muted} onClick={toggleMute}>
            {tr(c.muted ? "tandem.unmute" : "tandem.mute")}
          </button>
          <button type="button" className="duo-btn duo-hang" onClick={hangUp}>
            {tr("tandem.hangup")}
          </button>
        </div>
      </section>
    );
  } else if (phase === "ended") {
    body =
      kind === "duel" && g.stage === "end" ? (
        <DuelEnd score={tally(g.rounds)} me={myRole} tr={tr} host={false} left again={hostStart} noteLink={noteLink} />
      ) : (
        <section className="duo-card">
          <p>{tr(kind === "tandem" ? "tandem.ended" : "duo.left")}</p>
          <div className="duo-row">
            { }
            {noteLink && (
              <a className="duo-btn" href={noteLink}>
                {tr("duo.backNote")}
              </a>
            )}
            <button type="button" className="duo-btn" disabled={creating} onClick={() => newRoom(kind, room?.ref ?? null)}>
              {tr("duo.newRoom")}
            </button>
          </div>
        </section>
      );
  }

  return (
    <main className="duo" data-pagefind-ignore>
      <AppBack href={noteLink ?? "/"} labelKey="duo.back" />
      <h1 className="duo-title">{tr(phase === "landing" ? "duo.title" : kind === "tandem" ? "tandem.title" : "duel.title")}</h1>
      {body}
      {/* Tandem: the other's voice. */}
      <audio ref={audioRef} autoPlay hidden />
    </main>
  );
}

function DuelEnd({
  score,
  me,
  tr,
  host,
  left = false,
  again,
  noteLink,
}: {
  score: { host: number; guest: number };
  me: "host" | "guest";
  tr: (k: string, v?: Record<string, string | number>) => string;
  host: boolean;
  /** The other one is gone: no rematch. */
  left?: boolean;
  again: () => void;
  noteLink: string | null;
}) {
  const them = me === "host" ? "guest" : "host";
  const verdict = score[me] > score[them] ? "duel.won" : score[me] < score[them] ? "duel.lost" : "duel.draw";
  return (
    <section className="duo-card duo-end">
      <h2>{tr("duel.endTitle")}</h2>
      <p className="duo-final">
        <span>
          <small>{tr("duo.you")}</small>
          <b>{score[me]}</b>
        </span>
        <span aria-hidden="true">–</span>
        <span>
          <small>{tr("duo.them")}</small>
          <b>{score[them]}</b>
        </span>
      </p>
      <p className="duo-verdict">{tr(verdict)}</p>
      <div className="duo-row">
        {left ? (
          <p className="duo-muted">{tr("duo.left")}</p>
        ) : host ? (
          <button type="button" className="duo-btn duo-pri" onClick={again}>
            {tr("duel.again")}
          </button>
        ) : (
          <p className="duo-muted">{tr("duel.waitAgain")}</p>
        )}
        { }
        {noteLink && (
          <a className="duo-btn" href={noteLink}>
            {tr("duo.backNote")}
          </a>
        )}
      </div>
      <p className="duo-note">{tr("duel.noCoins")}</p>
    </section>
  );
}
