// Browser stand-in for ./i18n-bundles.ts (package.json "imports", "browser" condition): the
// bundles are the static files the <head> bootstrap loads before hydration
// (app/layout.tsx, I18N_BOOTSTRAP), always the default locale and the stored
// one, the others on a language switch (public/js/i18n.js). A bundle that
// isn't there yet reads as undefined, and t() falls back to the default locale,
// then to the key.
export interface Messages {
  [key: string]: string | Messages;
}

type I18nWindow = { __i18n?: { bundles?: Record<string, Messages> } };

export const BUNDLES: Record<string, Messages | undefined> = new Proxy(
  {},
  {
    get(_, locale) {
      if (typeof locale !== "string" || typeof window === "undefined") return undefined;
      return (window as unknown as I18nWindow).__i18n?.bundles?.[locale];
    },
  },
);
