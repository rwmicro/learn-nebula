// /parler/ end to end (components/play/LanguagePartner.tsx), on a phone and
// on a computer: the setup, the warm-up, a conversation held with the
// microphone, the goals, the review. The parts that live in the browser are
// played by fakes set up before the page loads, so the test needs neither a
// model nor a microphone:
//   - the model: Chrome's Prompt API (LanguageModel), answering the scene's
//     lines in the REPLIQUE / TRADUCTION format, or failing on demand;
//   - the ears: SpeechRecognition, "hearing" the lines the test queues,
//     ending by itself (as Safari does after a silence) or refusing the
//     microphone (as a denied permission does);
//   - the voice: speechSynthesis, recording what it was asked to say, with
//     the system voices the test chooses (none for Arabic, like many phones).
import { test, expect } from "@playwright/test";

/** Installed before any script of the page runs. */
function fakes() {
  const w = window;
  w.__said = [];
  w.__heard = [];
  w.__prompts = [];
  w.__failNext = 0;
  w.__autoEnd = false;
  w.__micError = null;
  w.__voices = [
    {
      name: "Mónica",
      lang: "es-ES",
      voiceURI: "es",
      localService: true,
      default: false,
    },
    {
      name: "Samantha",
      lang: "en-US",
      voiceURI: "en",
      localService: true,
      default: true,
    },
  ];
  // The partner's answers, in turn; the last one repeats.
  w.__replies = [
    "REPLIQUE: ¡Hola! ¿Te puedo ayudar?\nTRADUCTION: Salut ! Je peux t'aider ?",
    "REPLIQUE: La estación está a diez minutos, todo recto.\nTRADUCTION: La gare est à dix minutes, tout droit.",
    "REPLIQUE: Después, a la derecha. ¡De nada!\nTRADUCTION: Ensuite, à droite. De rien !",
  ];
  let turn = 0;

  w.LanguageModel = {
    async availability() {
      return "available";
    },
    async create() {
      return {
        async *promptStreaming(input) {
          w.__prompts.push(input);
          if (w.__failNext > 0) {
            w.__failNext--;
            throw new Error("model crashed");
          }
          const reply = w.__replies[Math.min(turn++, w.__replies.length - 1)];
          for (let i = 0; i < reply.length; i += 12) {
            await new Promise((r) => setTimeout(r, 5));
            yield reply.slice(i, i + 12);
          }
        },
        destroy() {},
      };
    },
  };

  class FakeRecognition {
    constructor() {
      this.lang = "";
      this.onresult = null;
      this.onend = null;
      this.onerror = null;
      this.ended = false;
    }
    start() {
      w.__listening = this.lang;
      setTimeout(() => {
        if (this.ended) return;
        if (w.__micError) {
          this.onerror?.({ error: w.__micError });
          this.finish();
          return;
        }
        const text = w.__heard.shift() ?? "";
        if (!text) return;
        const alt = { transcript: text };
        const res = Object.assign([alt], { isFinal: true });
        this.onresult?.({ resultIndex: 0, results: [res] });
        if (w.__autoEnd) setTimeout(() => this.finish(), 50);
      }, 80);
    }
    finish() {
      if (this.ended) return;
      this.ended = true;
      w.__listening = null;
      this.onend?.();
    }
    stop() {
      setTimeout(() => this.finish(), 20);
    }
    abort() {
      this.finish();
    }
  }
  w.SpeechRecognition = FakeRecognition;
  w.webkitSpeechRecognition = FakeRecognition;

  const synth = {
    speaking: false,
    pending: false,
    speak(u) {
      if (u.text.trim())
        w.__said.push({
          text: u.text,
          lang: u.lang,
          voice: u.voice?.name ?? null,
          rate: u.rate,
        });
      setTimeout(() => u.onend?.(), 30);
    },
    cancel() {},
    resume() {},
    pause() {},
    getVoices: () => w.__voices,
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(w, "speechSynthesis", {
    value: synth,
    configurable: true,
  });
  w.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
      this.lang = "";
      this.rate = 1;
      this.volume = 1;
      this.voice = null;
      this.onend = null;
      this.onerror = null;
    }
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(fakes);
  // Spanish, A2, the "ask the way" scene: the scene the PDF's screenshots show.
  await page.addInitScript(() => {
    if (!localStorage.getItem("gk-partner-prefs"))
      localStorage.setItem(
        "gk-partner-prefs",
        JSON.stringify({
          lang: "es",
          level: "a2",
          scene: "chemin",
          swapped: false,
          subs: null,
        }),
      );
  });
});

const startButton = (page) =>
  page.locator(".pt-go").filter({ hasText: /Parler avec/ });

/** Touch the microphone once (a finger on a phone, the mouse elsewhere). */
async function tapMic(page, isMobile) {
  const mic = page.locator(".pt-mic");
  if (isMobile) await mic.tap();
  else await mic.click();
}

/** Hold the microphone for `ms`, as a finger does. */
async function holdMic(page, ms) {
  const mic = page.locator(".pt-mic");
  await mic.dispatchEvent("pointerdown", {
    pointerType: "touch",
    isPrimary: true,
  });
  await page.waitForTimeout(ms);
  await mic.dispatchEvent("pointerup", {
    pointerType: "touch",
    isPrimary: true,
  });
}

async function enterTalk(page) {
  await page.goto("/parler/");
  await startButton(page).click();
  await expect(
    page.getByRole("heading", { name: "Échauffement" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Aller dans la rue" }).click();
  await expect(
    page.locator(".pt-turn.is-partner .pt-bubble").first(),
  ).toContainText("¿Te puedo ayudar?");
  await expect(page.locator(".pt-mic")).toBeEnabled();
}

test.describe("Parler: a whole scene", () => {
  test("warm-up, two lines by voice, both goals, the review", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/parler/");

    // The start button is at hand on a phone, without scrolling the setup.
    const go = startButton(page);
    await expect(go).toBeVisible();
    if (isMobile) await expect(go).toBeInViewport();
    await expect(page.locator(".pt-goals-preview")).toContainText(
      "Demander la gare",
    );

    await go.click();
    // Warm-up: "Écouter" says the expression, in Spanish.
    const first = page.locator(".pt-exprs li").first();
    const expr = (await first.locator(".pt-expr b").textContent()).trim();
    await first.getByRole("button", { name: "Écouter" }).click();
    await expect
      .poll(() => page.evaluate(() => window.__said.at(-1)))
      .toMatchObject({ text: expr, lang: "es-ES" });

    await page.getByRole("button", { name: "Aller dans la rue" }).click();
    const partner = page.locator(".pt-turn.is-partner");
    await expect(partner.first().locator(".pt-bubble")).toContainText(
      "¿Te puedo ayudar?",
    );
    await expect(partner.first().locator(".pt-tr")).toContainText(
      "Je peux t'aider",
    );
    // The partner's line was said aloud.
    await expect
      .poll(() => page.evaluate(() => window.__said.map((s) => s.text)))
      .toContain("¡Hola! ¿Te puedo ayudar?");

    // First line: tap once to start, tap again to send.
    await page.evaluate(() =>
      window.__heard.push("Perdone, ¿dónde está la estación?"),
    );
    await tapMic(page, isMobile);
    await expect(page.locator(".pt-mic")).toHaveClass(/is-live/);
    await expect(page.locator(".pt-bubble.is-live")).toContainText(
      "dónde está la estación",
    );
    // The time it takes to say it, then the second touch sends it.
    await page.waitForTimeout(500);
    await tapMic(page, isMobile);
    await expect(
      page.locator(".pt-turn.is-me .pt-bubble").first(),
    ).toContainText("estación");
    await expect(page.locator(".pt-goal.is-done")).toHaveCount(1);
    await expect(partner.nth(1).locator(".pt-bubble")).toContainText(
      "diez minutos",
    );

    // Second line: hold the button while speaking, release to send.
    await page.evaluate(() =>
      window.__heard.push("¿A la derecha? Muchas gracias."),
    );
    await holdMic(page, 600);
    await expect(page.locator(".pt-turn.is-me")).toHaveCount(2);
    await expect(page.locator(".pt-goal.is-done")).toHaveCount(2);
    await expect(page.locator(".pt-goals-n")).toHaveText("2/2");

    await page
      .locator(".pt-passed")
      .getByRole("button", { name: "Voir le bilan" })
      .click();
    await expect(page.locator(".pt-review .pt-stat").first()).toContainText(
      "2/2",
    );
    await expect(page.locator(".pt-review h2")).toContainText("Chemin trouvé");
  });

  test("a line is sent when the recogniser stops by itself (Safari, after a silence)", async ({
    page,
    isMobile,
  }) => {
    await enterTalk(page);
    await page.evaluate(() => {
      window.__autoEnd = true;
      window.__heard.push("¿Está lejos de aquí?");
    });
    await tapMic(page, isMobile);
    await expect(page.locator(".pt-turn.is-me .pt-bubble")).toContainText(
      "lejos",
    );
    await expect(page.locator(".pt-mic")).not.toHaveClass(/is-live/);
    await expect(page.locator(".pt-turn.is-partner")).toHaveCount(2);
  });

  test("a refused microphone says so and opens the keyboard, which works", async ({
    page,
    isMobile,
  }) => {
    await enterTalk(page);
    await page.evaluate(() => (window.__micError = "not-allowed"));
    await tapMic(page, isMobile);
    await expect(page.locator(".pt-notice[role=alert]")).toContainText(
      "not-allowed",
    );
    await expect(page.locator(".pt-mic")).not.toHaveClass(/is-live/);
    const input = page.locator("#pt-input");
    await expect(input).toBeVisible();
    await input.fill("¿Dónde está la estación?");
    await page.getByRole("button", { name: "Envoyer" }).click();
    await expect(page.locator(".pt-turn.is-me .pt-bubble")).toContainText(
      "estación",
    );
    await expect(page.locator(".pt-goal.is-done")).toHaveCount(1);
  });

  test("a partner that fails says so, and « Réessayer » gets the answer", async ({
    page,
  }) => {
    await page.addInitScript(() => (window.__failNext = 1));
    await page.goto("/parler/");
    await startButton(page).click();
    await page.getByRole("button", { name: "Aller dans la rue" }).click();
    const error = page.locator(".pt-error");
    await expect(error).toContainText("Le partenaire n'a pas répondu");
    await error.getByRole("button", { name: "Réessayer" }).click();
    await expect(error).toHaveCount(0);
    await expect(page.locator(".pt-turn.is-partner .pt-bubble")).toContainText(
      "¿Te puedo ayudar?",
    );
  });

  test("the model is given the whole conversation at each turn", async ({
    page,
  }) => {
    await enterTalk(page);
    await page.evaluate(() => window.__heard.push("¿Dónde está la estación?"));
    await holdMic(page, 500);
    await expect(page.locator(".pt-turn.is-partner")).toHaveCount(2);
    const prompts = await page.evaluate(() => window.__prompts);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("¡Hola! ¿Te puedo ayudar?");
    expect(prompts[1]).toContain("¿Dónde está la estación?");
  });

  test("ending the conversation keeps the scene in the history", async ({
    page,
  }) => {
    await enterTalk(page);
    await page.evaluate(() => window.__heard.push("¿Dónde está la estación?"));
    await holdMic(page, 500);
    await expect(page.locator(".pt-turn.is-partner")).toHaveCount(2);
    await page
      .getByRole("button", { name: "Terminer la conversation" })
      .click();
    await expect(page.locator(".pt-review")).toBeVisible();
    await page.getByRole("button", { name: "Scène suivante" }).click();
    await expect(page.locator(".pt-history li")).toHaveCount(1);
  });
});

test.describe("Parler on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone layout");

  test("nothing covers the conversation's top row (the « Moi » button is hidden)", async ({
    page,
  }) => {
    await enterTalk(page);
    await expect(page.locator(".site-bar-me")).toBeHidden();
    const subs = page.locator(".pt-top .pt-round[data-subs]");
    const box = await subs.boundingBox();
    const hit = await page.evaluate(
      ([x, y]) =>
        document
          .elementFromPoint(x, y)
          ?.closest("button")
          ?.getAttribute("data-subs") ?? null,
      [box.x + box.width / 2, box.y + box.height / 2],
    );
    expect(hit).not.toBeNull();
    // The licence line no longer peeks under the microphone.
    await expect(page.locator("footer.site-foot")).toBeHidden();
  });

  test("the setup's cards go two by two", async ({ page }) => {
    await page.goto("/parler/");
    const [a, b] = await page
      .locator(".pt-scene")
      .evaluateAll((els) =>
        els.slice(0, 2).map((e) => e.getBoundingClientRect().top),
      );
    expect(Math.abs(a - b)).toBeLessThan(2);
  });
});

test.describe("Parler in Arabic", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "gk-partner-prefs",
        JSON.stringify({
          lang: "ar",
          level: "a1",
          scene: "chemin",
          swapped: false,
          subs: null,
        }),
      );
    });
  });

  test("says which Arabic it is", async ({ page }) => {
    await page.goto("/parler/");
    await expect(
      page.getByRole("radio", { name: "Arabe standard" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".pt-variety")).toContainText("fuṣḥā");
    await expect(page.locator(".pt-variety")).toContainText("levantin");
    await expect(page.locator(".pt-variety")).toContainText("darija");
  });

  test("a phone without an Arabic voice is told how to hear the warm-up", async ({
    page,
  }) => {
    await page.goto("/parler/");
    await startButton(page).click();
    const notice = page.locator(".pt-warmup .pt-notice");
    await expect(notice).toContainText("Aucune voix en arabe standard");
    await expect(
      notice.getByRole("button", { name: "Activer la voix naturelle" }),
    ).toBeVisible();
  });

  test("with an Arabic system voice, « Écouter » says the line with it, even at A1's slower pace", async ({
    page,
  }) => {
    await page.addInitScript(() =>
      window.__voices.push({
        name: "Majed",
        lang: "ar-001",
        voiceURI: "ar",
        localService: true,
        default: false,
      }),
    );
    await page.goto("/parler/");
    await startButton(page).click();
    await expect(page.locator(".pt-warmup .pt-notice")).toHaveCount(0);
    const first = page.locator(".pt-exprs li").first();
    const expr = (await first.locator(".pt-expr b").textContent()).trim();
    await first.getByRole("button", { name: "Écouter" }).click();
    await expect
      .poll(() => page.evaluate(() => window.__said.at(-1)))
      .toMatchObject({ text: expr, lang: "ar-SA", voice: "Majed", rate: 0.8 });
  });
});
