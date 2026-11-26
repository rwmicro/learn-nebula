// The site's events (lib/events.ts) typed on window and document, for TS
// and for public/js under checkJs.
import type { GkEventDetail } from "../lib/events";

type GkEvents = { [K in keyof GkEventDetail]: CustomEvent<GkEventDetail[K]> };

declare global {
  interface WindowEventMap extends GkEvents {}
  interface DocumentEventMap extends GkEvents {}
}
export {};
