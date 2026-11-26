// The garden chat (components/chat/GardenChat.tsx) in a real page, with a
// fake Gemini Nano and a stubbed /api/ask/context: no model and no server in
// CI. Prompts, parsing and history rules are unit-tested (lib/ask-prompts,
// lib/chat-history, lib/chat-tools); this checks what only the page can:
// asking, the streamed answer and its source pastille, the conversation
// kept, "Mes questions", resuming, deleting, the settings, and the offer to
// download a model when the browser has none.
import { test, expect } from "@playwright/test";

/** A LanguageModel that answers « Réponse à : <question> [1] » in two chunks.
 *  window.__lm.calls holds every prompt. */
function fakeNano() {
  const lm = (window.__lm = { calls: [] });
  const session = () => ({
    clone: async () => session(),
    destroy() {},
    async *promptStreaming(text) {
      lm.calls.push(text);
      const q = (text.match(/QUESTION\s*:?\s*(.+)/i) || [, "?"])[1].trim().slice(0, 40);
      yield "Réponse à : ";
      yield `${q} [1]`;
    },
    async prompt(text) {
      lm.calls.push(text);
      return "Réponse.";
    },
  });
  self.LanguageModel = {
    availability: async () => "available",
    create: async () => session(),
  };
}

const CONTEXT = {
  system: "Tu es le jardinier.",
  user: "QUESTION : Qu'est-ce que la sémiologie ?",
  sources: [
    {
      url: "/posts/exemple/",
      title: "Sémiologie",
      crumb: "Sémiologie › Définition",
      excerpt: "La sémiologie étudie les signes.",
    },
  ],
};

/** The chat mounts after hydration: wait for the page to settle before
 *  sending it events. */
const home = async (page) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
};

const ask = (page, question) =>
  page.evaluate((q) => window.dispatchEvent(new CustomEvent("gk:chat-ask", { detail: { question: q } })), question);

test.describe("Garden chat", () => {
  test.skip(({ isMobile }) => isMobile, "desktop panel; the phone layout shares the same code");

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(fakeNano);
    await page.route("**/api/ask/context", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(CONTEXT) }),
    );
    await home(page);
  });

  test("answers on the device, with its source, and keeps the conversation", async ({ page }) => {
    await ask(page, "Qu'est-ce que la sémiologie ?");
    await expect(page.locator(".gc")).toContainText("Qu'est-ce que la sémiologie ?");
    await expect(page.locator(".gc")).toContainText("Réponse à :", { timeout: 15000 });
    expect(await page.evaluate(() => window.__lm.calls.length)).toBeGreaterThan(0);
    // « [1] » became a source pastille.
    await expect(page.locator(".gc [data-cite], .gc .gc-cite").first()).toBeVisible();
    // Kept in this browser.
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("gkChats") || "[]").length))
      .toBe(1);
  });

  test("lists, resumes and deletes conversations in « Mes questions »", async ({ page }) => {
    await ask(page, "Première question");
    await expect(page.locator(".gc")).toContainText("Réponse à :", { timeout: 15000 });
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent("gk:chat-ask", { detail: { view: "history" } })),
    );
    const row = page.locator(".gc-nb-q").filter({ hasText: "Première question" });
    await expect(row).toBeVisible();
    // Resume: the conversation is back in the chat.
    await row.locator("button").first().click();
    await expect(page.locator(".gc")).toContainText("Réponse à :");
    // Delete from the history.
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent("gk:chat-ask", { detail: { view: "history" } })),
    );
    await page.locator(".gc-nb-q").filter({ hasText: "Première question" }).locator(".gc-del").click();
    await expect(page.locator(".gc-nb-q")).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("gkChats") || "[]").length))
      .toBe(0);
  });

  test("opens the settings from the history", async ({ page }) => {
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent("gk:chat-ask", { detail: { view: "history" } })),
    );
    await page.locator(".gc .gc-top .gc-ib").last().click();
    await expect(page.locator(".gc .gc-set")).toBeVisible();
    await expect(page.locator(".gc .gc-set [role=switch]")).toBeVisible();
    await page.locator(".gc .gc-top .gc-ib").first().click();
    await expect(page.locator(".gc h2.gc-big")).toBeVisible();
  });
});

test.describe("Garden chat, no model in the browser", () => {
  test.skip(({ isMobile }) => isMobile, "desktop panel");

  test("offers to download one", async ({ page }) => {
    await page.addInitScript(() => {
      delete self.LanguageModel;
      // A GPU good enough for the downloadable model.
      Object.defineProperty(navigator, "gpu", {
        configurable: true,
        value: { requestAdapter: async () => ({ features: new Set(), limits: {} }) },
      });
    });
    await home(page);
    await page.evaluate(() => window.dispatchEvent(new Event("gk:pin-chat")));
    await expect(page.locator(".gc .gc-dl, .gc-sheet").first()).toBeVisible({ timeout: 15000 });
  });
});
