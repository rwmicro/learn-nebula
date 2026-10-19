"use client";

// Two settings of /compte that depend on recent browser APIs: the reader's
// passkeys (lib/passkey-client.ts) and the daily review reminder by Web Push
// (lib/push-client.ts). Each renders nothing when the browser or the server
// can't do it. `phone` picks the phone screens' rows over the desktop card's
// sub-sections (components/account/AccountPhone.tsx, components/Account.tsx).

import { useEffect, useState } from "react";
import {
  createPasskey,
  deletePasskey,
  listPasskeys,
  passkeysSupported,
  type Passkey,
} from "@/lib/passkey-client";
import { DEFAULT_HOUR, pushState, subscribePush, unsubscribePush, type PushState } from "@/lib/push-client";
import type { Tr } from "@/components/account/shared";

/** Fired after a passkey is created elsewhere (the conditional create that
 *  follows a magic-link login), so the list reloads. */
export const PASSKEYS_EVENT = "gk:passkeys";

function shortDate(ms: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

export function Passkeys({ tr, locale, phone = false }: { tr: Tr; locale: string; phone?: boolean }) {
  const [keys, setKeys] = useState<Passkey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!passkeysSupported()) return;
    const load = () => void listPasskeys().then(setKeys);
    load();
    window.addEventListener(PASSKEYS_EVENT, load);
    return () => window.removeEventListener(PASSKEYS_EVENT, load);
  }, []);

  if (!keys) return null;

  async function create() {
    setBusy(true);
    setMsg("");
    const next = await createPasskey();
    if (next) {
      setKeys(next);
      setMsg(tr("passkey.created"));
    } else setMsg(tr("passkey.failed"));
    setBusy(false);
  }

  async function remove(id: string) {
    if (confirm !== id) {
      setConfirm(id);
      return;
    }
    setBusy(true);
    setConfirm(null);
    if (await deletePasskey(id)) {
      setKeys((k) => (k ?? []).filter((x) => x.id !== id));
      setMsg(tr("passkey.deleted"));
    } else setMsg(tr("passkey.failed"));
    setBusy(false);
  }

  const when = (k: Passkey) =>
    k.lastUsedAt
      ? tr("passkey.usedOn", { date: shortDate(k.lastUsedAt, locale) })
      : tr("passkey.createdOn", { date: shortDate(k.createdAt, locale) });
  const status = msg && (
    <p className={phone ? "ap-fine ap-fine--left" : "acct-muted acct-small"} role="status">
      {msg}
    </p>
  );

  if (phone)
    return (
      <>
        <h2 className="ap-sect">{tr("passkey.title")}</h2>
        <div className="ap-list ap-list--flat">
          {keys.map((k) => (
            <div key={k.id} className="ap-row ap-row--short">
              <span className="ap-tx">
                <b>{k.label || tr("passkey.title")}</b>
                <small>{when(k)}</small>
              </span>
              <button
                type="button"
                className={`ap-pill ap-pill--btn${confirm === k.id ? " ap-pill--red" : ""}`}
                disabled={busy}
                onClick={() => void remove(k.id)}
              >
                {tr(confirm === k.id ? "passkey.confirmDelete" : "passkey.delete")}
              </button>
            </div>
          ))}
          <button type="button" className="ap-row ap-row--short" disabled={busy} onClick={() => void create()}>
            <span className="ap-tx">
              <b>{tr("passkey.create")}</b>
              <small>{tr("passkey.intro")}</small>
            </span>
          </button>
        </div>
        {status}
      </>
    );

  return (
    <div className="acct-keys">
      <h3>{tr("passkey.title")}</h3>
      <p className="acct-muted">{tr("passkey.intro")}</p>
      {keys.length > 0 && (
        <ul className="acct-keys-list">
          {keys.map((k) => (
            <li key={k.id}>
              <span>
                <strong>{k.label || tr("passkey.title")}</strong>
                <span className="acct-muted acct-small"> · {when(k)}</span>
              </span>
              <button
                type="button"
                className={`acct-btn${confirm === k.id ? " acct-btn--danger" : ""}`}
                disabled={busy}
                onClick={() => void remove(k.id)}
              >
                {tr(confirm === k.id ? "passkey.confirmDelete" : "passkey.delete")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="acct-row">
        <button type="button" className="acct-btn" disabled={busy} onClick={() => void create()}>
          {tr("passkey.create")}
        </button>
      </div>
      {status}
    </div>
  );
}

function hourLabel(h: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(2026, 0, 1, h));
  } catch {
    return `${h}:00`;
  }
}

export function Reminders({ tr, locale, phone = false }: { tr: Tr; locale: string; phone?: boolean }) {
  const [st, setSt] = useState<PushState | null>(null);
  const [hour, setHour] = useState(DEFAULT_HOUR);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    void pushState().then((s) => {
      setSt(s);
      if (s.hour != null) setHour(s.hour);
    });
  }, []);

  if (!st?.enabled || (!st.supported && !st.needsInstall)) return null;
  const on = st.hour != null;

  async function apply(next: boolean, h: number) {
    if (!st?.publicKey) return;
    setBusy(true);
    setMsg("");
    if (next) {
      const r = await subscribePush(st.publicKey, h, locale);
      if (r === "ok") {
        setSt({ ...st, hour: h });
        setMsg(tr("push.saved", { time: hourLabel(h, locale) }));
      } else setMsg(tr(r === "denied" ? "push.denied" : "push.error"));
    } else {
      if (await unsubscribePush()) setSt({ ...st, hour: null });
      else setMsg(tr("push.error"));
    }
    setBusy(false);
  }

  const install = st.needsInstall && (
    <p className={phone ? "ap-fine ap-fine--left" : "acct-muted acct-small"}>{tr("push.iosInstall")}</p>
  );
  const controls = st.supported && (
    <>
      <label className="acct-switch">
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={busy}
          onChange={(e) => void apply(e.target.checked, hour)}
        />
        <span>{tr("push.toggle")}</span>
      </label>
      <label className="acct-hour">
        <span>{tr("push.hour")}</span>
        <select
          value={hour}
          disabled={busy}
          onChange={(e) => {
            const h = Number(e.target.value);
            setHour(h);
            if (on) void apply(true, h);
          }}
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {hourLabel(h, locale)}
            </option>
          ))}
        </select>
      </label>
    </>
  );
  const status = msg && (
    <p className={phone ? "ap-fine ap-fine--left" : "acct-muted acct-small"} role="status">
      {msg}
    </p>
  );

  if (phone)
    return (
      <>
        <h2 className="ap-sect">{tr("push.title")}</h2>
        {controls && <div className="ap-card acct-push acct-push--phone">{controls}</div>}
        <p className="ap-fine ap-fine--left">{tr("push.intro")}</p>
        {install}
        {status}
      </>
    );

  return (
    <div className="acct-push">
      <h3>{tr("push.title")}</h3>
      <p className="acct-muted">{tr("push.intro")}</p>
      {controls && <div className="acct-row">{controls}</div>}
      {install}
      {status}
    </div>
  );
}
