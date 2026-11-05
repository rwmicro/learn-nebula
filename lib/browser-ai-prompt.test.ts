// promptOnDevice() / aiRoute() against a fake Chrome Prompt API: the cases
// that ended on "no answer" with a working Gemini Nano.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoBroken, nanoSetAsideReason, promptOnDevice, resetNano } from "./browser-ai";
import { aiRoute } from "./garden-ai";

vi.mock("./local-llm", () => ({
  localModelEnabled: () => false,
  localModelSupported: async () => false,
  promptLocal: async () => null,
}));

type Avail = "unavailable" | "downloadable" | "downloading" | "available";
type Opts = { expectedOutputs?: { languages: string[] }[] };

function store(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

/** A fake LanguageModel: `langs` the languages it writes, `quota` its input
 *  quota in characters (1 char = 1 token here), `answer` what it says. */
function fakeNano(o: { langs?: string[]; quota?: number; answer?: string; createError?: Error } = {}) {
  const langs = o.langs ?? ["en", "es", "ja", "de", "fr"];
  const sent: string[] = [];
  const created: string[] = [];
  const langOf = (opts?: Opts) => opts?.expectedOutputs?.[0]?.languages?.[0] ?? "";
  const LM = {
    async availability(opts?: Opts): Promise<Avail> {
      const l = langOf(opts);
      // Chrome throws on a code it doesn't know at all.
      if (l === "zh") throw new DOMException("Unsupported LanguageModel API languages were specified.", "NotSupportedError");
      return langs.includes(l) ? "available" : "unavailable";
    },
    async create(opts: Opts & { initialPrompts?: { content: string }[] }) {
      if (o.createError) throw o.createError;
      const l = langOf(opts);
      if (!langs.includes(l)) throw new DOMException("unsupported", "NotSupportedError");
      created.push(l);
      const used = opts.initialPrompts?.[0]?.content.length ?? 0;
      return {
        inputQuota: o.quota ?? 100_000,
        inputUsage: used,
        async measureInputUsage(p: string) {
          return p.length;
        },
        async *promptStreaming(p: string) {
          if (p.length > (o.quota ?? 100_000) - used) throw new DOMException("too large", "QuotaExceededError");
          sent.push(p);
          yield o.answer ?? "Une réponse assez longue pour passer le seuil d'affichage du chat, ";
          yield "et la suite de la réponse.";
        },
        destroy() {},
      };
    },
  };
  (globalThis as Record<string, unknown>).LanguageModel = LM;
  return { sent, created };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", store());
  vi.stubGlobal("sessionStorage", store());
  vi.stubGlobal("navigator", { userAgent: "Chrome/152" });
  vi.stubGlobal("self", globalThis);
});
afterEach(() => {
  delete (globalThis as Record<string, unknown>).LanguageModel;
  vi.unstubAllGlobals();
});

describe("promptOnDevice", () => {
  it("writes in the reader's language when Nano doesn't cover the question's", async () => {
    const nano = fakeNano();
    const out = await promptOnDevice({ system: "S", prompt: "Che cos'è?", lang: "it", fallbackLang: "fr" });
    expect(out).toContain("réponse");
    expect(nano.created).toEqual(["fr"]);
    expect(nanoBroken()).toBe(false);
  });

  it("drops the conversation, then shortens, when the prompt exceeds the quota", async () => {
    const nano = fakeNano({ quota: 3000 });
    const long = "x".repeat(5000);
    const out = await promptOnDevice({ system: "S", prompt: [`${long}\n\nUtilisateur : Q`, "Contexte\n---\nQuestion : Q"], lang: "fr" });
    expect(out).not.toBeNull();
    expect(nano.sent[0]).toBe("Contexte\n---\nQuestion : Q");

    const nano2 = fakeNano({ quota: 3000 });
    const out2 = await promptOnDevice({ system: "S", prompt: `${"y".repeat(8000)}\nQuestion : la fin`, lang: "fr" });
    expect(out2).not.toBeNull();
    expect(nano2.sent[0].length).toBeLessThan(3000);
    expect(nano2.sent[0].endsWith("Question : la fin")).toBe(true);
  });

  it("sets Nano aside for the tab when Chrome refuses, with its reason", async () => {
    fakeNano({ createError: new DOMException("Requires a user gesture", "NotAllowedError") });
    expect(await aiRoute("fr")).toBe("nano");
    expect(await promptOnDevice({ system: "S", prompt: "Q", lang: "fr" })).toBeNull();
    expect(nanoBroken()).toBe(true);
    expect(nanoSetAsideReason()).toBe("NotAllowedError: Requires a user gesture");
    expect(await aiRoute("fr")).toBe("none");
    resetNano();
    expect(await aiRoute("fr")).toBe("nano");
  });

  it("an echo is remembered for the browser build", async () => {
    fakeNano({ answer: "CPU backendFastest inferenceTopK: 64, Temp: 1System: S End.User: Q End.Model:" });
    expect(await promptOnDevice({ system: "S", prompt: "Q", lang: "fr" })).toBeNull();
    expect(nanoSetAsideReason()).toBe("echo");
  });
});

describe("aiRoute", () => {
  it("takes Nano when only the question's language is covered", async () => {
    fakeNano();
    expect(await aiRoute("zh")).toBe("none");
    expect(await aiRoute("zh", "en")).toBe("nano");
  });

  it("an older Chrome without French still answers an English question", async () => {
    fakeNano({ langs: ["en", "es", "ja"] });
    expect(await aiRoute("fr")).toBe("none");
    expect(await aiRoute("fr", "en")).toBe("nano");
  });
});
