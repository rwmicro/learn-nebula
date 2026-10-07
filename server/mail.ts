// Outgoing mail (SMTP via nodemailer) — only the login link for now.
// Configured by SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_SECURE/MAIL_FROM;
// with SMTP_HOST unset nothing is ever sent (see routes/auth.ts for the
// AUTH_DEV_LOG console fallback).

import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env.ts";
import { SITE_TITLE } from "../lib/site.ts";

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

/** The login mail, in French: plain text plus a minimal HTML version. */
export function loginMail(link: string): { subject: string; text: string; html: string } {
  const subject = `Ta connexion à ${SITE_TITLE}`;
  const text = [
    "Bonjour,",
    "",
    `Pour te connecter à ${SITE_TITLE}, ouvre ce lien :`,
    "",
    link,
    "",
    "Il est valable 15 minutes et ne sert qu'une fois.",
    "Si tu n'as rien demandé, ignore simplement ce message : aucun compte n'est créé sans ce clic.",
    "",
    `— ${SITE_TITLE}`,
  ].join("\n");
  const href = escapeHtml(link);
  const html = `<!doctype html><html lang="fr"><body style="font-family:Georgia,serif;line-height:1.5;color:#222;max-width:32rem">
<p>Bonjour,</p>
<p>Pour te connecter à ${escapeHtml(SITE_TITLE)}, clique sur ce bouton&nbsp;:</p>
<p><a href="${href}" style="display:inline-block;padding:.6em 1.2em;background:#3f6f3a;color:#fff;text-decoration:none;border-radius:6px">Me connecter</a></p>
<p style="font-size:.9em;color:#555">Ou copie ce lien dans ton navigateur&nbsp;:<br><span style="word-break:break-all">${href}</span></p>
<p style="font-size:.9em;color:#555">Il est valable 15&nbsp;minutes et ne sert qu'une fois. Si tu n'as rien demandé, ignore simplement ce message&nbsp;: aucun compte n'est créé sans ce clic.</p>
</body></html>`;
  return { subject, text, html };
}

export async function sendLoginMail(to: string, link: string): Promise<void> {
  const m = loginMail(link);
  await transporter().sendMail({ from: from(), to, subject: m.subject, text: m.text, html: m.html });
}
