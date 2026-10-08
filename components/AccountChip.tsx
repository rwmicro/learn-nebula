"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import {
  authConfig,
  fetchMe,
  maybeSync,
  readHint,
  syncNow,
  totalEarned,
  type Earned,
} from "@/lib/account-client";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { dayKey, parseProgress } from "@/lib/srs";
import type { Look } from "@/lib/avatar";

/**
 * The account button of the site bar: "Se connecter" when the server offers
 * accounts, the reader's sprout and coin balance once signed in. It also
 * drives the progress sync (page load, a few seconds after something is read
 * or reviewed, and when the tab is hidden) and shows the coins just earned.
 * Renders nothing when accounts are off (no server, mail not configured).
 */
export function AccountChip() {
  const locale = useLocale();
  const [state, setState] = useState<{ on: boolean; in: boolean; look?: Look; coins?: number }>({
    on: false,
    in: false,
  });
  const [toast, setToast] = useState<{ n: number; kinds: string[]; id: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const fromHint = () => {
      const h = readHint();
      setState((s) => ({ ...s, in: h.in, look: h.look, coins: h.coins }));
    };
    fromHint();
    void authConfig().then((c) => {
      if (!alive) return;
      setState((s) => ({ ...s, on: c.enabled }));
      if (c.enabled && readHint().in) {
        void fetchMe().then(() => alive && (fromHint(), maybeSync()));
      }
    });
    const onAccount = () => fromHint();
    const onActivity = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void syncNow({ force: true }), 4000);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") void syncNow({ keepalive: true });
    };
    const onCoins = (e: Event) => {
      const d = (e as CustomEvent<{ earned: Earned[] }>).detail;
      const n = totalEarned(d?.earned ?? []);
      if (n > 0) setToast({ n, kinds: [...new Set(d.earned.map((x) => x.kind))], id: Date.now() });
      fromHint();
    };
    window.addEventListener("gk:account", onAccount);
    window.addEventListener("gk:activity", onActivity);
    window.addEventListener("gk:coins", onCoins);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      alive = false;
      window.removeEventListener("gk:account", onAccount);
      window.removeEventListener("gk:activity", onActivity);
      window.removeEventListener("gk:coins", onCoins);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3800);
    return () => window.clearTimeout(id);
  }, [toast]);

  const toastEl = toast && (
    <div className="coin-toast" role="status" key={toast.id}>
      <span className="coin-toast-coin" aria-hidden="true" />
      <span>
        {t("coins.toast", { n: toast.n }, locale)}
        {toast.kinds[0] && (
          <span className="coin-toast-why"> · {t(`coins.kind.${toast.kinds[0]}`, undefined, locale)}</span>
        )}
      </span>
    </div>
  );

  if (state.in) {
    return (
      <>
        <a className="account-chip" href="/compte/" title={t("account.myAccount", undefined, locale)}>
          <Avatar look={state.look} size={28} still />
          {state.coins != null && (
            <span className="account-chip-coins">
              <span className="coin-dot" aria-hidden="true" />
              {state.coins}
              <span className="sr-only"> {t("coins.unit", undefined, locale)}</span>
            </span>
          )}
        </a>
        {toastEl}
      </>
    );
  }
  if (!state.on) return null;
  return (
    <a className="account-login" href="/compte/">
      {t("account.login", undefined, locale)}
    </a>
  );
}

/** "N à revoir": cards and saved questions due today, from this browser's
 *  review state (the same localStorage the flashcards use). Links to the
 *  question review when questions are due, else to the decks. */
export function ReviewPill() {
  const locale = useLocale();
  const [due, setDue] = useState<{ n: number; href: string } | null>(null);
  useEffect(() => {
    const count = () => {
      try {
        const today = dayKey();
        let q = 0;
        let c = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k || !k.startsWith("srs:") || k === "srs:probe") continue;
          const p = parseProgress(localStorage.getItem(k));
          const n = Object.values(p.cards).filter((x) => x.due <= today).length;
          if (k.startsWith("srs:note:")) q += n;
          else c += n;
        }
        setDue(q + c > 0 ? { n: q + c, href: q > 0 ? "/cartes/revision/" : "/cartes/" } : null);
      } catch {
        setDue(null);
      }
    };
    count();
    window.addEventListener("gk:activity", count);
    window.addEventListener("gk:progress-synced", count);
    return () => {
      window.removeEventListener("gk:activity", count);
      window.removeEventListener("gk:progress-synced", count);
    };
  }, []);
  if (!due) return null;
  return (
    <a className="review-pill" href={due.href} title={t("review.pillTitle", { n: due.n }, locale)}>
      <span className="review-pill-dot" aria-hidden="true" />
      {t("review.pill", { n: due.n }, locale)}
    </a>
  );
}
