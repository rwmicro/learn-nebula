// Outgoing mail (SMTP via nodemailer) — only the login link for now.
// Configured by SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_SECURE/MAIL_FROM;
// with SMTP_HOST unset nothing is ever sent (see routes/auth.ts for the
// AUTH_DEV_LOG console fallback).

import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env.ts";
import { SITE_TITLE } from "../lib/site.ts";
import { DEFAULT_LOCALE, t, type Locale } from "../lib/i18n.ts";

const from = () => env.mailFrom || env.smtpUser;

export function mailConfigured(): boolean {
  return Boolean(env.smtpHost && from());
}

let transport: Transporter | null = null;

function transporter(): Transporter {
  transport ??= nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  });
  return transport;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const RTL = new Set<Locale>(["ar"]);
const SERIF = "Alegreya,Georgia,'Times New Roman',serif";
const SANS = "'Alegreya Sans',Arial,Helvetica,sans-serif";

/** The login mail in the reader's locale: plain text plus an HTML version
 *  laid out with tables and inline styles (what mail clients render), a
 *  hidden preview line for the inbox, and a dark variant for the clients
 *  that honour prefers-color-scheme. Copy lives in messages/*.json (mail.login). */
export function loginMail(
  link: string,
  locale: Locale = DEFAULT_LOCALE,
): { subject: string; text: string; html: string } {
  const m = (key: string) => t(`mail.login.${key}`, { site: SITE_TITLE }, locale);
  const host = new URL(link).host;
  const subject = m("subject");
  const text = [
    m("title"),
    "",
    m("intro"),
    "",
    link,
    "",
    m("validity"),
    m("ignore"),
    "",
    `— ${SITE_TITLE} · ${host}`,
  ].join("\n");
  const e = (key: string) => escapeHtml(m(key));
  const href = escapeHtml(link);
  const site = escapeHtml(SITE_TITLE);
  const dir = RTL.has(locale) ? "rtl" : "ltr";
  const sprout = escapeHtml(`${new URL(link).origin}/mail/sprout.png`);
  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .gk-bg { background: #121211 !important; }
  .gk-card { background: #1c1b19 !important; }
  .gk-ink { color: #ecebe7 !important; }
  .gk-soft { color: #bdb9b1 !important; }
  .gk-rule { border-color: #33322e !important; }
  .gk-link { color: #9fc0dd !important; }
  .gk-btn { background: #86b893 !important; color: #1c1b19 !important; }
  .gk-pill { background: #233027 !important; color: #a3c9a9 !important; }
}
@media (max-width: 600px) { .gk-pad { padding: 32px 22px 26px !important; } }
</style>
</head>
<body class="gk-bg" style="margin:0;padding:0;background:#ecebe7">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${e("preheader")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gk-bg" style="background:#ecebe7">
<tr><td align="center" style="padding:40px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gk-card" style="max-width:500px;background:#fcfcfc;border-radius:12px">
<tr><td class="gk-pad" align="center" dir="${dir}" style="padding:44px 44px 36px;text-align:center">
<img src="${sprout}" width="64" height="64" alt="" style="display:block;margin:0 auto;border:0">
<p class="gk-soft" style="margin:20px 0 0;font-family:${SERIF};font-size:15px;letter-spacing:.08em;font-variant:small-caps;color:#555">${site}</p>
<h1 class="gk-ink" style="margin:14px 0 0;font-family:${SERIF};font-size:30px;font-weight:500;line-height:1.2;color:#111">${e("title")}</h1>
<p class="gk-soft" style="margin:16px 0 0;font-family:${SERIF};font-size:17px;line-height:1.55;color:#333">${e("intro")}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0"><tr>
<td class="gk-btn" align="center" style="background:#3f6b4a;border-radius:8px"><a href="${href}" class="gk-btn" style="display:block;padding:16px 24px;font-family:${SANS};font-size:18px;font-weight:500;color:#fcfcfc;text-decoration:none;border-radius:8px;background:#3f6b4a">${e("button")}</a></td>
</tr></table>
<p style="margin:18px 0 0"><span class="gk-pill" style="display:inline-block;padding:6px 12px;border-radius:999px;background:#eef3ec;color:#345a3e;font-family:${SANS};font-size:13px">${e("validity")}</span></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0"><tr>
<td class="gk-rule" style="border-top:1px solid #eeeeee;padding-top:18px;text-align:center">
<p class="gk-soft" style="margin:0;font-family:${SANS};font-size:13px;color:#555">${e("fallback")}</p>
<p style="margin:6px 0 0;font-family:${SANS};font-size:13px;word-break:break-all"><a href="${href}" class="gk-link" style="color:#003366">${href}</a></p>
</td></tr></table>
</td></tr></table>
<p class="gk-soft" dir="${dir}" style="margin:22px auto 0;max-width:500px;font-family:${SANS};font-size:13px;line-height:1.5;color:#555;text-align:center">${e("ignore")}</p>
</td></tr></table>
</body>
</html>`;
  return { subject, text, html };
}

export async function sendLoginMail(to: string, link: string, locale: Locale = DEFAULT_LOCALE): Promise<void> {
  const m = loginMail(link, locale);
  await transporter().sendMail({ from: from(), to, subject: m.subject, text: m.text, html: m.html });
}
