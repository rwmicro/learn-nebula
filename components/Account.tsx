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
  STREAK_MILESTONES,
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
  const [ledgerAll, setLedgerAll] = useState(false);
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
      <section className="acct-card acct-card--off">
        <h2>{tr("account.offTitle")}</h2>
        <p>{tr("account.offText")}</p>
        <p>
          <a className="acct-btn" href="/progression/">
            {tr("account.offLink")} →
          </a>
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
  const run = streak?.current ?? 0;
  const freezes = freeze?.held ?? streak?.freezes ?? 0;
  const next = nextMilestone(run);
  const days = ledgerDays(groupLedger(data?.ledger ?? []));
  const shownDays = ledgerAll ? days : days.slice(0, LEDGER_DAYS);
  const savedLook = data?.look ?? me.look;

  return (
    <div className="acct">
      <section className="acct-hero">
        <Avatar look={look} size={148} label={tr("avatar.aria")} />
        <div className="acct-hero-text">
          <p className="acct-hello">{tr("account.hello")}</p>
          <p className="acct-email">{me.email}</p>
          <div className="acct-stats">
            <div className="acct-stat acct-stat--coins">
              <strong>
                <span className="coin-dot coin-dot--big" aria-hidden="true" />
                {coins}
              </strong>
              <span>{plural(tr, locale, "coins.unit", coins)}</span>
              {(me.todayCoins ?? 0) > 0 && (
                <span className="acct-stat-sub">{tr("coins.today", { n: me.todayCoins ?? 0 })}</span>
              )}
            </div>
            <div className="acct-stat">
              <strong>{run}</strong>
              <span>{plural(tr, locale, "streak.days", run)}</span>
            </div>
            <div className="acct-stat">
              <strong>{streak?.best ?? 0}</strong>
              <span>{tr("streak.best")}</span>
            </div>
            <div className="acct-stat">
              <strong>{freezes}</strong>
              <span>{plural(tr, locale, "streak.freezes", freezes)}</span>
            </div>
          </div>
          {next && (
            <div className="acct-next">
              <p>{plural(tr, locale, "streak.next", next.at - run, { m: next.at, bonus: next.bonus })}</p>
              <div
                className="acct-next-bar"
                role="progressbar"
                aria-valuemin={next.from}
                aria-valuemax={next.at}
                aria-valuenow={run}
                aria-label={tr("streak.nextAria", { m: next.at })}
              >
                <span style={{ width: `${Math.round(((run - next.from) / (next.at - next.from)) * 100)}%` }} />
              </div>
            </div>
          )}
          <p className="acct-private">{tr("account.private")}</p>
        </div>
      </section>

      <section className="acct-card acct-card--wide" aria-labelledby="acct-wardrobe">
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
                {!have &&
                  (coins >= i.price ? (
                    <button
                      type="button"
                      className="wardrobe-buy"
                      disabled={busy}
                      onClick={() => void buy(i.id)}
                    >
                      <span className="coin-dot" aria-hidden="true" /> {i.price} · {tr("shop.buy")}
                    </button>
                  ) : (
                    <span className="wardrobe-short">
                      <span className="coin-dot" aria-hidden="true" /> {i.price} ·{" "}
                      {tr("shop.missing", { n: i.price - coins })}
                    </span>
                  ))}
              </div>
            );
          })}
        </div>
        <div className="acct-row">
          <button type="button" className="acct-btn acct-btn--primary" disabled={!changed || busy} onClick={() => void saveLook()}>
            {tr("avatar.save")}
          </button>
          {changed && (
            <>
              <button type="button" className="acct-btn" disabled={busy} onClick={() => setDraft(savedLook)}>
                {tr("avatar.cancel")}
              </button>
              <span className="acct-unsaved">{tr("avatar.unsaved")}</span>
            </>
          )}
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
            <strong>{tr("shop.freezeName")}</strong>{" "}
            <span className="shop-held">{tr("shop.held", { n: freezes, max: freeze?.max ?? MAX_FREEZES })}</span>
            <p className="acct-muted">{tr("shop.freezeText", { max: MAX_FREEZES })}</p>
          </div>
          <button
            type="button"
            className="wardrobe-buy"
            disabled={busy || coins < (freeze?.price ?? STREAK_FREEZE.price) || freezes >= (freeze?.max ?? MAX_FREEZES)}
            onClick={() => void buy(STREAK_FREEZE.id)}
          >
            <span className="coin-dot" aria-hidden="true" /> {freeze?.price ?? STREAK_FREEZE.price}
          </button>
        </div>
        <details className="acct-how">
          <summary>{tr("coins.howTitle")}</summary>
          <ul className="acct-rules">
            <li>{tr("coins.ruleRead")}</li>
            <li>{tr("coins.ruleReview")}</li>
            <li>{tr("coins.ruleDay")}</li>
            <li>{tr("coins.ruleStreak")}</li>
          </ul>
        </details>
      </section>

      <section className="acct-card" aria-labelledby="acct-cal">
        <h2 id="acct-cal">{tr("calendar.title")}</h2>
        <ActivityCalendar />
      </section>

      {days.length > 0 && (
        <section className="acct-card acct-card--ledger" aria-labelledby="acct-ledger">
          <h2 id="acct-ledger">{tr("coins.ledgerTitle")}</h2>
          <ul className="ledger">
            {shownDays.map((d) => (
              <li key={d.day}>
                <div className="ledger-head">
                  <span>{dayLabel(d.day, locale)}</span>
                  <span className={`ledger-amount${d.total < 0 ? " is-neg" : ""}`}>{signed(d.total)}</span>
                </div>
                <ul className="ledger-rows">
                  {d.rows.map((e, i) => (
                    <li key={`${e.kind}-${e.ref}-${i}`}>
                      <span className="ledger-what">
                        {tr(`coins.kind.${e.kind}`)}
                        {e.n > 1 && <span className="ledger-ref"> × {e.n}</span>}
                        {e.ref && (e.kind === "read" || e.kind === "purchase") && (
                          <span className="ledger-ref"> · {e.kind === "purchase" ? itemName(e.ref, tr) : prettyRef(e.ref)}</span>
                        )}
                      </span>
                      <span className={`ledger-amount${e.amount < 0 ? " is-neg" : ""}`}>{signed(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {days.length > LEDGER_DAYS && (
            <button type="button" className="acct-more" aria-expanded={ledgerAll} onClick={() => setLedgerAll((v) => !v)}>
              {tr(ledgerAll ? "coins.less" : "coins.more")}
            </button>
          )}
        </section>
      )}

      <section className="acct-card acct-card--settings" aria-labelledby="acct-settings">
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
        </div>
        <DangerZone tr={tr} busy={busy} onDelete={remove} />
      </section>
    </div>
  );
}

/** Days of the coin history shown before "Voir plus" (the server sends the
 *  last 50 events). */
const LEDGER_DAYS = 5;

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** `${key}One` when the locale says `n` is singular (fr: 0 and 1; en: 1),
 *  else `key`. Every locale file carries both, zh with the same text. */
function plural(
  tr: (k: string, v?: Record<string, string | number>) => string,
  locale: string,
  key: string,
  n: number,
  vars?: Record<string, string | number>,
): string {
  let one = false;
  try {
    one = new Intl.PluralRules(locale).select(n) === "one";
  } catch {
    one = n === 1;
  }
  return tr(one ? `${key}One` : key, { n, ...vars });
}

/** The next streak bonus still ahead of a run of `run` days, and where the
 *  bar starts (the previous milestone, or 0). Null past the last one. */
function nextMilestone(run: number): { from: number; at: number; bonus: number } | null {
  const steps = Object.keys(STREAK_MILESTONES)
    .map(Number)
    .sort((a, b) => a - b);
  const at = steps.find((m) => m > run);
  if (at === undefined) return null;
  const from = steps.filter((m) => m <= run).pop() ?? 0;
  return { from, at, bonus: STREAK_MILESTONES[at] };
}

/** The grouped history, one block per day with its net total. */
function ledgerDays(rows: (Ledger & { n: number })[]): { day: string; total: number; rows: (Ledger & { n: number })[] }[] {
  const out: { day: string; total: number; rows: (Ledger & { n: number })[] }[] = [];
  for (const e of rows) {
    const last = out[out.length - 1];
    if (last && last.day === e.day) {
      last.rows.push(e);
      last.total += e.amount;
    } else out.push({ day: e.day, total: e.amount, rows: [e] });
  }
  return out;
}

/** Deleting the account: set apart at the bottom of the settings, and armed
 *  only once the reader has typed the confirmation word (the e-mail shown on
 *  the page is masked, so it cannot be the thing to retype). */
function DangerZone({
  tr,
  busy,
  onDelete,
}: {
  tr: (k: string, v?: Record<string, string | number>) => string;
  busy: boolean;
  onDelete: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const word = tr("account.deleteWord");
  const ok = typed.trim().toLocaleLowerCase() === word.toLocaleLowerCase();
  return (
    <div className="acct-danger">
      <h3>{tr("account.dangerTitle")}</h3>
      <p className="acct-muted">{tr("account.deleteText")}</p>
      {open ? (
        <form
          className="acct-danger-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) void onDelete();
          }}
        >
          <label>
            {tr("account.deleteType", { word })}
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
          </label>
          <div className="acct-row">
            <button type="submit" className="acct-btn acct-btn--danger-solid" disabled={!ok || busy}>
              {tr("account.deleteNow")}
            </button>
            <button
              type="button"
              className="acct-btn"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
            >
              {tr("account.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="acct-btn acct-btn--danger" onClick={() => setOpen(true)}>
          {tr("account.delete")}
        </button>
      )}
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
    // /compte/?next=/admin/ (the admin page's "log in with your account"):
    // the e-mailed link brings the reader back there.
    const next = new URLSearchParams(location.search).get("next");
    const r = await requestLink(email.trim(), token, next && /^\/(?!\/)/.test(next) ? next : undefined);
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
