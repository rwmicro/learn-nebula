// The two bits of lib/garden-ai.ts the note bundle needs up front
// (public/js/translate.js), kept apart so it doesn't pull the model code:
// that loads on demand (translate-device.bundle.js).

/** Offer the server's LLM (paid API) when no model on the device can answer.
 *  Off: no budget for it. The routes and the client code stay in place. */
export const SERVER_LLM_OFFERED = false;

/** "téléphone" on a touch phone, "appareil" elsewhere (the badges' wording). */
export function deviceWord(): "phone" | "device" {
  try {
    return matchMedia("(max-width: 639.98px) and (pointer: coarse)").matches ? "phone" : "device";
  } catch {
    return "device";
  }
}
