import type { Metadata } from "next";
import { LanguagePartner } from "@/components/play/LanguagePartner";
import { getAllPosts, slugifyPath } from "@/lib/content";
import { PARTNER_LANGS, VAULT_FOLDER, type PartnerLang } from "@/lib/partner-scenes";
import { t } from "@/lib/i18n";
import { SITE_TITLE } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";
import "@/assets/css/parler.css";
import { PageHeader } from "@/components/ui/PageHeader";

// A spoken conversation with a partner in one of the vault's languages. The
// model, the voice and the speech recognition all run on the reader's device;
// the page only ships the scenes. Each language links back to its vault note
// on everyday situations (cards made during the talk go to that note's deck),
// found at build so a renamed note drops the link rather than a 404.
export const metadata: Metadata = pageMetadata({
  title: `Parler une langue · ${SITE_TITLE}`,
  description:
    "Une conversation à voix haute avec un partenaire, dans une scène de la vie courante, puis le bilan de vos phrases.",
  path: "/parler/",
});

const NOTE_ORDER = ["02-communication/situations", "02-communication/phrases-essentielles", "02-communication/salutations"];

export default function ParlerPage() {
  const posts = new Map(getAllPosts().map((d) => [d.slug, d.frontmatter.title]));
  const notes: Partial<Record<PartnerLang, { href: string; title: string; slug: string }>> = {};
  for (const lang of PARTNER_LANGS) {
    const folder = VAULT_FOLDER[lang];
    if (!folder) continue;
    const base = slugifyPath(`Social Sciences/Languages - Dialects/${folder}`);
    for (const end of NOTE_ORDER) {
      const slug = `${base}/${end}`;
      const title = posts.get(slug);
      if (title) {
        notes[lang] = { href: `/posts/${slug}/`, title, slug };
        break;
      }
    }
  }
  return (
    <main id="main" className="parler">
      <PageHeader
        name="parler"
        back={{ href: "/notes/", labelKey: "tabbar.notes" }}
        title={t("parler.title")}
        titleProps={{ "data-i18n": "parler.title" }}
      />
      <LanguagePartner notes={notes} />
    </main>
  );
}
