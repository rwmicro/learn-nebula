// The natural reading voice's page side (lib/piper-voice.ts), its own bundle:
// audio.js fetches piper-voice.bundle.js only once the reader has turned the
// voice on.
import {
  deletePiperVoices,
  loadPiperVoice,
  piperVoiceFor,
  readWithPiper,
} from "../../lib/piper-voice";

window.__gkPiper = {
  deletePiperVoices,
  loadPiperVoice,
  piperVoiceFor,
  readWithPiper,
};
