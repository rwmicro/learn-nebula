// The liquid glass engine (lib/client/glass/site.ts, the kit of
// bilalgursen/liquid-glass, MIT), bundled on its own as
// liquid-glass.bundle.js and fetched by lib/client/glass/load.ts the first time a
// piece of chrome asks for it.
import { liquidGlass } from "../../lib/client/glass/site";

window.__gkGlass = { liquidGlass };
