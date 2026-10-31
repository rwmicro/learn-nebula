import type { Metadata } from "next";
import { GrowLoader } from "@/components/ui/GrowLoader";
import { SITE_TITLE } from "@/lib/site";
import { t, i18nProps } from "@/lib/i18n";

export const metadata: Metadata = {
  title: `Une note au hasard · ${SITE_TITLE}`,
  robots: { index: false, follow: false },
};

// Picks a note from /notes-index.json (app/notes-index.json/route.ts) and
// replaces this page with it, so Back returns to where the reader was rather
// than bouncing through /hasard/ again. Skips the note the reader came from
// (same-origin referrer — the site's referrer policy keeps the path). A plain
// inline script rather than a client component: it has to run as early as
// possible, and there is nothing to render. It reveals the "picking…" line
// itself (so a no-JS reader only sees the <noscript> link), and on failure
// swaps it for the link home that's already in the markup.
const PICK = `(function () {
  document.getElementById("hasard-status").hidden = false;
  var from = "";
  try { var r = new URL(document.referrer); if (r.origin === location.origin) from = r.pathname; } catch (e) {}
  fetch("/notes-index.json")
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (notes) {
      var pool = notes.filter(function (n) { return n.href !== from; });
      if (!pool.length) pool = notes;
      if (!pool.length) throw new Error("empty");
      location.replace(pool[Math.floor(Math.random() * pool.length)].href);
    })
    .catch(function () {
      document.getElementById("hasard-status").hidden = true;
      document.getElementById("hasard-error").hidden = false;
    });
})();`;

const link = "text-link underline underline-offset-2";

export default function RandomNotePage() {
  return (
    <main
      id="main"
      className="mx-auto max-w-[42rem] px-5 py-16 text-ink"
      data-pagefind-ignore="all"
    >
      <h1
        className="m-0 mb-5 text-balance text-[clamp(1.5rem,1.1rem+2.5vw,3rem)] font-medium leading-tight"
        {...i18nProps("random.title")}
      >
        {t("random.title")}
      </h1>
      <div id="hasard-status" hidden>
        <GrowLoader>
          <span {...i18nProps("random.loading")}>{t("random.loading")}</span>
        </GrowLoader>
      </div>
      <p id="hasard-error" hidden className="text-body">
        <a href="/" className={link} {...i18nProps("random.error")}>
          {t("random.error")}
        </a>
      </p>
      <noscript>
        <p className="text-body">
          <a href="/" className={link}>
            {t("random.noscript")}
          </a>
        </p>
      </noscript>
      <script dangerouslySetInnerHTML={{ __html: PICK }} />
    </main>
  );
}

