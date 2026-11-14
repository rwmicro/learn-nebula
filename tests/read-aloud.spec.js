// "Écouter" in the browser (public/js/audio.js → read-aloud.bundle.js), with
// a fake SpeechSynthesis: headless Chromium has no voice, and a test must
// not depend on the machine's. The cutting into passages, the choice of
// voices and the sequencing are unit-tested (lib/read-aloud*.test.ts); this
// checks what only a page can: the button, the relay, "Voix", the phone.
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

/** The first exported note whose HTML matches `re`, as a site-root URL. */
function findNote(re) {
  const root = path.join("out", "posts");
  let hit = null;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (hit) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (
        e.name === "index.html" &&
        re.test(fs.readFileSync(full, "utf8"))
      )
        hit = "/" + path.relative("out", dir).split(path.sep).join("/") + "/";
    }
  };
  try {
    walk(root);
  } catch {
    /* no export to scan */
  }
  return hit;
}

/** A SpeechSynthesis that "speaks" each utterance for `ms`, in order, and
 *  keeps what it was asked to say in window.__spoken. */
function fakeSpeech({ voices, ms }) {
  window.__spoken = [];
  let queue = [];
  let timer = null;
  let paused = false;
  const pump = () => {
    if (timer || paused || !queue.length) return;
    const u = queue[0];
    u.onstart?.({});
    if (u.text.trim())
      window.__spoken.push({
        lang: u.lang,
        voice: u.voice?.name ?? null,
        text: u.text,
      });
    timer = setTimeout(() => {
      timer = null;
      queue.shift();
      u.onend?.({});
      pump();
    }, ms);
  };
  const synth = {
    getVoices: () => voices,
    speak(u) {
      queue.push(u);
      pump();
    },
    cancel() {
      clearTimeout(timer);
      timer = null;
      queue = [];
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      pump();
    },
    get speaking() {
      return !!timer;
    },
    get pending() {
      return queue.length > 1;
    },
    get paused() {
      return paused;
    },
    addEventListener() {},
  };
  Object.defineProperty(window, "speechSynthesis", {
    value: synth,
    configurable: true,
  });
  window.SpeechSynthesisUtterance = function (text) {
    this.text = text;
  };
}

const VOICES = [
  { name: "Thomas", lang: "fr-FR", localService: true, voiceURI: "thomas" },
  { name: "Samantha", lang: "en-US", localService: true, voiceURI: "samantha" },
  { name: "Tingting", lang: "zh-CN", localService: true, voiceURI: "tingting" },
];

async function open(page, url, opts = {}) {
  // Without what the natural voice needs, only the installed voices count.
  if (opts.noNatural)
    await page.addInitScript(() => delete window.AudioContext);
  await page.addInitScript(fakeSpeech, {
    voices: opts.voices ?? VOICES,
    ms: opts.ms ?? 4000,
  });
  await page.goto(url);
}
const phone = (page) => (page.viewportSize()?.width ?? 1280) < 640;
/** The control that starts the reading at this width. */
const listen = (page) =>
  phone(page)
    ? page.locator("[data-na-listen]")
    : page.locator(".note-dock .audio-btn");
const relay = (page) => page.locator(phone(page) ? ".ra-strip" : ".ra-in-dock");

const anyNote = findNote(/class="article-body"/);
const mandarin = findNote(/data-speech-lang="zh"[\s\S]*[一-鿿]/);

test.describe("Écouter", () => {
  test.skip(!anyNote, "no note in this build");

  test("the reader is fetched on demand, not with the page", async ({
    page,
  }) => {
    const fetched = [];
    page.on(
      "request",
      (r) => r.url().includes("read-aloud.bundle") && fetched.push(r.url()),
    );
    await open(page, anyNote);
    await expect(listen(page)).toBeVisible();
    expect(fetched).toHaveLength(0);
    await listen(page).click();
    await expect(relay(page)).toBeVisible();
    expect(fetched).toHaveLength(1);
  });

  test("starts, pauses, resumes and stops", async ({ page }) => {
    await open(page, anyNote);
    const state = () =>
      page.locator(".audio-btn").first().getAttribute("data-state");
    await listen(page).click();
    await expect(relay(page)).toBeVisible();
    await expect.poll(state).toBe("playing");
    await expect(page.locator("html")).toHaveAttribute("data-ra", "");
    // The relay names who reads: a language code and a voice.
    await expect(relay(page).locator(".ra-code")).toHaveText(/^[A-Z]{2,3}$/);
    await expect(relay(page).locator(".ra-name")).not.toBeEmpty();

    const toggle = relay(page).locator(".ra-toggle");
    await toggle.click();
    await expect.poll(state).toBe("paused");
    await expect(toggle).toHaveAttribute("aria-label", /.+/);
    await toggle.click();
    await expect.poll(state).toBe("playing");

    await relay(page).locator(".ra-stop").click();
    await expect.poll(state).toBe("idle");
    await expect(relay(page)).toBeHidden();
    await expect(page.locator("html")).not.toHaveAttribute("data-ra", "");
    expect(
      await page.evaluate(() => CSS.highlights?.has("ra-now") ?? false),
    ).toBe(false);
  });

  test("a double tap before the script is there starts one reading", async ({
    page,
  }) => {
    await open(page, anyNote);
    await listen(page).dblclick();
    await expect(relay(page)).toBeVisible();
    await expect
      .poll(() => page.locator(".audio-btn").first().getAttribute("data-state"))
      .toBe("playing");
  });

  test("the relay takes the place of the bar's title, or of the ask field on a phone", async ({
    page,
  }) => {
    await open(page, anyNote);
    await listen(page).click();
    await expect(relay(page)).toBeVisible();
    if (phone(page)) {
      await expect(page.locator(".ra-in-dock")).toBeHidden();
      await expect(page.locator(".gk-pinned-trigger")).toBeHidden();
      await expect(page.locator(".na-toolbar .na-next")).toBeHidden();
      const box = await relay(page).boundingBox();
      const bar = await page.locator(".na-toolbar").boundingBox();
      expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
    } else {
      await expect(page.locator(".ra-strip")).toBeHidden();
      await expect(page.locator(".note-dock .dock-now")).toBeHidden();
      await expect(page.locator(".note-dock .audio-btn")).toBeHidden();
      // The bar stays inside the window.
      const box = await page.locator(".note-dock").boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
    }
  });

  test("“Voix” lists the note's languages, closes on Escape and gives the focus back", async ({
    page,
  }) => {
    await open(page, anyNote);
    await listen(page).click();
    const voix = relay(page).locator(".ra-voix");
    await voix.click();
    const panel = page
      .getByRole("dialog", { name: /.+/ })
      .filter({ has: page.locator(".ra-rows") });
    await expect(panel).toBeVisible();
    await expect(voix).toHaveAttribute("aria-expanded", "true");
    expect(await panel.locator(".ra-row").count()).toBeGreaterThan(0);
    await expect(panel.locator(".ra-row.is-now")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(voix).toHaveAttribute("aria-expanded", "false");
    await expect(voix).toBeFocused();
  });

  test("a chosen voice is used at once and remembered", async ({ page }) => {
    const voices = [
      ...VOICES,
      { name: "Amélie", lang: "fr-CA", localService: true, voiceURI: "amelie" },
    ];
    await open(page, anyNote, { voices });
    await listen(page).click();
    await relay(page).locator(".ra-voix").click();
    const row = page.locator(".ra-row.is-now");
    const lang = await row.getAttribute("data-lang");
    const select = row.locator("select");
    const ids = await select
      .locator("option")
      .evaluateAll((os) => os.map((o) => o.value));
    // Another installed voice: the downloadable ones (Piper, Kokoro, MMS)
    // would fetch a model.
    const current = await select.inputValue();
    const other = ids.find((id) => id.startsWith("system:") && id !== current);
    test.skip(!other, "one installed voice only for the note's language");
    await select.selectOption(other);
    const name = other.replace("system:", "");
    await expect(relay(page).locator(".ra-name")).toHaveText(name);
    await expect
      .poll(() => page.evaluate(() => window.__spoken.at(-1)?.voice))
      .toBe(name);
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("gk-voices"))),
    ).toEqual({ [lang]: other });
  });

  test("nothing to read with: the button says so by staying idle", async ({
    page,
  }) => {
    // Voices for another language only, and no natural voice turned on.
    await open(page, anyNote, {
      voices: [
        { name: "Kyoko", lang: "ja-JP", localService: true, voiceURI: "kyoko" },
      ],
    });
    await listen(page).click();
    await page.waitForFunction(() => window.__gkReadAloud === true);
    await expect
      .poll(() => page.locator(".audio-btn").first().getAttribute("data-state"))
      .toBe("idle");
    await expect(relay(page)).toBeHidden();
  });

  test("leaving the page stops the reading", async ({ page }) => {
    await open(page, anyNote);
    await listen(page).click();
    await expect(relay(page)).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await expect(relay(page)).toBeHidden();
    expect(await page.evaluate(() => speechSynthesis.speaking)).toBe(false);
  });
});

test.describe("Écouter, a note in two languages", () => {
  test.skip(!mandarin, "no Mandarin note in this build");

  test("each passage is read by the voice of its language", async ({
    page,
  }) => {
    await open(page, mandarin, { ms: 30 });
    await listen(page).click();
    await expect
      .poll(
        () =>
          page.evaluate(
            () => new Set(window.__spoken.map((s) => s.voice)).size,
          ),
        { timeout: 20000 },
      )
      .toBeGreaterThan(1);
    const spoken = await page.evaluate(() => window.__spoken);
    for (const s of spoken) {
      const han = /[一-鿿]/.test(s.text);
      if (s.voice === "Tingting")
        expect(s.text, "Chinese voice, Chinese text").toMatch(/[一-鿿]/);
      if (s.voice === "Thomas")
        expect(han, `French voice reading “${s.text.slice(0, 40)}”`).toBe(
          false,
        );
    }
  });

  test("“Voix” offers one voice per language, and the ring one arc per run", async ({
    page,
  }) => {
    await open(page, mandarin);
    await listen(page).click();
    await relay(page).locator(".ra-voix").click();
    await expect(page.locator('.ra-row[data-lang="fr"]')).toHaveCount(1);
    await expect(page.locator('.ra-row[data-lang="zh"]')).toHaveCount(1);
    const colours = await relay(page)
      .locator(".ra-ring circle")
      .evaluateAll((cs) => [
        ...new Set(cs.map((c) => c.getAttribute("stroke"))),
      ]);
    expect(colours.length).toBeGreaterThan(1);
  });

  test("a language with only a voice to download waits for the reader's choice", async ({
    page,
  }) => {
    await open(page, mandarin, { voices: [VOICES[0]] });
    await listen(page).click();
    await relay(page).locator(".ra-voix").click();
    const row = page.locator('.ra-row[data-lang="zh"]');
    await expect(row).toHaveClass(/is-unset/);
    await expect(row.locator("select")).toHaveValue("");
    await expect(row.locator(".ra-row-state")).not.toBeEmpty();
    await expect(row.locator(".ra-hear")).toBeDisabled();
    // Nothing was downloaded behind the reader's back.
    expect(await page.evaluate(() => !!window.__gkPiper)).toBe(false);
  });

  test("a Kokoro voice picked in “Voix” reads with its own key", async ({
    page,
  }) => {
    // The page side of the natural voices, replaced: no model is fetched.
    await page.addInitScript(() => {
      window.__natural = [];
      window.__gkPiper = {
        piperVoiceFor: () => "x",
        loadPiperVoice: async () => 22050,
        deletePiperVoices: async () => {},
        readWithPiper: async (o) => {
          window.__natural.push({ lang: o.lang, voice: o.voice ?? null });
          setTimeout(() => {
            o.onPlaying?.();
            setTimeout(() => o.onEnd?.(), 30);
          }, 10);
          return { pause() {}, resume() {}, stop() {} };
        },
      };
    });
    await open(page, mandarin, { voices: VOICES, ms: 30 });
    await listen(page).click();
    await relay(page).locator(".ra-voix").click();
    const select = page.locator('.ra-row[data-lang="fr"] select');
    await expect(select.locator('option[value="kokoro"]')).toHaveText(
      /Siwis \(Kokoro\)/,
    );
    await select.selectOption("kokoro");
    await expect
      .poll(() => page.evaluate(() => window.__natural.at(-1)))
      .toEqual({ lang: "fr", voice: "kokoro:ff_siwis:fr" });
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("gk-voices"))),
    ).toMatchObject({ fr: "kokoro" });
  });

  test("a language nobody can read here is skipped, and “Voix” says so", async ({
    page,
  }) => {
    // French only: the Chinese passages have no voice.
    await open(page, mandarin, {
      voices: [VOICES[0]],
      ms: 30,
      noNatural: true,
    });
    await listen(page).click();
    await relay(page).locator(".ra-voix").click();
    await expect(page.locator('.ra-row[data-lang="zh"]')).toHaveClass(
      /is-mute/,
    );
    await expect(page.locator(".ra-mute-note")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__spoken.length), {
        timeout: 20000,
      })
      .toBeGreaterThan(2);
    const spoken = await page.evaluate(() => window.__spoken);
    expect(spoken.every((s) => s.voice === "Thomas")).toBe(true);
    expect(spoken.some((s) => /[一-鿿]{2,}/.test(s.text))).toBe(false);
  });
});
