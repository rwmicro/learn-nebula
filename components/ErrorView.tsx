"use client";

// What an error boundary shows instead of the blank "This page couldn't load":
// a short explanation, Réessayer (React's reset) and a way home. The error is
// reported to /admin through /js/error-beacon.js (window.__gkReportError).
// Self-styled with Tailwind for the same reason as app/not-found.tsx: it can
// show on any route, so it must not pull a route-scoped stylesheet.

import { useEffect } from "react";
import { t } from "@/lib/i18n";

declare global {
  interface Window {
    __gkReportError?: (err: unknown) => void;
  }
}

export function ErrorView({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    window.__gkReportError?.(error);
  }, [error]);
  return (
    <main id="main" className="mx-auto max-w-[42rem] px-5 py-16 text-ink">
      <h1 className="m-0 mb-4 text-balance text-[clamp(1.4rem,1.1rem+2vw,2.4rem)] font-medium leading-tight" data-i18n="errorPage.title">
        {t("errorPage.title")}
      </h1>
      <p className="m-0 mb-6 text-pretty text-muted-warm" data-i18n="errorPage.body">
        {t("errorPage.body")}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-garden px-5 py-2 text-paper [font-family:'Alegreya_Sans',sans-serif]"
          data-i18n="errorPage.retry"
        >
          {t("errorPage.retry")}
        </button>
        <a href="/" className="rounded-full border border-ink/20 px-5 py-2 [font-family:'Alegreya_Sans',sans-serif]" data-i18n="errorPage.home">
          {t("errorPage.home")}
        </a>
      </div>
    </main>
  );
}
