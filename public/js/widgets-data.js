// Widget pack "data" (lib/widgets-extra.ts): Our World in Data charts, the
// Insee price converter and inline prices, Lichess opening stats, Wikidata
// language sheets. Their numbers arrive in data-props, prepared at build by
// lib/widget-data.ts. Bundled by scripts/bundle-js.mjs into
// widgets-data.bundle.js, fetched by widgets-loader.js only when needed.
import { mount } from "./widget-kit.js";
import { owid } from "./data/owid.js";
import { fichePays, vraiFaux, classer, convertisseur, interets, ouverture, ficheLangue, wirePrix } from "./data/others.js";

mount({
  owid,
  "fiche-pays": fichePays,
  "vrai-faux": vraiFaux,
  classer,
  convertisseur,
  interets,
  ouverture,
  "fiche-langue": ficheLangue,
});
wirePrix();
