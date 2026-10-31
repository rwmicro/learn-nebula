"use client";

import { SCENES } from "@/lib/deco-art";
import { useEffect, useState, type ReactNode } from "react";
import { Avatar } from "@/components/account/Avatar";
import { requestLink, type AuthConfig } from "@/lib/account-client";
import { SITE_TITLE } from "@/lib/site";
import { defaultLook } from "@/lib/avatar";
import { nextParam, useTurnstile } from "@/components/account/use-turnstile";
import { usePasskeyAutofill } from "@/components/account/use-passkey-autofill";
import type { Tr } from "@/components/account/shared";
import { Coin, IconArrow, IconMail, IconSync, IconTimer, TopBar } from "@/components/account/icons";

/** How long the e-mailed link lives (server: LOGIN_TTL_MS). */
const LINK_TTL_MS = 15 * 60_000;
/** Wait before "Renvoyer le lien" (the server allows 3 links per address per
 *  quarter hour, so this keeps a reader from spending them by impatience). */
const RESEND_AFTER_MS = 60_000;

type State = "" | "busy" | "invalid" | "limited" | "disabled" | "error";

/** Leave the login: back where the reader came from on this site, else home. */
function leave() {
  try {
    if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) {
      history.back();
      return;
    }
  } catch {
    /* fall through */
  }
  location.href = "/";
}

/**
 * The phone login (/compte/ signed out): "Connexion", the address and the
 * button first and the three perks below; once sent, "Lien envoyé", a screen
 * of its own with the address, how long the link lives, the three steps and a
 * resend after a short wait. The Turnstile box keeps its place in the tree
 * across both screens so its widget survives the switch.
 */
export function LoginPhone({ cfg, expired, tr }: { cfg: AuthConfig; expired: boolean; tr: Tr }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [resent, setResent] = useState(false);
  const { box: tsBox, token: tsToken, reset: tsReset } = useTurnstile(cfg.turnstileSiteKey);
  usePasskeyAutofill(cfg.passkey);

  useEffect(() => {
    if (sentAt == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sentAt]);

  async function send(again = false) {
    setState("busy");
    const r = await requestLink(email.trim(), tsToken(), nextParam());
    tsReset();
    if (r === "sent") {
      setState("");
      setSentAt(Date.now());
      setNow(Date.now());
      setResent(again);
      window.scrollTo(0, 0);
    } else setState(r);
  }

  const sent = sentAt != null;
  const left = sent ? Math.max(0, sentAt + LINK_TTL_MS - now) : 0;
  const wait = sent ? Math.max(0, sentAt + RESEND_AFTER_MS - now) : 0;
  const waitLabel = `${Math.floor(wait / 60_000)}:${String(Math.ceil((wait % 60_000) / 1000) % 60).padStart(2, "0")}`;
  const err = state && state !== "busy" && (
    <p className="ap-alert" role="alert">
      {tr(`account.err.${state}`)}
    </p>
  );

  return (
    <div className="ap ap--sub" data-screen={sent ? "sent" : "login"}>
      {sent ? (
        <TopBar icon="close" label={tr("compte.close")} onBack={() => setSentAt(null)} />
      ) : (
        <TopBar label={tr("compte.back")} onBack={leave} />
      )}

      {sent ? (
        <div className="ap-center">
          {/* A letterbox with its flag up (lib/deco-art.ts). */}
          <div className="ap-sent-scene deco" aria-hidden="true" dangerouslySetInnerHTML={{ __html: SCENES.mailbox }} />
          <h1 className="ap-h1">{tr("compte.sentTitle")}</h1>
          <p className="ap-lede">
            {tr("compte.sentTo")}
            <br />
            <b>{email.trim()}</b>
          </p>
          <p className="ap-pill-row" role="status">
            <span className={`ap-pill${left ? " ap-pill--g" : " ap-pill--red"}`}>
              <IconTimer />
              {left ? tr("compte.validFor", { n: Math.ceil(left / 60_000) }) : tr("compte.linkExpired")}
            </span>
          </p>
        </div>
      ) : (
        <div className="ap-center">
          <div className="ap-halo" aria-hidden="true">
            <Avatar look={{ ...defaultLook(), background: "none" }} size={116} />
            <span className="ap-dot ap-dot--gold" />
            <span className="ap-dot ap-dot--coral" />
            <span className="ap-dot ap-dot--green" />
          </div>
          <h1 className="ap-h1">{tr("account.loginTitle")}</h1>
          <p className="ap-lede">{tr("account.loginIntro")}</p>
          {expired && <p className="ap-alert ap-alert--box">{tr("account.expired")}</p>}
        </div>
      )}

      {sent ? (
        <ol className="ap-card ap-steps">
          <li>
            <span>1</span>
            <p>{renderBold(tr("compte.step1", { subject: "\u0000" }), `« ${tr("compte.mailSubject", { site: SITE_TITLE })} »`)}</p>
          </li>
          <li>
            <span>2</span>
            <p>{tr("compte.step2")}</p>
          </li>
          <li>
            <span>3</span>
            <p>{tr("compte.step3")}</p>
          </li>
        </ol>
      ) : (
        <form
          className="ap-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="ap-field">
            <span>{tr("account.emailLabel")}</span>
            <span className="ap-input">
              <IconMail />
              <input
                type="email"
                required
                autoComplete="username webauthn"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={tr("account.emailPlaceholder")}
              />
            </span>
          </label>
          <button type="submit" className="ap-btn" disabled={state === "busy"}>
            {tr("account.sendLink")} <IconArrow />
          </button>
          {err}
        </form>
      )}

      <div ref={tsBox} className="ap-turnstile" />

      {sent ? (
        <div className="ap-after">
          <button
            type="button"
            className="ap-btn ap-btn--alt"
            disabled={wait > 0 || state === "busy"}
            onClick={() => void send(true)}
          >
            {wait > 0 ? tr("compte.resendIn", { t: waitLabel }) : tr("compte.resend")}
          </button>
          {err}
          {resent && !err && wait > 0 && (
            <p className="ap-fine" role="status">
              {tr("compte.resent")}
            </p>
          )}
          <p className="ap-fine">
            {tr("compte.notReceived")}{" "}
            <button type="button" className="ap-link" onClick={() => setSentAt(null)}>
              {tr("compte.changeEmail")}
            </button>
            .
          </p>
        </div>
      ) : (
        <div className="ap-after">
          <h2 className="ap-sect">{tr("compte.withAccount")}</h2>
          <ul className="ap-list">
            <li className="ap-row">
              <span className="ap-ico" aria-hidden="true">
                <IconSync />
              </span>
              <span className="ap-tx">
                <b>{tr("compte.perkSyncT")}</b>
                <small>{tr("compte.perkSyncS")}</small>
              </span>
            </li>
            <li className="ap-row">
              <span className="ap-ico ap-ico--gold" aria-hidden="true">
                <Coin />
              </span>
              <span className="ap-tx">
                <b>{tr("compte.perkCoinsT")}</b>
                <small>{tr("compte.perkCoinsS")}</small>
              </span>
            </li>
            <li className="ap-row">
              <span className="ap-ico ap-ico--av" aria-hidden="true">
                <Avatar look={{ body: "body-leaf", hat: "hat-beret", accessory: "acc-scarf", background: "bg-garden" }} size={36} still />
              </span>
              <span className="ap-tx">
                <b>{tr("compte.perkAvatarT")}</b>
                <small>{tr("compte.perkAvatarS")}</small>
              </span>
            </li>
          </ul>
          <p className="ap-fine">{tr("compte.privacyShort")}</p>
        </div>
      )}
    </div>
  );
}

/** `text` with its "\0" marker replaced by `bold` in <b>. */
export function renderBold(text: string, bold: ReactNode) {
  const [a, b = ""] = text.split("\u0000");
  return (
    <>
      {a}
      <b>{bold}</b>
      {b}
    </>
  );
}
