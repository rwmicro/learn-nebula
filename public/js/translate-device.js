// The device model for translate.js, loaded on demand
// (translate-device.bundle.js): Gemini Nano or the downloaded Qwen3.5
// (lib/garden-ai.ts) and the translation prompt.
import { aiRoute, generateOnDevice } from "../../lib/garden-ai.ts";
import { translateSystem } from "../../lib/ask-prompts.ts";

window.__gkTranslateDevice = { aiRoute, generateOnDevice, translateSystem };
