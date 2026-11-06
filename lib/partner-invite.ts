// The way into /parler/ from a language's notes: under every note of a
// language the partner speaks (Languages - Dialects/<folder>/…), a card that
// opens the partner with that language already picked (/parler/#lang=xx).

import { escapeHtml } from "./escape";
import { i18nAttrs, t } from "./i18n";
import { PARTNER_LANGS, VAULT_FOLDER, type PartnerLang } from "./partner-scenes";

const BY_FOLDER = new Map(
  PARTNER_LANGS.filter((l) => VAULT_FOLDER[l]).map((l) => [VAULT_FOLDER[l].normalize("NFC"), l] as const),
);

/** The partner's language of a vault path, or null. */
export function partnerLangOfPath(rawPath: string): PartnerLang | null {
  const parts = rawPath.normalize("NFC").split("/");
  const i = parts.indexOf("Languages - Dialects");
  if (i < 0 || parts.length < i + 3) return null;
  // A dialect sits one folder deeper ("Arabe/Libanais").
  return BY_FOLDER.get(`${parts[i + 1]}/${parts[i + 2]}`) ?? BY_FOLDER.get(parts[i + 1]) ?? null;
}

const MIC =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

export function partnerInviteHtml(lang: PartnerLang): string {
  const vars = { lang: { $t: `parler.lang_${lang}` } };
  return (
    `<aside class="partner-invite" data-pagefind-ignore>` +
    `<span class="partner-invite-ic">${MIC}</span>` +
    `<span class="partner-invite-txt">` +
    `<b${i18nAttrs("parler.inviteTitle", vars)}>${escapeHtml(t("parler.inviteTitle", vars))}</b>` +
    `<small${i18nAttrs("parler.inviteText")}>${escapeHtml(t("parler.inviteText"))}</small>` +
    `</span>` +
    // public/js/duo-invite.js adds "Lancer un tandem" here when the browser
    // can call (and then moves the card under the note's text).
    `<span class="partner-invite-actions">` +
    `<a class="partner-invite-go" href="/parler/#lang=${lang}"${i18nAttrs("parler.inviteGo")}>${escapeHtml(t("parler.inviteGo"))}</a>` +
    `</span>` +
    `</aside>`
  );
}
