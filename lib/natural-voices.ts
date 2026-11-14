// The downloadable voices of "Écouter" beside Piper (lib/piper-voice.ts), and
// the pure text work their models need. All three run in
// public/js/natural-voice-worker.js on onnxruntime-web:
//  - Kokoro-82M (Apache 2.0, one 92 MB model for every language, a small
//    style file per voice): the best sounding, the slowest. It reads eSpeak
//    phonemes, so only the languages eSpeak phonemizes the way the model was
//    trained (not Japanese or Chinese, which need their own analysers).
//  - MMS-TTS (Meta, CC BY-NC 4.0, one 114 MB VITS model per language, read
//    letter by letter): the languages nothing else reads, Javanese and Hakka
//    first.
// A voice is named to the worker by a key: "kokoro:<voice>:<espeak voice>",
// "mms:<model folder>"; a Piper voice keeps its bare path.

export interface KokoroVoice {
  /** The style file, voices/<voice>.bin. */
  voice: string;
  /** The eSpeak voice that phonemizes the text. */
  espeak: string;
  /** Shown in "Voix". */
  name: string;
}

export const KOKORO_VOICES: Record<string, KokoroVoice> = {
  en: { voice: "af_heart", espeak: "en-us", name: "Heart" },
  fr: { voice: "ff_siwis", espeak: "fr", name: "Siwis" },
  es: { voice: "ef_dora", espeak: "es", name: "Dora" },
  it: { voice: "if_sara", espeak: "it", name: "Sara" },
  pt: { voice: "pf_dora", espeak: "pt-br", name: "Dora" },
  hi: { voice: "hf_alpha", espeak: "hi", name: "Alpha" },
};

/** Language → the model's folder (ISO 639-3, with the script when MMS has
 *  several). Only languages no Piper voice reads. */
export const MMS_VOICES: Record<string, string> = {
  jv: "jav",
  hak: "hak",
  id: "ind",
  ms: "zlm",
  ro: "ron",
  ta: "tam",
  az: "azj-script_latin",
  ug: "uig-script_arabic",
  tpi: "tpi",
  kab: "kab",
  ru: "rus",
  th: "tha",
};

export function kokoroKey(tag: string): string | null {
  const v = KOKORO_VOICES[tag];
  return v ? `kokoro:${v.voice}:${v.espeak}` : null;
}

export function mmsKey(tag: string): string | null {
  const m = MMS_VOICES[tag];
  return m ? `mms:${m}` : null;
}

/** eSpeak's phonemes as the Kokoro model was trained on them (misaki's
 *  conventions): one letter per affricate everywhere, and for English one
 *  capital per diphthong, no length marks, "r" as ɹ. */
export function kokoroPhonemes(phonemes: string, espeak: string): string {
  let ps = phonemes.replace(/dʒ/g, "ʤ").replace(/tʃ/g, "ʧ");
  if (espeak.startsWith("en")) {
    ps = ps
      .replace(/eɪ/g, "A")
      .replace(/aɪ/g, "I")
      .replace(/aʊ/g, "W")
      .replace(/ɔɪ/g, "Y")
      .replace(/oʊ/g, "O")
      .replace(/ɚ/g, "əɹ")
      .replace(/ɐ/g, "ə")
      .replace(/r/g, "ɹ")
      .replace(/x/g, "k")
      .replace(/ɬ/g, "l")
      .replace(/ʔ/g, "t")
      .replace(/ʲ/g, "")
      .replace(/ɜːɹ/g, "ɜɹ")
      .replace(/ɜː/g, "ɜɹ")
      .replace(/ɪə/g, "iə")
      .replace(/ː/g, "");
  } else {
    ps = ps.replace(/ts/g, "ʦ").replace(/dz/g, "ʣ");
  }
  return ps;
}

/** The model takes at most 510 tokens between its two pads. */
export const KOKORO_MAX = 500;

/** Token ids for `phonemes`, in runs of at most `max`, cut at a space when
 *  there is one. Symbols the model doesn't know are dropped. */
export function kokoroIds(
  phonemes: string,
  vocab: Record<string, number>,
  max = KOKORO_MAX,
): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  let lastSpace = -1;
  const space = vocab[" "];
  for (const ch of phonemes) {
    const id = vocab[ch];
    if (id === undefined) continue;
    run.push(id);
    if (id === space) lastSpace = run.length;
    if (run.length >= max) {
      const cut = lastSpace > max / 2 ? lastSpace : run.length;
      runs.push(run.slice(0, cut));
      run = run.slice(cut);
      lastSpace = -1;
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

/** tokens.txt of an MMS model ("<symbol> <id>" per line, the space too). */
export function parseMmsTokens(txt: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of txt.split("\n")) {
    const m = /^(.+) (\d+)$/u.exec(line);
    if (m) out.set(m[1], Number(m[2]));
  }
  return out;
}

/**
 * The model's input for `text`: its symbols' ids with the blank (id 0)
 * between them, as MMS was trained. Null when the text is mostly not in the
 * model's alphabet (Hakka written in characters for a model that reads its
 * romanisation): better skipped than read as a few stray letters.
 */
export function mmsIds(
  text: string,
  tokens: Map<string, number>,
): number[] | null {
  const ids: number[] = [];
  let letters = 0;
  let known = 0;
  const space = tokens.get(" ");
  for (const ch of text.normalize("NFC").toLowerCase()) {
    const isLetter = /\p{L}/u.test(ch);
    if (isLetter) letters++;
    let id = tokens.get(ch);
    if (id === undefined && isLetter) {
      // A letter with an accent the model spells in two symbols.
      const parts = [...ch.normalize("NFD")];
      if (parts.length > 1 && parts.every((p) => tokens.has(p))) {
        known++;
        for (const p of parts) ids.push(tokens.get(p)!);
        continue;
      }
    }
    // Punctuation the model has no symbol for is a pause: a space.
    if (id === undefined && !isLetter && !/\p{N}/u.test(ch)) id = space;
    if (id === undefined) continue;
    if (id === space && ids[ids.length - 1] === space) continue;
    if (isLetter) known++;
    ids.push(id);
  }
  if (!known || known < letters * 0.6) return null;
  const out = [0];
  for (const id of ids) out.push(id, 0);
  return out;
}
