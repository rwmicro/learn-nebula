// Widget pack "cyber" (lib/widgets-extra.ts). Bundled by scripts/bundle-js.mjs
// into widgets-cyber.bundle.js, fetched by widgets-loader.js only on a page
// that mounts one of these widgets. One module per widget in ./cyber/; the
// rules they show (firewall chain, CORS, JWT, AD paths…) live in lib/cyber.ts
// and are unit-tested there.
import { mount } from "./widget-kit.js";
import { echange } from "./cyber/echange.js";
import { pareFeu } from "./cyber/pare-feu.js";
import { cors } from "./cyber/cors.js";
import { nat } from "./cyber/nat.js";
import { tunnelSsh } from "./cyber/tunnel-ssh.js";
import { jwt } from "./cyber/jwt.js";
import { cheminAd } from "./cyber/chemin-ad.js";
import { killChain } from "./cyber/kill-chain.js";
import { cassage } from "./cyber/cassage.js";

mount({
  echange,
  "pare-feu": pareFeu,
  cors,
  nat,
  "tunnel-ssh": tunnelSsh,
  jwt,
  "chemin-ad": cheminAd,
  "kill-chain": killChain,
  cassage,
});
