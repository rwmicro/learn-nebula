"use client";

import { useState } from "react";
import { Avatar } from "@/components/account/Avatar";
import type { Me } from "@/lib/account-client";
import { ITEMS, ITEM_BY_ID, MAX_FREEZES, STREAK_FREEZE, sanitizeLook, type Look, type Slot } from "@/lib/avatar";
import { plural, type AccountData, type FreezeInfo, type Tr } from "@/components/account/shared";
import { Coin, CoinPill, IconCheck, IconLock, IconSnow, TopBar } from "@/components/account/icons";

const SLOTS: Slot[] = ["body", "hat", "accessory", "background"];
const ALL_IDS = ITEMS.map((i) => i.id);

/**
 * "Mon jardinier" on a phone: a large preview of what is being tried, the
 * wardrobe in four tabs (worn / free / yours / to buy / out of reach), the
 * streak freeze of the shop, and a bottom bar once something changed:
 * "Acheter · N" buys every part of the look not owned yet then saves the
 * look, in one tap (the same /api/shop/buy and PUT /api/me as the desktop
 * page, chained); "Enregistrer" when nothing is left to buy.
 */
export function Wardrobe({
  me,
  data,
  freeze,
  reload,
  tr,
  locale,
  onBack,
}: {
  me: Me;
  data: AccountData | null;
  freeze: FreezeInfo | null;
  reload: () => Promise<unknown>;
  tr: Tr;
  locale: string;
  onBack: () => void;
}) {
  const saved = data?.look ?? me.look;
  const coins = data?.coins ?? me.coins;
  const [draft, setDraft] = useState<Look | null>(null);
  const [slot, setSlot] = useState<Slot>("hat");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const look = draft ?? saved;
  const owned = new Set([...(data?.owned ?? []), ...ITEMS.filter((i) => i.price === 0).map((i) => i.id)]);
  const changed = SLOTS.some((s) => look[s] !== saved[s]);
  const toBuy = SLOTS.map((s) => ITEM_BY_ID.get(look[s])).filter((i) => i && !owned.has(i.id)) as typeof ITEMS;
  const cost = toBuy.reduce((n, i) => n + i.price, 0);
  const tried = ITEM_BY_ID.get(look[slot]);
  const freezes = freeze?.held ?? me.streak?.freezes ?? 0;
  const maxF = freeze?.max ?? MAX_FREEZES;
  const fPrice = freeze?.price ?? STREAK_FREEZE.price;

  async function post(id: string): Promise<boolean> {
    const r = await fetch("/api/shop/buy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (r.ok) return true;
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setMsg(tr(j.error === "insufficient" ? "shop.noFunds" : "shop.error"));
    return false;
  }

  async function commit() {
    setBusy(true);
    setMsg("");
    try {
      for (const i of toBuy) if (!(await post(i.id))) return;
      const r = await fetch("/api/me", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ look }),
      });
      setMsg(tr(!r.ok ? "shop.error" : toBuy.length ? "compte.boughtWorn" : "avatar.saved"));
      await reload();
      if (r.ok) setDraft(null);
    } catch {
      setMsg(tr("shop.error"));
    } finally {
      setBusy(false);
    }
  }

  async function buyFreeze() {
    setBusy(true);
    setMsg("");
    try {
      if (await post(STREAK_FREEZE.id)) {
        setMsg(tr("shop.bought"));
        await reload();
      }
    } finally {
      setBusy(false);
    }
  }

  const items = ITEMS.filter((i) => i.slot === slot);
  const name = (id: string) => tr(`avatar.items.${ITEM_BY_ID.get(id)?.name ?? "none"}`);

  return (
    <>
      <TopBar label={tr("compte.back")} onBack={onBack} title={tr("avatar.title")} right={<CoinPill n={coins} />} />
      <div className="ap-preview">
        <Avatar look={look} size={104} label={tr("avatar.aria")} />
        <div className="ap-tx">
          <small className="ap-kicker">{tr("compte.preview")}</small>
          <b>{changed && tried ? name(tried.id) : tr("compte.yourLook")}</b>
          <small>{tr("compte.previewSub")}</small>
        </div>
      </div>

      <div className="ap-seg" role="tablist">
        {SLOTS.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={slot === s} onClick={() => setSlot(s)}>
            {tr(`avatar.slot.${s}`)}
          </button>
        ))}
      </div>

      <div className="ap-wgrid" role="tabpanel">
        {items.map((i) => {
          const have = owned.has(i.id);
          const on = look[slot] === i.id;
          const reach = have || i.price <= coins;
          const worn = saved[slot] === i.id;
          const preview = sanitizeLook({ ...look, [slot]: i.id }, ALL_IDS);
          const cls = ["ap-wi", on && "is-on", !have && reach && "is-buy", !reach && "is-lock"].filter(Boolean).join(" ");
          return (
            <button
              key={i.id}
              type="button"
              className={cls}
              aria-pressed={on}
              disabled={!reach || busy}
              onClick={() => setDraft({ ...look, [slot]: i.id })}
            >
              <Avatar look={preview} size={62} still />
              {on && (
                <span className="ap-wi-tick" aria-hidden="true">
                  <IconCheck />
                </span>
              )}
              {!reach && (
                <span className="ap-wi-lock" aria-hidden="true">
                  <IconLock />
                </span>
              )}
              <b>{tr(`avatar.items.${i.name}`)}</b>
              <small>
                {worn ? (
                  tr("compte.worn")
                ) : have ? (
                  tr(i.price === 0 ? "compte.free" : "compte.yours")
                ) : reach ? (
                  <>
                    <Coin /> {i.price}
                    {on && ` · ${tr("compte.tried")}`}
                  </>
                ) : (
                  <>
                    <Coin /> {i.price} · {tr("shop.missing", { n: i.price - coins })}
                  </>
                )}
              </small>
            </button>
          );
        })}
        {items.length % 3 !== 0 && <div className="ap-wi ap-wi--soon">{tr("compte.soon")}</div>}
      </div>

      <h2 className="ap-sect">{tr("shop.title")}</h2>
      <div className="ap-card ap-freeze">
        <span className="ap-ico ap-ico--ice" aria-hidden="true">
          <IconSnow />
        </span>
        <span className="ap-tx">
          <b>
            {tr("shop.freezeName")}{" "}
            <span className="ap-mini">
              {freezes} / {maxF}
            </span>
          </b>
          <small>{tr("compte.freezeText")}</small>
        </span>
        <button
          type="button"
          className="ap-price"
          disabled={busy || coins < fPrice || freezes >= maxF}
          aria-label={`${tr("shop.buy")} · ${tr("shop.freezeName")} · ${fPrice} ${plural(tr, locale, "coins.unit", fPrice)}`}
          onClick={() => void buyFreeze()}
        >
          <Coin />
          {fPrice}
        </button>
      </div>

      {msg && !changed && (
        <p className="ap-toast" role="status">
          {msg}
        </p>
      )}

      {changed && (
        <div className="ap-bottom">
          <p role="status">
            {msg ||
              (cost > 0
                ? tr("compte.unsavedCost", { cost })
                : tr("avatar.unsaved"))}
          </p>
          <div>
            <button type="button" className="ap-btn ap-btn--alt" disabled={busy} onClick={() => setDraft(null)}>
              {tr("account.cancel")}
            </button>
            <button type="button" className="ap-btn" disabled={busy || cost > coins} onClick={() => void commit()}>
              {cost > coins ? (
                tr("compte.short", { n: cost - coins })
              ) : cost > 0 ? (
                <>
                  {tr("shop.buy")} · <Coin /> {cost}
                </>
              ) : (
                tr("compte.save")
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
