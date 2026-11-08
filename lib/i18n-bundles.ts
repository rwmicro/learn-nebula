// The UI message bundles, for the server, the build scripts and the tests.
//
// Browser builds never see this file: package.json's "#i18n-bundles"
// import resolves to ./i18n-bundles.browser.ts under the "browser" condition,
// which reads the bundles
// the <head> bootstrap already loaded (window.__i18n.bundles, app/layout.tsx).
// Importing the six JSON files here from client components used to put every
// locale (~600 KB, ~145 KB brotli) into a chunk loaded on every page.
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import es from "../messages/es.json";
import zh from "../messages/zh.json";
import ar from "../messages/ar.json";
import id from "../messages/id.json";

export interface Messages {
  [key: string]: string | Messages;
}

export const BUNDLES: Record<string, Messages | undefined> = { fr, en, es, zh, ar, id };
