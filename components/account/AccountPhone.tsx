"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { localDay } from "@/lib/personal";
import { logout, readHint, syncNow, writeHint, type Me } from "@/lib/account-client";
import { ITEMS, MAX_FREEZES, STREAK_FREEZE, type Look } from "@/lib/avatar";
import {
  ago,
  groupLedger,
  ledgerDays,
  ledgerRef,
  nextMilestone,
  plural,
  relativeDay,
  signed,
  type AccountData,
  type FreezeInfo,
  type Tr,
} from "@/components/account/shared";
import {
  Chevron,
  Coin,
  IconAt,
  IconCheck,
  IconDownload,
  IconFlame,
  IconGear,
  IconHistory,
  IconLogout,
  IconPencil,
  IconShield,
  IconSnow,
  IconSync,
  IconTrash,
  TopBar,
  CoinPill,
} from "@/components/account/icons";
import { Wardrobe } from "@/components/account/Wardrobe";
import { DeleteSheet } from "@/components/account/DeleteSheet";

export type Screen = "profil" | "jardinier" | "pieces" | "compte";
const SCREENS: Screen[] = ["profil", "jardinier", "pieces", "compte"];

function screenOf(hash: string): Screen {
  const s = hash.replace(/^#/, "") as Screen;
  return SCREENS.includes(s) ? s : "profil";
}

/** The screen in the address's fragment (#jardinier, #compte…), so the
 *  phone's back gesture leaves a pushed screen as it would in an app. */
function useScreen(): [Screen, (s: Screen) => void, () => void] {
  const [screen, setScreen] = useState<Screen>("profil");
  useEffect(() => {
    const read = () => setScreen(screenOf(location.hash));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = useCallback((s: Screen) => {
    history.pushState({ acct: s }, "", s === "profil" ? location.pathname : `#${s}`);
    setScreen(s);
    window.scrollTo(0, 0);
  }, []);
  const back = useCallback(() => {
    if ((history.state as { acct?: string } | null)?.acct) history.back();
    else {
      history.replaceState(null, "", location.pathname);
      setScreen("profil");
    }
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    const onPop = () => setScreen(screenOf(location.hash));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return [screen, go, back];
}

/** Monday..Sunday of this week, as local "YYYY-MM-DD". */
function thisWeek(): string[] {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return localDay(x);
  });
}

/**
 * /compte/ on a phone, signed in: the profile (the sprout, the coins, the
 * streak and this week), and three pushed screens — the wardrobe and shop,
 * the coin history, the account (sync, data, sign out, delete). Same data
 * and calls as the desktop page (components/Account.tsx).
 */
export function AccountPhone({
  me,
  data,
  freeze,
  reload,
  tr,
  locale,
}: {
  me: Me;
  data: AccountData | null;
  freeze: FreezeInfo | null;
  reload: () => Promise<unknown>;
  tr: Tr;
  locale: string;
}) {
  const [screen, go, back] = useScreen();
  const look = data?.look ?? me.look;
  const coins = data?.coins ?? me.coins;
  const streak = data?.streak ?? me.streak;

  if (screen === "jardinier")
    return (
      <div className="ap ap--sub ap--bar" data-screen="jardinier">
        <Wardrobe me={me} data={data} freeze={freeze} reload={reload} tr={tr} locale={locale} onBack={back} />
      </div>
    );
  if (screen === "pieces")
    return (
      <div className="ap ap--sub" data-screen="pieces">
        <History data={data} tr={tr} locale={locale} onBack={back} />
      </div>
    );
  if (screen === "compte")
    return (
      <div className="ap ap--sub" data-screen="compte">
        <Settings me={me} coins={coins} look={look} reload={reload} tr={tr} locale={locale} onBack={back} />
      </div>
    );
  return (
    <div className="ap" data-screen="profil">
      <Profile
        me={me}
        data={data}
        look={look}
        coins={coins}
        streak={streak}
        freeze={freeze}
        tr={tr}
        locale={locale}
        go={go}
      />
    </div>
  );
}

function Profile({
  me,
  data,
  look,
  coins,
  streak,
  freeze,
  tr,
  locale,
  go,
}: {
  me: Me;
  data: AccountData | null;
  look: Look;
  coins: number;
  streak: Me["streak"];
  freeze: FreezeInfo | null;
  tr: Tr;
  locale: string;
  go: (s: Screen) => void;
}) {
  const run = streak?.current ?? 0;
  const freezes = freeze?.held ?? streak?.freezes ?? 0;
  const next = nextMilestone(run);
  const week = useMemo(() => thisWeek(), []);
  const today = localDay();
  const active = data?.activity ?? {};
  const owned = new Set([...(data?.owned ?? []), ...ITEMS.filter((i) => i.price === 0).map((i) => i.id)]);
  const reachable = ITEMS.filter((i) => !owned.has(i.id) && i.price <= coins).length;
  const days = ledgerDays(groupLedger(data?.ledger ?? []));
  const last = days[0];
  const since = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(me.createdAt));
  const weekday = (day: string) =>
    new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(`${day}T12:00:00`));

  return (
    <>
      <button type="button" className="ap-gbtn ap-gear" aria-label={tr("compte.account")} onClick={() => go("compte")}>
        <IconGear />
      </button>
      <section className="ap-hero">
        <button type="button" className="ap-hero-av" aria-label={tr("compte.dress")} onClick={() => go("jardinier")}>
          <Avatar look={look} size={128} label={tr("avatar.aria")} />
          <span className="ap-pencil" aria-hidden="true">
            <IconPencil />
          </span>
        </button>
        <h1 className="ap-h1">{tr("account.hello")}</h1>
        <p className="ap-who">
          {me.email} · {tr("compte.since", { date: since })}
        </p>
      </section>

      <div className="ap-stat3">
        <div className="ap-st ap-st--gold">
          <b>
            <Coin big />
            {coins}
          </b>
          <small>{plural(tr, locale, "coins.unit", coins)}</small>
          {(me.todayCoins ?? 0) > 0 && <em>{tr("coins.today", { n: me.todayCoins ?? 0 })}</em>}
        </div>
        <div className="ap-st">
          <b>
            <IconFlame />
            {run}
          </b>
          <small>{plural(tr, locale, "streak.days", run)}</small>
          <em>{tr("compte.record", { n: streak?.best ?? 0 })}</em>
        </div>
        <div className="ap-st ap-st--ice">
          <b>
            <IconSnow w={2} />
            {freezes}
          </b>
          <small>{plural(tr, locale, "compte.freezes", freezes)}</small>
          <em>{tr("compte.of", { n: freeze?.max ?? MAX_FREEZES })}</em>
        </div>
      </div>

      <div className="ap-card ap-weekcard">
        <ol className="ap-week" aria-label={tr("compte.weekAria", { n: week.filter((d) => active[d] > 0).length })}>
          {week.map((d) => {
            const done = active[d] > 0;
            const cls = done ? "is-done" : d === today ? "is-today" : "";
            return (
              <li key={d} className={cls}>
                <i>{done && <IconCheck />}</i>
                {weekday(d)}
              </li>
            );
          })}
        </ol>
        {next ? (
          <div className="ap-next">
            <p>
              <span>{tr("compte.streakGoal", { m: next.at })}</span>
              <span>
                <b>+{next.bonus}</b> {plural(tr, locale, "compte.streakIn", next.at - run)}
              </span>
            </p>
            <div
              className="ap-pbar"
              role="progressbar"
              aria-valuemin={next.from}
              aria-valuemax={next.at}
              aria-valuenow={run}
              aria-label={tr("streak.nextAria", { m: next.at })}
            >
              <i style={{ width: `${Math.max(3, Math.round(((run - next.from) / (next.at - next.from)) * 100))}%` }} />
            </div>
          </div>
        ) : (
          <p className="ap-next">{tr("compte.streakTop")}</p>
        )}
      </div>

      <h2 className="ap-sect">{tr("compte.myGarden")}</h2>
      <div className="ap-list">
        <button type="button" className="ap-row" onClick={() => go("jardinier")}>
          <span className="ap-ico ap-ico--av" aria-hidden="true">
            <Avatar look={look} size={36} still />
          </span>
          <span className="ap-tx">
            <b>{tr("compte.dress")}</b>
            <small>{reachable ? tr("compte.dressSub", { n: reachable }) : tr("compte.dressSubNone")}</small>
          </span>
          <Chevron />
        </button>
        <button type="button" className="ap-row" onClick={() => go("pieces")}>
          <span className="ap-ico ap-ico--gold" aria-hidden="true">
            <IconHistory />
          </span>
          <span className="ap-tx">
            <b>{tr("coins.ledgerTitle")}</b>
            <small>
              {last
                ? `${relativeDay(last.day, locale)} : ${signed(last.total)}${
                    ledgerRef(last.rows[0], tr) ? ` · ${ledgerRef(last.rows[0], tr)}` : ""
                  }`
                : tr("compte.historyEmpty")}
            </small>
          </span>
          <Chevron />
        </button>
      </div>
    </>
  );
}

function History({ data, tr, locale, onBack }: { data: AccountData | null; tr: Tr; locale: string; onBack: () => void }) {
  const days = ledgerDays(groupLedger(data?.ledger ?? []));
  return (
    <>
      <TopBar label={tr("compte.back")} onBack={onBack} title={tr("coins.ledgerTitle")} right={<CoinPill n={data?.coins} />} />
      {days.length === 0 && <p className="ap-fine ap-fine--left">{tr("compte.historyEmpty")}</p>}
      {days.map((d) => (
        <section key={d.day}>
          <h2 className="ap-sect ap-sect--split">
            <span>{relativeDay(d.day, locale)}</span>
            <span className={d.total < 0 ? "is-neg" : "is-pos"}>{signed(d.total)}</span>
          </h2>
          <ul className="ap-list ap-list--flat">
            {d.rows.map((e, i) => (
              <li key={`${e.kind}-${e.ref}-${i}`} className="ap-row ap-row--tight">
                <span className="ap-tx">
                  <b>
                    {tr(`coins.kind.${e.kind}`)}
                    {e.n > 1 && ` × ${e.n}`}
                  </b>
                  {ledgerRef(e, tr) && <small>{ledgerRef(e, tr)}</small>}
                </span>
                <span className={`ap-amount${e.amount < 0 ? " is-neg" : ""}`}>{signed(e.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <details className="ap-how">
        <summary>{tr("coins.howTitle")}</summary>
        <ul>
          <li>{tr("coins.ruleRead")}</li>
          <li>{tr("coins.ruleReview")}</li>
          <li>{tr("coins.ruleDay")}</li>
          <li>{tr("coins.ruleStreak")}</li>
        </ul>
      </details>
    </>
  );
}

function Settings({
  me,
  coins,
  look,
  reload,
  tr,
  locale,
  onBack,
}: {
  me: Me;
  coins: number;
  look: Look;
  reload: () => Promise<unknown>;
  tr: Tr;
  locale: string;
  onBack: () => void;
}) {
  const [sync, setSync] = useState<"" | "busy" | "done">("");
  const [lastSync, setLastSync] = useState<number | undefined>(undefined);
  const [kept, setKept] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const read = () => setLastSync(readHint().sync);
    read();
    window.addEventListener("gk:account", read);
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => {
      window.removeEventListener("gk:account", read);
      window.clearInterval(id);
    };
  }, []);

  async function remove() {
    await fetch("/api/account", { method: "DELETE" });
    writeHint({ in: false });
    location.href = "/";
  }

  return (
    <>
      <TopBar label={tr("compte.back")} onBack={onBack} title={tr("compte.account")} />
      <div className="ap-card ap-sync">
        <span className={`ap-ring${lastSync ? " is-ok" : ""}${sync === "busy" ? " is-busy" : ""}`} aria-hidden="true">
          <IconSync />
        </span>
        <span className="ap-tx" role="status">
          <b>{tr(lastSync ? "compte.synced" : "compte.notSynced")}</b>
          <small>
            {lastSync ? tr("compte.syncedSub", { ago: capital(ago(lastSync, locale), locale) }) : tr("compte.syncedSubNever")}
          </small>
        </span>
        <button
          type="button"
          className="ap-pill ap-pill--g ap-pill--btn"
          disabled={sync === "busy"}
          onClick={() => {
            setSync("busy");
            void syncNow({ force: true }).then(async () => {
              await reload();
              setLastSync(readHint().sync);
              setSync("done");
            });
          }}
        >
          {tr(sync === "busy" ? "compte.syncing" : "compte.sync")}
        </button>
      </div>

      <h2 className="ap-sect">{tr("compte.myData")}</h2>
      <div className="ap-list">
        <div className="ap-row">
          <span className="ap-ico" aria-hidden="true">
            <IconAt />
          </span>
          <span className="ap-tx">
            <b>{tr("compte.email")}</b>
            <small>{me.email}</small>
          </span>
        </div>
        <a className="ap-row" href="/progression/">
          <span className="ap-ico" aria-hidden="true">
            <IconDownload />
          </span>
          <span className="ap-tx">
            <b>{tr("compte.export")}</b>
            <small>{tr("compte.exportSub")}</small>
          </span>
          <Chevron />
        </a>
        <button type="button" className="ap-row" aria-expanded={kept} onClick={() => setKept((v) => !v)}>
          <span className="ap-ico" aria-hidden="true">
            <IconShield />
          </span>
          <span className="ap-tx">
            <b>{tr("compte.kept")}</b>
            <small>{kept ? tr("account.privacy") : tr("compte.keptSub")}</small>
          </span>
          <span className={`ap-chevwrap${kept ? " is-open" : ""}`}>
            <Chevron />
          </span>
        </button>
      </div>

      <div className="ap-list ap-list--gap">
        <button type="button" className="ap-row ap-row--short" onClick={() => void logout().then(() => (location.href = "/"))}>
          <span className="ap-ico ap-ico--grey" aria-hidden="true">
            <IconLogout />
          </span>
          <span className="ap-tx">
            <b>{tr("account.logout")}</b>
          </span>
        </button>
      </div>
      <div className="ap-list ap-list--gap2">
        <button type="button" className="ap-row ap-row--short ap-row--danger" onClick={() => setSheet(true)}>
          <span className="ap-ico ap-ico--red" aria-hidden="true">
            <IconTrash />
          </span>
          <span className="ap-tx">
            <b>{tr("account.delete")}</b>
          </span>
          <Chevron />
        </button>
      </div>
      <p className="ap-fine ap-fine--left">{tr("compte.afterDelete")}</p>
      {sheet && <DeleteSheet coins={coins} look={look} tr={tr} onClose={() => setSheet(false)} onDelete={remove} />}
    </>
  );
}

function capital(s: string, locale: string): string {
  return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
}
