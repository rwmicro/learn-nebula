"use client";

import { recordActivity } from "@/lib/personal";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { CHANGE_EVENT } from "@/lib/reading-progress";
import { dayKey, type Grade } from "@/lib/srs";
import { loadSettings } from "@/lib/srs-settings";
import {
  addQuestion,
  gradeQuestion,
  loadNoteDeck,
  recordCorrect,
  saveNoteDeck,
} from "@/lib/note-quiz";
import {
  QUIZ_EVENT,
  STUDY_EVENT,
  ancestorsOf,
  descendantsOf,
  hasPlacement,
  isDone,
  isStudyKey,
  loadKnown,
  loadStudyStates,
  loadTarget,
  markKnown,
  nextPlacementNote,
  nextToReadIn,
  placementNotes,
  placementRemaining,
  resetPlacement,
  saveKnown,
  saveTarget,
  splitMinutes,
  targetPlan,
  unmarkKnown,
  type KnownStore,
  type NoteState,
  type PlacementAnswer,
} from "@/lib/path-study";
import type { PathQuizItem } from "@/lib/path-extras";
import { ReviewSession, type Graded, type ReviewItem } from "@/components/ReviewSession";

export interface StudyNoteView {
  slug: string;
  title: string;
  href: string;
  prereqs: string[];
  minutes: number;
  quiz: string[];
}

type Tr = (k: string, vars?: Record<string, string | number>) => string;

/**
 * The interactive layer of a reading path page (/parcours/<slug>/). The graph
 * and the ordered list are server-rendered (components/Parcours.tsx); this
 * decorates them from the reader's localStorage and wires their buttons:
 *
 * - states: non lue / lue / connue / maîtrisée (lib/path-study.ts), the note
 *   to read next, on the nodes, edges, list items and the "next" callout;
 * - "Viser cette note" (◎ on a node, or the list's button): target mode keeps
 *   the target and its ancestors lit and sums up what is left to read;
 * - "Je connais déjà" per note, and the placement test that sets those marks;
 * - hover/focus on a node lights its ancestors and descendants;
 * - "Réviser ce parcours": a spaced-repetition session over the questions of
 *   the notes already read or known (shared storage with /cartes/revision/).
 */
export function ParcoursStudy({
  pathSlug,
  notes,
  items,
}: {
  pathSlug: string;
  notes: StudyNoteView[];
  items: PathQuizItem[];
}) {
  const locale = useLocale();
  const tr: Tr = useCallback((k, vars) => t(k, vars, locale), [locale]);
  const [states, setStates] = useState<Map<string, NoteState>>(new Map());
  const [known, setKnown] = useState<KnownStore>({});
  const [target, setTargetState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [dialog, setDialog] = useState<"placement" | "review" | null>(null);
  const bySlug = useMemo(() => new Map(notes.map((n) => [n.slug, n])), [notes]);

  const reload = useCallback(() => {
    const r = loadStudyStates(notes);
    setStates(r.states);
    setKnown(r.known);
    const tg = loadTarget(pathSlug);
    setTargetState(tg && bySlug.has(tg) ? tg : null);
    setReady(true);
  }, [notes, pathSlug, bySlug]);

  useEffect(() => {
    reload();
    const onStorage = (e: StorageEvent) => {
      if (isStudyKey(e.key)) reload();
    };
    window.addEventListener("storage", onStorage);
    for (const ev of [CHANGE_EVENT, STUDY_EVENT, QUIZ_EVENT, "pageshow"]) window.addEventListener(ev, reload);
    return () => {
      window.removeEventListener("storage", onStorage);
      for (const ev of [CHANGE_EVENT, STUDY_EVENT, QUIZ_EVENT, "pageshow"]) window.removeEventListener(ev, reload);
    };
  }, [reload]);

  const done = useCallback((s: string) => isDone(states.get(s)), [states]);
  const plan = useMemo(() => (target ? targetPlan(notes, target, done) : null), [target, notes, done]);
  // With a target, "next" is the first readable note on the way to it.
  const next = useMemo(
    () => (ready ? nextToReadIn(plan ? notes.filter((n) => plan.scope.has(n.slug)) : notes, done) : null),
    [ready, notes, done, plan],
  );

  const changed = () => window.dispatchEvent(new CustomEvent(STUDY_EVENT));
  const toggleKnown = useCallback(
    (slug: string) => {
      const cur = { ...known };
      saveKnown(cur[slug] ? unmarkKnown(cur, slug) : markKnown(cur, slug));
      changed();
    },
    [known],
  );
  const setTarget = useCallback(
    (slug: string | null) => {
      saveTarget(pathSlug, slug);
      // Without storage the target still works for this visit.
      setTargetState(slug);
      changed();
    },
    [pathSlug],
  );

  // --- decorate the server-rendered graph and list --------------------------
  useEffect(() => {
    if (!ready) return;
    const root = document.querySelector<HTMLElement>("[data-parcours]");
    if (!root) return;
    const scope = plan?.scope ?? null;
    root.classList.toggle("is-targeting", !!target);
    const stateKey: Record<NoteState, string> = {
      unread: "parcours.unread",
      read: "reading.read",
      known: "parcours.known",
      mastered: "parcours.mastered",
    };
    root.querySelectorAll<Element>(".pg-item[data-slug], li[data-slug]").forEach((el) => {
      const slug = el.getAttribute("data-slug")!;
      const st = states.get(slug) ?? "unread";
      for (const s of ["read", "known", "mastered"]) el.classList.toggle(`is-${s}`, st === s);
      el.classList.toggle("is-next", slug === next);
      el.classList.toggle("is-target", slug === target);
      el.classList.toggle("in-scope", !!scope?.has(slug));
      el.classList.toggle("out-scope", !!scope && !scope.has(slug));
      const title = bySlug.get(slug)?.title ?? slug;
      // Node: its accessible name carries the state.
      const a = el.querySelector(":scope > .pg-node");
      if (a)
        a.setAttribute(
          "aria-label",
          [
            title,
            st !== "unread" ? tr(stateKey[st]) : "",
            slug === next ? tr("parcours.nextShort") : "",
            slug === target ? tr("parcours.targetBadge") : "",
          ]
            .filter(Boolean)
            .join(" — "),
        );
      const label = el.querySelector(":scope > [data-state-label]");
      if (label) {
        const parts = [
          st !== "unread" ? tr(stateKey[st]) : "",
          slug === target ? tr("parcours.targetBadge") : scope?.has(slug) && !isDone(st) ? tr("parcours.toTarget") : "",
        ].filter(Boolean);
        label.textContent = parts.join(" · ");
        (label as HTMLElement).hidden = !parts.length;
      }
      el.querySelectorAll<Element>("[data-act]").forEach((b) => {
        const act = b.getAttribute("data-act");
        if (act === "target") {
          b.setAttribute("aria-pressed", String(slug === target));
          const l = slug === target ? tr("parcours.targetClear") : tr("parcours.targetThis");
          b.setAttribute("aria-label", `${l} : ${title}`);
          if (b instanceof HTMLElement) b.textContent = l;
          else b.querySelector("title")!.textContent = l;
        } else if (act === "known") {
          const k = !!known[slug];
          // A read (or mastered) note is past "known": no toggle to offer.
          const hide = st === "read" || st === "mastered";
          b.setAttribute("aria-pressed", String(k));
          const l = k ? tr("parcours.unknow") : tr("parcours.know");
          b.setAttribute("aria-label", `${l} : ${title}`);
          if (b instanceof HTMLElement) {
            b.textContent = l;
            b.hidden = hide;
          } else {
            b.querySelector("title")!.textContent = l;
            b.classList.toggle("is-hidden", hide);
            if (hide) b.setAttribute("tabindex", "-1");
            else b.setAttribute("tabindex", "0");
          }
        }
      });
    });
    root.querySelectorAll<SVGElement>(".pg-edge[data-from]").forEach((e) => {
      const from = e.dataset.from!;
      const to = e.dataset.to!;
      e.classList.toggle("is-read", done(from));
      e.classList.toggle("in-scope", !!scope?.has(from) && !!scope?.has(to));
      e.classList.toggle("out-scope", !!scope && !(scope.has(from) && scope.has(to)));
    });
    const callout = root.querySelector<HTMLElement>("[data-parcours-next]");
    if (callout) {
      const link = callout.querySelector("a");
      const n = next ? bySlug.get(next) : null;
      callout.hidden = !n;
      if (link && n) {
        link.setAttribute("href", n.href);
        link.textContent = n.title;
      }
    }
  }, [ready, states, known, next, target, plan, bySlug, tr, done]);

  // --- actions (delegated: the buttons are server-rendered) ------------------
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-parcours]");
    if (!root) return;
    const act = (el: Element) => {
      const slug = el.getAttribute("data-slug");
      if (!slug || !bySlug.has(slug)) return;
      if (el.getAttribute("data-act") === "target") setTarget(target === slug ? null : slug);
      else toggleKnown(slug);
    };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element).closest?.("[data-act][data-slug]");
      if (!el || !root.contains(el)) return;
      e.preventDefault();
      act(el);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const el = (e.target as Element).closest?.("g[data-act][data-slug]");
      if (!el) return;
      e.preventDefault();
      act(el);
    };
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKey);
    };
  }, [bySlug, target, setTarget, toggleKnown]);

  // --- hover / focus: ancestors and descendants ------------------------------
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-parcours]");
    if (!root) return;
    let current: string | null = null;
    const light = (slug: string | null) => {
      if (slug === current) return;
      current = slug;
      const svgs = root.querySelectorAll<SVGSVGElement>("svg.pg");
      const lit = slug ? new Set([slug, ...ancestorsOf(slug, notes), ...descendantsOf(slug, notes)]) : null;
      svgs.forEach((svg) => {
        svg.classList.toggle("is-hl", !!lit);
        svg.querySelectorAll(".pg-item").forEach((n) => {
          const s = n.getAttribute("data-slug")!;
          n.classList.toggle("is-lit", !!lit?.has(s));
          n.classList.toggle("is-focus", s === slug);
        });
        svg.querySelectorAll<SVGElement>(".pg-edge").forEach((e) => {
          e.classList.toggle("is-lit", !!lit?.has(e.dataset.from!) && !!lit?.has(e.dataset.to!));
        });
      });
    };
    const itemOf = (e: Event) => (e.target as Element).closest?.(".pg-item")?.getAttribute("data-slug") ?? null;
    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      light(itemOf(e));
    };
    const leave = (e: PointerEvent) => {
      if (!(e.relatedTarget as Element | null)?.closest?.(".pg-item")) light(null);
    };
    const focusIn = (e: FocusEvent) => light(itemOf(e));
    const focusOut = (e: FocusEvent) => {
      if (!(e.relatedTarget as Element | null)?.closest?.(".pg-item")) light(null);
    };
    root.addEventListener("pointerover", over);
    root.addEventListener("pointerout", leave);
    root.addEventListener("focusin", focusIn);
    root.addEventListener("focusout", focusOut);
    return () => {
      root.removeEventListener("pointerover", over);
      root.removeEventListener("pointerout", leave);
      root.removeEventListener("focusin", focusIn);
      root.removeEventListener("focusout", focusOut);
    };
  }, [notes]);

  // --- render: target summary, tools, dialogs --------------------------------
  const time = (min: number) => {
    const { h, m } = splitMinutes(min);
    return h ? tr("parcours.hm", { h, mm: String(m).padStart(2, "0") }) : tr("parcours.min", { m });
  };
  const eligible = items.filter((it) => done(it.slug));
  const placed = hasPlacement(known, pathSlug);

  return (
    <section className="parcours-study" aria-label={tr("parcours.studyAria")}>
      <div className="parcours-target" aria-live="polite">
        {target && plan ? (
          <>
            <span className="parcours-target-text">
              <TargetIcon />
              {tr("parcours.targetIntro")}{" "}
              <a href={bySlug.get(target)!.href}>{bySlug.get(target)!.title}</a>
              {" — "}
              <strong>
                {plan.todo.length
                  ? tr(plan.todo.length === 1 ? "parcours.targetSummaryOne" : "parcours.targetSummary", {
                      n: plan.todo.length,
                      time: time(plan.minutes),
                    })
                  : tr("parcours.targetDone")}
              </strong>
            </span>
            <button type="button" className="parcours-tool parcours-tool--quiet" onClick={() => setTarget(null)}>
              {tr("parcours.targetClear")}
            </button>
          </>
        ) : (
          <span className="parcours-tip">
            <TargetIcon />
            {tr("parcours.targetTip")}
          </span>
        )}
      </div>
      <div className="parcours-tools">
        <button type="button" className="parcours-tool" onClick={() => setDialog("review")} aria-haspopup="dialog">
          {tr("parcours.review")}
          {eligible.length > 0 && <span className="parcours-tool-count">{eligible.length}</span>}
        </button>
        <button type="button" className="parcours-tool" onClick={() => setDialog("placement")} aria-haspopup="dialog">
          {tr("parcours.placement")}
        </button>
        {placed && (
          <button
            type="button"
            className="parcours-tool parcours-tool--quiet"
            onClick={() => {
              saveKnown(resetPlacement(known, pathSlug));
              changed();
            }}
          >
            {tr("parcours.placementReset")}
          </button>
        )}
      </div>

      <StudyDialog open={dialog === "placement"} onClose={() => setDialog(null)} title={tr("parcours.placement")} tr={tr}>
        {dialog === "placement" && (
          <Placement
            pathSlug={pathSlug}
            notes={notes}
            target={target}
            items={items}
            states={states}
            known={known}
            tr={tr}
            onClose={() => setDialog(null)}
          />
        )}
      </StudyDialog>
      <StudyDialog open={dialog === "review"} onClose={() => setDialog(null)} title={tr("parcours.review")} tr={tr}>
        {dialog === "review" && <PathReview items={items} eligible={eligible} tr={tr} locale={locale} />}
      </StudyDialog>
    </section>
  );
}

function TargetIcon() {
  return (
    <svg className="parcours-target-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="8" />
      <circle cx="10" cy="10" r="4.5" />
      <circle cx="10" cy="10" r="1.6" className="dot" />
    </svg>
  );
}

/** Native modal dialog (focus trap, Escape, inert page) driven by `open`. */
function StudyDialog({
  open,
  onClose,
  title,
  tr,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  tr: Tr;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      try {
        d.showModal();
      } catch {
        d.setAttribute("open", "");
      }
    } else if (!open && d.open) {
      d.close();
      (opener.current as HTMLElement | null)?.focus?.();
    }
  }, [open]);
  const id = `dlg-${title.replace(/\W+/g, "-")}`;
  return (
    <dialog
      ref={ref}
      className="parcours-dialog"
      aria-labelledby={id}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop
      }}
    >
      <div className="parcours-dialog-inner">
        <header className="parcours-dialog-head">
          <h2 id={id}>{title}</h2>
          <button type="button" className="parcours-dialog-close" onClick={onClose} aria-label={tr("parcours.close")}>
            ×
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

// --- placement test --------------------------------------------------------------

function Placement({
  pathSlug,
  notes: allNotes,
  target,
  items,
  states,
  known,
  tr,
  onClose,
}: {
  pathSlug: string;
  notes: StudyNoteView[];
  /** With a target, the test only asks about it and its ancestors. */
  target: string | null;
  items: PathQuizItem[];
  states: Map<string, NoteState>;
  known: KnownStore;
  tr: Tr;
  onClose: () => void;
}) {
  // Fixed when the test opens (a target change mid-test would reshuffle it).
  const [notes] = useState(() => placementNotes(allNotes, target));
  const scopedTo =
    target && notes.length < allNotes.length ? (allNotes.find((n) => n.slug === target)?.title ?? null) : null;
  // Snapshot when the test opens: notes already done count as a "yes" and are
  // not asked — except the marks a previous placement of this path set, which
  // a new test asks again.
  const [skip] = useState(() => {
    const s = new Set<string>();
    for (const n of notes) {
      const st = states.get(n.slug);
      const fromPlacement = st === "known" && known[n.slug]?.via === pathSlug;
      if (isDone(st) && !fromPlacement) s.add(n.slug);
    }
    return s;
  });
  const [answers, setAnswers] = useState<Record<string, PlacementAnswer>>({});
  const [revealed, setRevealed] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);
  const isSkipped = (s: string) => skip.has(s);
  const current = nextPlacementNote(notes, answers, isSkipped);
  const asked = Object.keys(answers).length;
  const left = placementRemaining(notes, answers, isSkipped);
  const note = current ? notes.find((n) => n.slug === current)! : null;
  // One question of the note, if it has any: the first not yet answered right.
  const quiz = useMemo(() => {
    if (!note) return null;
    const own = items.filter((it) => it.slug === note.slug);
    if (!own.length) return null;
    try {
      const deck = loadNoteDeck(localStorage, note.slug);
      return own.find((it) => !deck.ok?.[it.id]) ?? own[0];
    } catch {
      return own[0];
    }
  }, [note, items]);

  useEffect(() => {
    firstRef.current?.focus();
  }, [current, revealed]);

  const answer = (a: PlacementAnswer, correct = false) => {
    if (!note) return;
    let store = loadKnownFresh();
    if (a === "yes") store = markKnown(store, note.slug, pathSlug);
    else if (store[note.slug]?.via === pathSlug) store = unmarkKnown(store, note.slug);
    saveKnown(store);
    if (correct && quiz) {
      try {
        const deck = recordCorrect(loadNoteDeck(localStorage, note.slug), quiz.id, dayKey());
        saveNoteDeck(localStorage, note.slug, deck);
        recordActivity("c");
        window.dispatchEvent(new CustomEvent(QUIZ_EVENT));
      } catch {
        /* storage blocked: the known mark is enough */
      }
    }
    window.dispatchEvent(new CustomEvent(STUDY_EVENT));
    setAnswers({ ...answers, [note.slug]: a });
    setRevealed(false);
  };

  if (!note) {
    const yes = Object.values(answers).filter((a) => a === "yes").length;
    return (
      <div className="placement">
        <p className="placement-done" tabIndex={-1}>
          {asked ? tr("parcours.placementDone", { n: yes }) : tr("parcours.placementNothing")}
        </p>
        <div className="placement-actions">
          <button ref={firstRef} type="button" className="parcours-tool" onClick={onClose}>
            {tr("parcours.close")}
          </button>
          {yes > 0 && (
            <button
              type="button"
              className="parcours-tool parcours-tool--quiet"
              onClick={() => {
                saveKnown(resetPlacement(loadKnownFresh(), pathSlug));
                window.dispatchEvent(new CustomEvent(STUDY_EVENT));
                onClose();
              }}
            >
              {tr("parcours.placementReset")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="placement">
      <p className="placement-meta">
        {tr("parcours.placementStep", { k: asked + 1, left: left - 1 })}
      </p>
      <p className="placement-intro">{tr("parcours.placementIntro")}</p>
      {scopedTo && <p className="placement-scope">{tr("parcours.placementScoped", { title: scopedTo })}</p>}
      {quiz ? (
        <>
          <p className="placement-q-note">
            {tr("parcours.placementQuizFor")} <a href={note.href}>{note.title}</a>
          </p>
          <div className="placement-quiz">
            <div className="note-review-q" dangerouslySetInnerHTML={{ __html: quiz.q }} />
            {revealed && <div className="note-review-a placement-answer" dangerouslySetInnerHTML={{ __html: quiz.a }} />}
          </div>
          {revealed ? (
            <div className="placement-actions" role="group" aria-label={tr("quiz.selfAria")}>
              <button ref={firstRef} type="button" className="parcours-tool parcours-tool--yes" onClick={() => answer("yes", true)}>
                {tr("quiz.knew")}
              </button>
              <button type="button" className="parcours-tool parcours-tool--no" onClick={() => answer("no")}>
                {tr("quiz.notYet")}
              </button>
              <button type="button" className="parcours-tool parcours-tool--quiet" onClick={() => answer("unsure")}>
                {tr("parcours.unsure")}
              </button>
            </div>
          ) : (
            <div className="placement-actions">
              <button ref={firstRef} type="button" className="parcours-tool" onClick={() => setRevealed(true)}>
                {tr("quiz.reveal")}
              </button>
              <button type="button" className="parcours-tool parcours-tool--quiet" onClick={() => answer("unsure")}>
                {tr("parcours.unsure")}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="placement-question">
            {tr("parcours.placementAsk")} <a href={note.href}>{note.title}</a> ?
          </p>
          <div className="placement-actions" role="group" aria-label={tr("parcours.placementAnswers")}>
            <button ref={firstRef} type="button" className="parcours-tool parcours-tool--yes" onClick={() => answer("yes")}>
              {tr("parcours.yes")}
            </button>
            <button type="button" className="parcours-tool parcours-tool--no" onClick={() => answer("no")}>
              {tr("parcours.no")}
            </button>
            <button type="button" className="parcours-tool parcours-tool--quiet" onClick={() => answer("unsure")}>
              {tr("parcours.unsure")}
            </button>
          </div>
        </>
      )}
      <p className="placement-hint">{tr("parcours.placementHint")}</p>
    </div>
  );
}

const loadKnownFresh = (): KnownStore => loadKnown();

// --- path revision ----------------------------------------------------------------

function PathReview({
  items,
  eligible,
  tr,
  locale,
}: {
  items: PathQuizItem[];
  eligible: PathQuizItem[];
  tr: Tr;
  locale: string;
}) {
  const [today] = useState(() => {
    loadSettings(); // the reader's target retention, for the grades below
    return dayKey();
  });
  // Earliest later review among the eligible cards (for the "done" screen).
  const [nextDay, setNextDay] = useState<string | null>(() => {
    let best: string | null = null;
    for (const it of eligible) {
      try {
        const due = loadNoteDeck(localStorage, it.slug).cards[it.id]?.due;
        if (due && due > today && (!best || due < best)) best = due;
      } catch {
        /* no storage */
      }
    }
    return best;
  });
  // Today's queue, built once when the session opens: due cards (most overdue
  // first), then the ones never reviewed, in path order.
  const [queue, setQueue] = useState<ReviewItem[]>(() => {
    const due: ReviewItem[] = [];
    const fresh: ReviewItem[] = [];
    for (const it of eligible) {
      let state;
      try {
        state = loadNoteDeck(localStorage, it.slug).cards[it.id];
      } catch {
        state = undefined;
      }
      const d: ReviewItem = {
        kind: "note",
        slug: it.slug,
        id: it.id,
        item: { q: it.q, a: it.a, url: it.url, title: it.title, added: "" },
        state,
      };
      if (!state) fresh.push(d);
      else if (state.due <= today) due.push(d);
    }
    due.sort((a, b) => (a.state!.due < b.state!.due ? -1 : a.state!.due > b.state!.due ? 1 : 0));
    return [...due, ...fresh];
  });

  const onGrade = useCallback(
    (head: ReviewItem, g: Grade): Graded | undefined => {
      if (head.kind !== "note") return undefined;
      try {
        const before = loadNoteDeck(localStorage, head.slug);
        let deck = before;
        // Graded here = saved in the reviews, so /cartes/revision/ sees it too.
        deck = deck.items[head.id]
          ? gradeQuestion(deck, head.id, g, today)
          : addQuestion(deck, head.id, { q: head.item.q, a: head.item.a, url: head.item.url, title: head.item.title }, g, today);
        saveNoteDeck(localStorage, head.slug, deck);
        window.dispatchEvent(new CustomEvent(QUIZ_EVENT));
        const st = deck.cards[head.id];
        if (st && st.due > today) setNextDay((d) => (!d || st.due < d ? st.due : d));
        return {
          state: st,
          undo: () => {
            try {
              saveNoteDeck(localStorage, head.slug, before);
              window.dispatchEvent(new CustomEvent(QUIZ_EVENT));
            } catch {
              /* storage gone */
            }
          },
        };
      } catch {
        return undefined;
      }
    },
    [today],
  );

  if (!items.length)
    return (
      <div className="path-review-empty">
        <p>{tr("parcours.reviewNone")}</p>
        <pre>
          <code>{"> [!quiz] Quelle est la question ?\n> La réponse, en une ou plusieurs lignes."}</code>
        </pre>
        <p>{tr("parcours.reviewNoneHow")}</p>
      </div>
    );
  if (!eligible.length)
    return (
      <div className="path-review-empty">
        <p>{tr("parcours.reviewNotYet", { n: items.length })}</p>
      </div>
    );

  const fmt = (day: string) => {
    try {
      return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(
        new Date(`${day}T12:00:00`),
      );
    } catch {
      return day;
    }
  };
  return (
    <div className="path-review note-review">
      <p className="path-review-meta">
        {tr("parcours.reviewMeta", { n: eligible.length, total: items.length })}
        {queue.length > 0 && (
          <>
            {" · "}
            {queue.length} {tr("flashcards.left")}
          </>
        )}
      </p>
      <ReviewSession
        queue={queue}
        setQueue={setQueue}
        onGrade={onGrade}
        today={today}
        autoFocus
        done={nextDay ? tr("flashcards.doneNext", { date: fmt(nextDay) }) : tr("flashcards.done")}
      />
    </div>
  );
}
