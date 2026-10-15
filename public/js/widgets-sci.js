// Widget pack "sci" (lib/widgets-extra.ts). Bundled by scripts/bundle-js.mjs
// into widgets-sci.bundle.js, fetched by widgets-loader.js only on a page that
// mounts one of these widgets. One module per widget under ./sci/; the pure
// models they draw live in lib/sci-*.ts (unit-tested).
import { mount } from "./widget-kit.js";
import { supercompensation } from "./sci/supercompensation.js";
import { circuitRc } from "./sci/circuit-rc.js";
import { lotkaVolterra } from "./sci/lotka-volterra.js";
import { datation } from "./sci/datation.js";
import { ancrage } from "./sci/ancrage.js";
import { syllogisme } from "./sci/syllogisme.js";
import { xssDom } from "./sci/xss-dom.js";
import { rotationCultures } from "./sci/rotation-cultures.js";
import { tableauPeriodique } from "./sci/tableau-periodique.js";
import { descenteGradient } from "./sci/descente-gradient.js";
import { frontiere } from "./sci/frontiere.js";

mount({
  supercompensation,
  "circuit-rc": circuitRc,
  "lotka-volterra": lotkaVolterra,
  datation,
  ancrage,
  syllogisme,
  "xss-dom": xssDom,
  "rotation-cultures": rotationCultures,
  "tableau-periodique": tableauPeriodique,
  "descente-gradient": descenteGradient,
  frontiere,
});
