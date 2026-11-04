// The end of a game on /echecs/ (components/play/ChessPlay.tsx EndOfGame):
// a win, a loss and the way back to the final position. The games are picked
// up from a saved game one move before the end (the "#reprendre" link of the
// home's chess card), so each test plays a single move, or lets Stockfish
// play it.
import { test, expect } from "@playwright/test";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

async function resume(page, sans, level = "expert") {
  await page.addInitScript(
    ([game]) => localStorage.setItem("gkChessGame", JSON.stringify(game)),
    [{ level, color: "w", start: START, sans, unrated: false }],
  );
  await page.goto("/echecs/#reprendre");
  await expect(page.locator(".chess-table")).toBeVisible();
}

/** Square `sq` of the board ("h5"), by its accessible name. */
const square = (page, sq) =>
  page.locator(`.chess-board [aria-label^="${sq}"]`).first();

test.describe("Échecs: the end of a game", () => {
  test("a checkmate given by the reader shows the victory", async ({
    page,
  }) => {
    // 1.e4 e5 2.Fc4 Cc6 3.Dh5 Cf6?? — 4.Dxf7#.
    await resume(page, ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6"]);
    await square(page, "h5").click();
    await square(page, "f7").click();
    const end = page.locator(".chess-end");
    await expect(end).toBeVisible();
    await expect(end).toHaveClass(/is-win/);
    await expect(end.getByRole("heading")).toHaveText("Victoire !");
    await expect(end.locator(".chess-end-elo")).toContainText("+");
    await expect(end.locator(".chess-confetti i").first()).toBeAttached();

    // Closing it shows the final position again; the panel keeps the result.
    await end.getByRole("button", { name: "Fermer" }).click();
    await expect(end).toHaveCount(0);
    await expect(page.locator(".chess-result h2")).toBeVisible();
  });

  test("a checkmate received shows the defeat, and Échap closes it", async ({
    page,
  }) => {
    // 1.f3 e5 2.g4?? — Stockfish mates with 2...Dh4#.
    await resume(page, ["f3", "e5", "g4"]);
    const end = page.locator(".chess-end");
    await expect(end).toBeVisible({ timeout: 30_000 });
    await expect(end).toHaveClass(/is-loss/);
    await expect(end.getByRole("heading")).toHaveText("Défaite");
    await page.keyboard.press("Escape");
    await expect(end).toHaveCount(0);
  });

  test("« Rejouer » from the end starts a new game", async ({ page }) => {
    await resume(page, ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6"]);
    await square(page, "h5").click();
    await square(page, "f7").click();
    await page.locator(".chess-end .chess-btn").last().click();
    await expect(page.locator(".chess-end")).toHaveCount(0);
    await expect(page.locator(".chess-table")).toHaveAttribute(
      "data-phase",
      "play",
    );
  });
});
