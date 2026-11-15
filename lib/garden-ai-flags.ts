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

/** A device that gets the small model (LFM2-700M, ~0.5 GB): iPhone and
 *  iPad, where iOS ends a tab before the big one has loaded, and anything
 *  that reports 4 GB of memory or less (an Android phone that would download
 *  1.4 GB and then lose the tab while loading it). */
export function smallDevice(): boolean {
  const mem = (globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined)?.deviceMemory;
  return onIos() || (typeof mem === "number" && mem <= 4);
}

/** The languages the downloaded model writes well enough to offer: Qwen3.5-2B
 *  everywhere (trained on about 200 languages; these are the ones the tests
 *  of 2026-11-04 and its model card back), LFM2-700M on a small device
 *  (lib/local-llm.ts).
 *  The translate menu offers only these, plus what Chrome's own Translator
 *  and Gemini Nano cover (public/js/translate.js). */
const QWEN_LANGS = ["en", "ar", "zh", "fr", "de", "it", "ja", "ko", "pt", "es", "vi", "th", "id", "hi", "ru", "pl", "tr", "nl", "ms"];
const LFM2_LANGS = ["en", "ar", "zh", "fr", "de", "ja", "ko", "es"];
export function localModelLangs(): readonly string[] {
  return smallDevice() ? LFM2_LANGS : QWEN_LANGS;
}
