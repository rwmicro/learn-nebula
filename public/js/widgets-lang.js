// Widget pack "lang" (lib/widgets-extra.ts). Bundled by scripts/bundle-js.mjs
// into widgets-lang.bundle.js, fetched by widgets-loader.js only on a page that
// mounts one of these widgets. One module per widget in ./lang/; the language
// logic they share with the tests lives in lib/lang-*.ts.
import { mount } from "./widget-kit.js";
import { affixesIndonesiens } from "./lang/affixes.js";
import { troisArabes } from "./lang/trois-arabes.js";
import { agglutination } from "./lang/agglutination.js";
import { lettresArabes } from "./lang/lettres-arabes.js";
import { ecritures } from "./lang/ecritures.js";
import { memeMot } from "./lang/meme-mot.js";
import { casAllemands } from "./lang/cas-allemands.js";
import { etymologieTokPisin } from "./lang/etymologie-tok-pisin.js";
import { couvertureMots } from "./lang/couverture-mots.js";

mount({
  "affixes-indonesiens": affixesIndonesiens,
  "trois-arabes": troisArabes,
  agglutination,
  "lettres-arabes": lettresArabes,
  ecritures,
  "meme-mot": memeMot,
  "cas-allemands": casAllemands,
  "etymologie-tok-pisin": etymologieTokPisin,
  "couverture-mots": couvertureMots,
});
