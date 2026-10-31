"use client";

// Owner-only console: a sidebar of sections — Lecteurs (comment moderation,
// questions, failed searches), Contenu (vault health, prerequisites, facts),
// Comptes, Activité (30-day charts, LLM spend) and Site (assistant, version,
// rebuild, notifications, journal) — with a dashboard of what needs doing above
// them, and keyboard shortcuts for all of it ("?" lists them). This page has no secrets of its own: it calls the protected
// endpoints either through the owner's reader session (an account listed in
// ADMIN_EMAILS — an HttpOnly cookie, nothing kept in JS) or, failing that,
// with the COMMENTS_ADMIN_TOKEN pasted in (server/auth.ts).
//
// The tabs, their cards and the dashboard tiles are declared in
// components/admin/config.tsx; data is shared through components/admin/store.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUTTON_CLASS, FOCUS_RING, UNDO_MS, type ToastAction } from "./shared";
import { URLS, bump, clearResources, forgetIgnored, reloadAll, setResource, syncIgnored } from "./store";
import { ADMIN_TABS, type TabId } from "./config";
import { Dashboard, resetTileCounts, useTileCounts } from "./Dashboard";
import { AdminTabs } from "./AdminTabs";
import { EVENTS_TICK } from "./EventsCard";
import { PUBLISHED_TICK } from "./PublishedComments";
import { ShortcutsHelp } from "./ShortcutsHelp";

// sessionStorage, not localStorage: the token survives a reload of this tab
// but not closing it, so it doesn't sit on disk for any script to find later.
const TOKEN_KEY = "gkAdminToken";
const ME_URL = "/api/admin/me";
// The account page logs the owner in and, from the e-mailed link, comes back.
const ACCOUNT_LOGIN = "/compte/?next=%2Fadmin%2F";
const DEFAULT_TAB: TabId = ADMIN_TABS[0].id;
// "g" then a section key must follow within this delay.
const CHORD_MS = 1500;

/** Typing somewhere: single-key shortcuts must not fire. */
function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
}

function isTab(v: string): v is TabId {
  return ADMIN_TABS.some((t) => t.id === v);
}

/** Bring `target` into view inside the (now visible) tab: open a <details>,
 *  press a view button, then scroll its card to the top and move focus. */
function reveal(target: string) {
  const el = document.getElementById(target);
  if (!el) return;
  let focusEl: HTMLElement = el;
  if (el instanceof HTMLDetailsElement) {
    el.open = true;
    focusEl = el.querySelector("summary") ?? el;
  } else if (el instanceof HTMLButtonElement) {
    el.click();
  }
  const scrollEl = el instanceof HTMLDetailsElement ? el : (el.closest<HTMLElement>(".admin-card") ?? el);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  scrollEl.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  if (focusEl.tabIndex < 0 && !/^(A|BUTTON|SUMMARY|INPUT)$/.test(focusEl.tagName)) {
    focusEl.setAttribute("tabindex", "-1");
  }
  focusEl.focus({ preventScroll: true });
}

export function AdminPanel() {
  // `token` is only ever the LAST one that actually worked; `connected` gates
  // the UI so a wrong guess doesn't lock the reader out of the input to fix it
  // (the form stays up, with the error, until a request actually succeeds).
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  // How we're in: the owner's account session (with its e-mail) or the token.
  const [session, setSession] = useState<{ email: string } | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>(DEFAULT_TAB);
  // A target to reveal once the tab it lives in has rendered.
  const pendingReveal = useRef<string | null>(null);
  const [toast, setToast] = useState<{ message: string; action?: ToastAction } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [help, setHelp] = useState(false);

  const showToast = useCallback((message: string, action?: ToastAction) => {
    // Every toast follows an action the journal may have recorded.
    bump(EVENTS_TICK);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? UNDO_MS : 2600);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  // --- tab ⇄ URL hash (#lecteurs, #contenu, #site; an old card anchor such as
  // #admin-pending selects the tab holding it).
  const applyHash = useCallback(() => {
    const h = decodeURIComponent(window.location.hash.slice(1));
    if (!h) return;
    if (isTab(h)) {
      setTab(h);
      return;
    }
    const panel = document.getElementById(h)?.closest<HTMLElement>("[role=tabpanel]");
    const id = panel?.dataset.tab;
    if (id && isTab(id)) {
      setTab(id);
      pendingReveal.current = h;
    }
  }, []);
  useEffect(() => {
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [applyHash]);
  // Card anchors only exist once connected: re-read the hash then.
  useEffect(() => {
    if (connected) applyHash();
  }, [connected, applyHash]);

  const selectTab = useCallback((id: TabId) => {
    setTab(id);
    if (window.location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
  }, []);

  const jump = useCallback(
    (id: TabId, target: string) => {
      selectTab(id);
      pendingReveal.current = target;
      // Same tab already showing: nothing re-renders, so reveal now.
      requestAnimationFrame(() => {
        if (pendingReveal.current) {
          reveal(pendingReveal.current);
          pendingReveal.current = null;
        }
      });
    },
    [selectTab],
  );
  useEffect(() => {
    if (!pendingReveal.current) return;
    const target = pendingReveal.current;
    pendingReveal.current = null;
    requestAnimationFrame(() => reveal(target));
  }, [tab, connected]);

  // --- auth
  const tryConnect = useCallback(async (tok: string) => {
    setAuthError(null);
    try {
      const r = await fetch(URLS.pending, { headers: { authorization: `Bearer ${tok}` } });
      if (r.status === 401) {
        setAuthError("Jeton invalide (ou modération non configurée côté serveur).");
        setConnected(false);
        try {
          sessionStorage.removeItem(TOKEN_KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // The check already fetched the pending queue: seed the shared cache.
      setResource(URLS.pending, await r.json());
      setToken(tok);
      setConnected(true);
      try {
        sessionStorage.setItem(TOKEN_KEY, tok);
      } catch {
        /* ignore */
      }
    } catch {
      setAuthError("Impossible de joindre le serveur d'administration.");
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    // Older builds kept it in localStorage: wipe that copy.
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* localStorage unavailable */
    }
    let cancelled = false;
    (async () => {
      // The owner's account session first: no token at all.
      try {
        const r = await fetch(ME_URL, { cache: "no-store" });
        if (r.ok) {
          const me = (await r.json()) as { via?: string; email?: string };
          if (!cancelled && me.via === "session") {
            setSession({ email: me.email ?? "" });
            setConnected(true);
            return;
          }
        }
      } catch {
        /* server unreachable: the token form below reports it */
      }
      if (cancelled) return;
      try {
        const saved = sessionStorage.getItem(TOKEN_KEY);
        if (saved) {
          setTokenInput(saved);
          tryConnect(saved);
        }
      } catch {
        /* sessionStorage unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tryConnect]);

  /** Off to the account page for a fresh magic link (dropping a reader
   *  session too old to carry admin rights, so the page offers the form). */
  const loginWithAccount = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* the account page will show whatever state we're in */
    }
    window.location.assign(ACCOUNT_LOGIN);
  }, []);

  /** Stable identity: cards list it as an effect dependency. */
  const disconnect = useCallback(() => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    clearResources();
    resetTileCounts();
    forgetIgnored();
    setSession((s) => {
      // Logged in by account: logging out of /admin/ ends that session.
      if (s) fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      return null;
    });
    setToken("");
    setConnected(false);
    setAuthError(null);
    setTokenInput("");
  }, []);

  /** A card saw a 401 mid-session. */
  const expired = useCallback(() => {
    const bySession = session !== null;
    disconnect();
    setAuthError(
      bySession
        ? "Ta session admin a expiré : redemande un lien de connexion."
        : "Le jeton n'est plus valide — reconnecte-toi.",
    );
  }, [disconnect, session]);

  // Ignored prerequisite suggestions live on the server: load them once in.
  useEffect(() => {
    if (connected) syncIgnored(token);
  }, [connected, token]);

  // "(3) Administration": the pending queue, visible from another tab.
  const pendingCount = useTileCounts().pending ?? 0;
  const baseTitle = useRef<string | null>(null);
  useEffect(() => {
    if (baseTitle.current === null) baseTitle.current = document.title.replace(/^\(\d+\) /, "");
    document.title = connected && pendingCount > 0 ? `(${pendingCount}) ${baseTitle.current}` : baseTitle.current;
  }, [connected, pendingCount]);
  useEffect(
    () => () => {
      if (baseTitle.current !== null) document.title = baseTitle.current;
    },
    [],
  );

  // --- global shortcuts: g + section key (or 1–5), "/" to filter, "r" to
  // refresh, "?" for the list. Per-card keys (a/d/j/k/x on a pending comment)
  // handle their own event first and mark it.
  const chord = useRef(0);
  useEffect(() => {
    if (!connected) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const k = e.key;
      if (Date.now() - chord.current < CHORD_MS) {
        chord.current = 0;
        const t = ADMIN_TABS.find((x) => x.key === k.toLowerCase());
        if (t) {
          e.preventDefault();
          selectTab(t.id);
          document.getElementById(`admin-tab-${t.id}`)?.focus();
        }
        return;
      }
      if (k === "g") {
        chord.current = Date.now();
        return;
      }
      if (/^[1-9]$/.test(k) && ADMIN_TABS[Number(k) - 1]) {
        e.preventDefault();
        selectTab(ADMIN_TABS[Number(k) - 1].id);
        return;
      }
      if (k === "/") {
        const field = document.querySelector<HTMLInputElement>(
          `#admin-panel-${tab} input[type=search]`,
        );
        if (field) {
          e.preventDefault();
          field.focus();
          field.select();
        }
        return;
      }
      if (k === "r") {
        e.preventDefault();
        reloadAll(token).catch(() => {});
        bump(PUBLISHED_TICK);
        showToast("Tout est relu.");
        return;
      }
      if (k === "?") {
        e.preventDefault();
        setHelp(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connected, tab, token, selectTab, showToast]);

  const cardProps = useMemo(
    () => ({ token, onUnauthorized: expired, onToast: showToast }),
    [token, expired, showToast],
  );
  const tileCtx = useMemo(() => ({ token, onUnauthorized: expired }), [token, expired]);

  return (
    <div className={`admin-panel mx-auto px-4 py-8 sm:px-6 ${connected ? "is-console" : ""}`}>
      <header className="admin-head">
        <h1 className="admin-title m-0 flex items-center gap-2 text-2xl font-bold text-ink">
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="text-garden"
          >
            <path d="M7 20h10" />
            <path d="M10 20c5.5-2.5.8-6.4 3-10" />
            <path d="M9 12C6 12 4 9.5 4 6c3.5 0 5 2 5 4" />
            <path d="M15 10c3 0 5-2.5 5-6-3.5 0-5 2-5 5" />
          </svg>
          administration
        </h1>
        {connected && (
          <div className="flex items-center gap-2 text-small text-muted-warm">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "var(--garden)" }}
            />
            {session ? (
              <span>
                connecté · <span className="admin-subject">{session.email}</span>
              </span>
            ) : (
              "connecté (jeton)"
            )}
            <button
              type="button"
              onClick={disconnect}
              className={`rounded underline underline-offset-2 hover:text-ink ${FOCUS_RING}`}
            >
              se déconnecter
            </button>
          </div>
        )}
      </header>

      {!connected ? (
        <>
          <section className="admin-card">
            <h2 className="admin-eyebrow m-0 mb-2 text-small font-semibold text-muted-warm">connexion</h2>
            <p className="m-0 mb-3 text-small text-muted-warm">
              Avec ton compte lecteur (adresse listée dans <code>ADMIN_EMAILS</code>) : un lien par e-mail, rien à
              coller ni à garder dans le navigateur.
            </p>
            <button type="button" onClick={loginWithAccount} className={`admin-btn-primary ${FOCUS_RING}`}>
              Recevoir un lien de connexion
            </button>
            <p className="m-0 mt-4 mb-2 text-small text-muted-warm">Ou avec le jeton admin :</p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (tokenInput.trim()) tryConnect(tokenInput.trim());
              }}
            >
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Jeton admin (COMMENTS_ADMIN_TOKEN)"
                aria-label="Jeton admin"
                autoComplete="off"
                className={`min-w-0 flex-1 rounded border border-rule-strong bg-transparent px-2 py-1 text-small ${FOCUS_RING}`}
              />
              <button type="submit" className={BUTTON_CLASS}>
                Se connecter
              </button>
            </form>
            {authError && <p className="m-0 mt-2 text-small text-danger">{authError}</p>}
          </section>
        </>
      ) : (
        <>
          <AdminTabs
            active={tab}
            onSelect={selectTab}
            card={cardProps}
            top={<Dashboard ctx={tileCtx} onJump={jump} />}
            footer={
              <button type="button" onClick={() => setHelp(true)} className={`admin-side-help ${FOCUS_RING}`}>
                <kbd>?</kbd> raccourcis
              </button>
            }
          />
          <ShortcutsHelp open={help} onClose={() => setHelp(false)} />
        </>
      )}

      {toast && (
        <div
          role="status"
          className="admin-toast fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded bg-ink px-3 py-2 text-small text-paper shadow-lg"
        >
          {toast.message}
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.run();
                setToast(null);
              }}
              className={`admin-toast-action rounded font-semibold underline underline-offset-2 ${FOCUS_RING}`}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
