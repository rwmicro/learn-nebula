import type { Metadata } from "next";
import { Account } from "@/components/account/Account";
import { SITE_TITLE } from "@/lib/site";
import { t } from "@/lib/i18n";
import "@/assets/css/account.css";
import { AppBack } from "@/components/layout/AppBack";

// The reader's private page. Static shell only: who is signed in, the coins
// and the avatar come from /api/* with the session cookie (components/
// Account.tsx), so nothing personal is ever in the exported HTML. Kept out of
// search engines.
export const metadata: Metadata = {
  title: `${t("account.title")} · ${SITE_TITLE}`,
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <main id="main" className="acct-page">
      {/* A plain link, like /progression/'s (next/link would keep RSC payloads). */}
      <AppBack href="/progression/" labelKey="moi.title" />
      <a href="/" className="old-back acct-back">
        ← <span data-i18n="nav.home">{t("nav.home")}</span>
      </a>
      <h1 className="acct-title" data-i18n="account.title">
        {t("account.title")}
      </h1>
      <Account />
    </main>
  );
}
