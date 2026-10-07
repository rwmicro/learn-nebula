"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { ActivityCalendar } from "@/components/ActivityCalendar";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import {
  authConfig,
  fetchMe,
  logout,
  readHint,
  requestLink,
  syncNow,
  writeHint,
  type AuthConfig,
  type Me,
} from "@/lib/account-client";
import {
  ITEMS,
  MAX_FREEZES,
  STREAK_FREEZE,
  sanitizeLook,
  type Look,
  type Slot,
} from "@/lib/avatar";

interface Ledger {
  day: string;
  kind: string;
  ref: string;
  amount: number;
}
interface AccountData {
  coins: number;
  ledger: Ledger[];
  owned: string[];
  look: Look;
  streak: Me["streak"];
  stats?: { notesRead?: number; reviews?: number; activeDays?: number };
}

/** One row per day for the small, repeated earnings (a review is 1 coin, so a
 *  session would otherwise fill the list with "+1" rows). */
function groupLedger(ledger: Ledger[]): (Ledger & { n: number })[] {
  const out: (Ledger & { n: number })[] = [];
  for (const e of ledger) {
    const last = out[out.length - 1];
    if (last && e.kind === "review" && last.kind === "review" && last.day === e.day) {
      last.amount += e.amount;
      last.n += 1;
    } else out.push({ ...e, n: 1 });
  }
  return out;
}

function dayLabel(day: string, locale: string): string {
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? day : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d);
}

const SLOTS: Slot[] = ["body", "hat", "accessory", "background"];

/**
 * /compte/: the reader's private page. Signed out, a sign-in form (a link by
 * e-mail, no password). Signed in: the sprout and its wardrobe, the coins and
 * where they came from, the streak, the regularity calendar, sync and the
 * account controls. Everything comes from /api/* with the session cookie;
 * nothing of it is in the static page, and the page is out of search engines.
 */
export function Account() {
  const locale = useLocale();
  const tr = useCallback((k: string, v?: Record<string, string | number>) => t(k, v, locale), [locale]);
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [data, setData] = useState<AccountData | null>(null);
  const [freeze, setFreeze] = useState<{ price: number; held: number; max: number } | null>(null);
  const [draft, setDraft] = useState<Look | null>(null);
  const [slot, setSlot] = useState<Slot>("body");
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("login") === "expired") setExpired(true);
    // Opening the e-mail link while already on this page only changes the
    // fragment, which mounts nothing: reload so the sign-in below runs.
    const onHash = () => {
      if (new URLSearchParams(location.hash.slice(1)).get("login")) location.reload();
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const load = useCallback(async () => {
    const user = await fetchMe();
    setMe(user);
    if (!user) return null;
    try {
      const [a, s] = await Promise.all([
        fetch("/api/account", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
        fetch("/api/shop", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (a) {
        setData(a as AccountData);
        setDraft((d) => d ?? (a as AccountData).look);
      }
      if (s?.freeze) setFreeze(s.freeze);
    } catch {
      /* the header still shows; the rest stays empty */
    }
    return user;
  }, []);

  useEffect(() => {
    // Back from the e-mail link: /compte/#login=<token>&next=…. The token is
    // handed to the server here (POST), never by a GET a mail scanner could
    // spend; then the fragment is wiped from the address bar and history.
    const hash = new URLSearchParams(location.hash.slice(1));
    const token = hash.get("login");
    const next = hash.get("next");
    const signIn = token
      ? fetch("/api/auth/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        })
          .then((r) => {
            history.replaceState(null, "", location.pathname);
            if (!r.ok) {
              setExpired(true);
              return false;
            }
            writeHint({ ...readHint(), in: true });
            return true;
          })
          .catch(() => false)
      : Promise.resolve(false);
    void signIn.then((justIn) => {
      if (justIn && next && /^\/(?!\/)/.test(next) && !next.startsWith("/compte/")) {
        // First sync before leaving, so the coins are waiting there.
        void syncNow({ force: true }).finally(() => location.assign(next));
        return;
      }
      void authConfig().then((c) => {
        setCfg(c);
        if (c.enabled) {
          void load().then((u) => {
            if (u) void syncNow({ force: true }).then(() => load());
          });
        } else setMe(null);
      });
    });
  }, [load]);

  if (cfg === null || me === undefined) {
    return <p className="acct-loading">{tr("account.loading")}</p>;
  }
  if (!cfg.enabled) {
    return (
      <section className="acct-card">
        <h2>{tr("account.offTitle")}</h2>
        <p>{tr("account.offText")}</p>
        <p>
          <a href="/progression/">{tr("account.offLink")}</a>
        </p>
      </section>
    );
  }
  if (!me) return <Login cfg={cfg} expired={expired} tr={tr} />;

  const owned = new Set([...(data?.owned ?? []), ...ITEMS.filter((i) => i.price === 0).map((i) => i.id)]);
  const look = draft ?? me.look;
  const coins = data?.coins ?? me.coins;
  const changed = JSON.stringify(look) !== JSON.stringify(data?.look ?? me.look);

  async function buy(id: string) {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/shop/buy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) setMsg(tr(j.error === "insufficient" ? "shop.noFunds" : "shop.error"));
      else {
        setMsg(tr("shop.bought"));
        const item = ITEMS.find((i) => i.id === id);
        if (item) setDraft((d) => ({ ...(d ?? me!.look), [item.slot]: item.id }));
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveLook() {
    setBusy(true);
    try {
      const r = await fetch("/api/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ look }),
      });
      setMsg(tr(r.ok ? "avatar.saved" : "shop.error"));
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(tr("account.deleteConfirm"))) return;
    setBusy(true);
    try {
      await fetch("/api/account", { method: "DELETE" });
      writeHint({ in: false });
      location.href = "/";
    } finally {
      setBusy(false);
    }
  }

  const streak = data?.streak ?? me.streak;
  const lastSync = readHint().sync;

  return (
    <div className="acct">
      <section className="acct-hero">
        <Avatar look={look} size={148} label={tr("avatar.aria")} />
        <div className="acct-hero-text">
          <p className="acct-hello">{tr("account.hello")}</p>
          <p className="acct-email">{me.email}</p>
          <div className="acct-stats">
            <div className="acct-stat acct-stat--coins">
              <span className="coin-dot coin-dot--big" aria-hidden="true" />
              <strong>{coins}</strong>
              <span>{tr("coins.unit")}</span>
            </div>
            <div className="acct-stat">
              <strong>{streak?.current ?? 0}</strong>
              <span>{tr("streak.days", { n: streak?.current ?? 0 })}</span>
            </div>
            <div className="acct-stat">
              <strong>{streak?.best ?? 0}</strong>
              <span>{tr("streak.best")}</span>
            </div>
            <div className="acct-stat">
              <strong>{streak?.freezes ?? 0}</strong>
              <span>{tr("streak.freezes")}</span>
            </div>
          </div>
          <p className="acct-private">{tr("account.private")}</p>
        </div>
      </section>

      <section className="acct-card" aria-labelledby="acct-wardrobe">
        <h2 id="acct-wardrobe">{tr("avatar.title")}</h2>
        <p className="acct-muted">{tr("avatar.intro")}</p>
        <div className="wardrobe-tabs" role="tablist">
          {SLOTS.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={slot === s}
              className="wardrobe-tab"
              onClick={() => setSlot(s)}
            >
              {tr(`avatar.slot.${s}`)}
            </button>
          ))}
        </div>
        <div className="wardrobe-grid" role="tabpanel">
          {ITEMS.filter((i) => i.slot === slot).map((i) => {
            const have = owned.has(i.id);
            const on = look[slot] === i.id;
            const preview = sanitizeLook({ ...look, [slot]: i.id }, ITEMS.map((x) => x.id));
            return (
              <div key={i.id} className={`wardrobe-item${on ? " is-on" : ""}${have ? "" : " is-locked"}`}>
                <button
                  type="button"
                  className="wardrobe-try"
                  aria-pressed={on}
                  disabled={!have}
                  onClick={() => setDraft({ ...look, [slot]: i.id })}
                  title={tr(`avatar.items.${i.name}`)}
                >
                  <Avatar look={preview} size={64} still />
                  <span className="wardrobe-name">{tr(`avatar.items.${i.name}`)}</span>
                </button>
                {!have && (
                  <button
                    type="button"
                    className="wardrobe-buy"
                    disabled={busy || coins < i.price}
                    onClick={() => void buy(i.id)}
                  >
                    <span className="coin-dot" aria-hidden="true" /> {i.price}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="acct-row">
          <button type="button" className="acct-btn acct-btn--primary" disabled={!changed || busy} onClick={() => void saveLook()}>
            {tr("avatar.save")}
          </button>
          {msg && (
            <span className="acct-msg" role="status">
              {msg}
            </span>
          )}
        </div>
      </section>

      <section className="acct-card" aria-labelledby="acct-shop">
        <h2 id="acct-shop">{tr("shop.title")}</h2>
        <div className="shop-freeze">
          <div>
            <strong>{tr("shop.freezeName")}</strong>
            <p className="acct-muted">{tr("shop.freezeText", { max: MAX_FREEZES })}</p>
          </div>
          <button
            type="button"
            className="wardrobe-buy"
            disabled={busy || coins < (freeze?.price ?? STREAK_FREEZE.price) || (freeze?.held ?? 0) >= MAX_FREEZES}
            onClick={() => void buy(STREAK_FREEZE.id)}
          >
            <span className="coin-dot" aria-hidden="true" /> {freeze?.price ?? STREAK_FREEZE.price}
          </button>
        </div>
        <h3>{tr("coins.howTitle")}</h3>
        <ul className="acct-rules">
          <li>{tr("coins.ruleRead")}</li>
          <li>{tr("coins.ruleReview")}</li>
          <li>{tr("coins.ruleDay")}</li>
          <li>{tr("coins.ruleStreak")}</li>
        </ul>
      </section>

      <section className="acct-card" aria-labelledby="acct-cal">
        <h2 id="acct-cal">{tr("calendar.title")}</h2>
        <ActivityCalendar />
      </section>

      {data && data.ledger.length > 0 && (
        <section className="acct-card" aria-labelledby="acct-ledger">
          <h2 id="acct-ledger">{tr("coins.ledgerTitle")}</h2>
          <ul className="ledger">
            {groupLedger(data.ledger).slice(0, 20).map((e, i) => (
              <li key={`${e.day}-${e.kind}-${e.ref}-${i}`}>
                <span className="ledger-day">{dayLabel(e.day, locale)}</span>
                <span className="ledger-what">
                  {tr(`coins.kind.${e.kind}`)}
                  {e.n > 1 && <span className="ledger-ref"> × {e.n}</span>}
                  {e.ref && (e.kind === "read" || e.kind === "purchase") && (
                    <span className="ledger-ref"> · {e.kind === "purchase" ? itemName(e.ref, tr) : prettyRef(e.ref)}</span>
                  )}
                </span>
                <span className={`ledger-amount${e.amount < 0 ? " is-neg" : ""}`}>
                  {e.amount > 0 ? `+${e.amount}` : e.amount}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="acct-card" aria-labelledby="acct-settings">
        <h2 id="acct-settings">{tr("account.settings")}</h2>
        <p className="acct-muted">
          {lastSync
            ? tr("account.syncedAt", { time: new Date(lastSync).toLocaleString(locale) })
            : tr("account.notSynced")}
        </p>
        <div className="acct-row">
          <SyncButton tr={tr} onDone={load} />
          <a className="acct-btn" href="/progression/">
            {tr("nav.progression")}
          </a>
          <button
            type="button"
            className="acct-btn"
            onClick={() => void logout().then(() => (location.href = "/"))}
          >
            {tr("account.logout")}
          </button>
          <button type="button" className="acct-btn acct-btn--danger" disabled={busy} onClick={() => void remove()}>
            {tr("account.delete")}
          </button>
        </div>
      </section>
    </div>
  );
}

function itemName(ref: string, tr: (k: string) => string): string {
  const id = ref.split("#")[0];
  if (id === STREAK_FREEZE.id) return tr("shop.freezeName");
  const item = ITEMS.find((i) => i.id === id);
  return item ? tr(`avatar.items.${item.name}`) : id;
}

function prettyRef(ref: string): string {
  const last = ref.split("/").pop() ?? ref;
  return decodeURIComponentSafe(last).replace(/-/g, " ");
}
function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function SyncButton({ tr, onDone }: { tr: (k: string) => string; onDone: () => Promise<unknown> }) {
  const [state, setState] = useState<"" | "busy" | "done">("");
  return (
    <button
      type="button"
      className="acct-btn"
      disabled={state === "busy"}
      onClick={() => {
        setState("busy");
        void syncNow({ force: true }).then(async () => {
          await onDone();
          setState("done");
        });
      }}
    >
      {tr(state === "done" ? "account.synced" : "account.syncNow")}
    </button>
  );
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      getResponse: (id?: string) => string | undefined;
      reset: (id?: string) => void;
    };
  }
}

function Login({
  cfg,
  expired,
  tr,
}: {
  cfg: AuthConfig;
  expired: boolean;
  tr: (k: string, v?: Record<string, string | number>) => string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"" | "busy" | "sent" | "invalid" | "limited" | "disabled" | "error">("");
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!cfg.turnstileSiteKey) return;
    const render = () => {
      if (window.turnstile && box.current && widget.current == null) {
        widget.current = window.turnstile.render(box.current, {
          sitekey: cfg.turnstileSiteKey,
          size: "flexible",
          theme: "auto",
        });
      }
    };
    if (window.turnstile) render();
    else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
  }, [cfg.turnstileSiteKey]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const token = window.turnstile && widget.current != null ? window.turnstile.getResponse(widget.current) ?? "" : "";
    const r = await requestLink(email.trim(), token);
    setState(r);
    if (window.turnstile && widget.current != null) window.turnstile.reset(widget.current);
  }

  return (
    <section className="acct-login">
      <div className="acct-login-art">
        <Avatar size={120} label={tr("avatar.aria")} />
      </div>
      <div className="acct-login-body">
        <h2>{tr("account.loginTitle")}</h2>
        <p className="acct-muted">{tr("account.loginIntro")}</p>
        <ul className="acct-perks">
          <li>{tr("account.perkSync")}</li>
          <li>{tr("account.perkCoins")}</li>
          <li>{tr("account.perkAvatar")}</li>
        </ul>
        {expired && <p className="acct-warn">{tr("account.expired")}</p>}
        {state === "sent" ? (
          <p className="acct-ok" role="status">
            {tr("account.sent", { email })}
          </p>
        ) : (
          <form className="acct-form" onSubmit={(e) => void submit(e)}>
            <label>
              <span>{tr("account.emailLabel")}</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={tr("account.emailPlaceholder")}
              />
            </label>
            <div ref={box} className="acct-turnstile" />
            <button type="submit" className="acct-btn acct-btn--primary" disabled={state === "busy"}>
              {tr("account.sendLink")}
            </button>
            {state && state !== "busy" && (
              <p className="acct-warn" role="alert">
                {tr(`account.err.${state}`)}
              </p>
            )}
          </form>
        )}
        <p className="acct-muted acct-small">{tr("account.privacy")}</p>
      </div>
    </section>
  );
}
