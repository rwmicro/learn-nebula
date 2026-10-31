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

/** iOS and iPadOS (every browser there is WebKit, with the same memory cap);
 *  an iPad asking for the desktop site reports a Mac with a touch screen. */
export function onIos(): boolean {
  const nav = globalThis.navigator;
  if (!nav) return false;
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
}

/** The languages the downloaded model is trained on, from its model card:
 *  LFM3-1.7B everywhere, LFM2-700M on iPhone and iPad (lib/local-llm.ts).
 *  The translate menu offers only these, plus what Chrome's own Translator
 *  and Gemini Nano cover (public/js/translate.js). */
const LFM3_LANGS = ["en", "ar", "zh", "fr", "de", "it", "ja", "ko", "pt", "es", "vi", "th", "id", "hi", "ru", "pl"];
const LFM2_LANGS = ["en", "ar", "zh", "fr", "de", "ja", "ko", "es"];
export function localModelLangs(): readonly string[] {
  return onIos() ? LFM2_LANGS : LFM3_LANGS;
}
