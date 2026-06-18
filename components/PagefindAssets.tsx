import Script from "next/script";

/** Loads the Pagefind full-text search bundle and mounts it into #search.
 * The bundle only exists after `npm run build`, so it is skipped under dev. */
export function PagefindAssets() {
  if (process.env.NODE_ENV !== "production") return null;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="/pagefind/pagefind-ui.css" precedence="default" />
      <Script src="/pagefind/pagefind-ui.js" strategy="afterInteractive" />
      <Script src="/js/pagefind-init.js" strategy="afterInteractive" />
    </>
  );
}
