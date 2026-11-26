// Widget pack "calcul" (lib/widgets-extra.ts). Bundled by scripts/bundle-js.mjs
// into widgets-calcul.bundle.js, fetched by widgets-loader.js only on a page
// that mounts one of these widgets. The arithmetic of public-key cryptography
// and of large language models; every number they show comes from
// lib/calcul.ts, unit-tested there.
import { mount } from "./widget-kit.js";
import { puissancesMod } from "./calcul/puissances-mod.js";
import { rsa } from "./calcul/rsa.js";
import { courbeElliptique } from "./calcul/courbe-elliptique.js";
import { anniversaire } from "./calcul/anniversaire.js";
import { moeRouteur } from "./calcul/moe-routeur.js";
import { memoireLlm } from "./calcul/memoire-llm.js";

mount({
  "puissances-mod": puissancesMod,
  rsa,
  "courbe-elliptique": courbeElliptique,
  anniversaire,
  "moe-routeur": moeRouteur,
  "memoire-llm": memoireLlm,
});
