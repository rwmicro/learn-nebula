import { chromium } from "@playwright/test";

const BASE = process.env.BASE || "http://localhost:5050";
const targets = [
  ["/", "home"],
  ["/posts/applied-sciences/agriculture/permaculture/", "note"],
  ["/posts/social-sciences/languages-dialects/indonesien/03-communication/conversation/", "table"],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

for (const [url, name] of targets) {
  const resp = await page.goto(BASE + url, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
    h: document.body.scrollHeight,
  }));
  console.log(
    `${name}: status=${resp?.status()} scrollWidth=${m.sw} innerWidth=${m.iw} overflowX=${m.sw > m.iw} pageHeight=${m.h}`,
  );
  await page.screenshot({ path: `/tmp/shot-${name}.png` });
}

await browser.close();
console.log("done");
