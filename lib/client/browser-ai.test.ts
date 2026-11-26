import { describe, expect, it } from "vitest";
import { echoesPrompt } from "./browser-ai";

const SYSTEM =
  "Tu es l'assistant de « Garden of Knowledge », un jardin de notes personnel.\nRègles :\n- Réponds UNIQUEMENT à partir des extraits de notes fournis.";

describe("echoesPrompt", () => {
  it("spots Chrome's CPU-backend banner and template dump", () => {
    const leak = `CPU backendFastest inferenceTopK: 64, Temp: 1System: ${SYSTEM} End.User: Question : Coucou End.Model:`;
    expect(echoesPrompt(leak, SYSTEM)).toBe(true);
    // Caught from the first streamed characters, before anything is shown.
    expect(echoesPrompt("CPU backend", SYSTEM)).toBe(true);
    expect(echoesPrompt("Fastest inferenceTopK: 64, Temp: 1", "")).toBe(true);
  });

  it("spots the template markers and the system prompt copied back", () => {
    expect(echoesPrompt("System: tu es…", "")).toBe(true);
    expect(echoesPrompt("Bonjour. End.User: Coucou", "")).toBe(true);
    expect(echoesPrompt(`Voici : ${SYSTEM}`, SYSTEM)).toBe(true);
  });

  it("lets real answers through", () => {
    expect(echoesPrompt("Coucou ! Que veux-tu savoir sur tes notes ?", SYSTEM)).toBe(false);
    expect(
      echoesPrompt("Le système nerveux (System: nervous) se divise en deux parties.", SYSTEM),
    ).toBe(false);
    expect(echoesPrompt("Je ne trouve pas cela dans les notes.", SYSTEM)).toBe(false);
  });
});
