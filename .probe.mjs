import { chromium, devices } from "@playwright/test";
const pages = ["/","/notes/","/notes/social-sciences/","/parcours/","/parcours/physique-du-lycee-a-la-prepa/","/themes/","/cartes/","/progression/","/defis/","/jardin/","/frise/","/compte/","/donnees/","/carte/","/echecs/","/duel/","/graph/","/404/","/posts/social-sciences/history/japon/histoire-du-japon/","/parcours/physique-du-lycee-a-la-prepa/fiche/","/cartes/aujourdhui/","/cartes/entrainer/","/themes/philosophie/","/disciplines/philosophie/","/explorer/"];
const b = await chromium.launch();
for (const [label, dev] of [["bureau", { viewport: { width: 1280, height: 900 } }], ["tel", devices["Pixel 5"]]]) {
  const p = await (await b.newContext({ ...dev, serviceWorkers: "block" })).newPage();
  for (const u of pages) {
    const r = await p.goto("http://localhost:1313" + u).catch(() => null);
    if (!r || r.status() >= 400 && u !== "/404/") { console.log(label, u, "status", r?.status()); continue; }
    await p.waitForLoadState("networkidle");
    const d = await p.evaluate(() => {
      const h = document.querySelector("main h1") || document.querySelector("h1");
      const m = document.querySelector("main");
      // widest content column: the main or its first child with a max-width
      let col = m, w = m ? getComputedStyle(m).maxWidth : "";
      for (const el of m ? [m, ...m.querySelectorAll(":scope > *")] : []) { const mw = getComputedStyle(el).maxWidth; if (mw !== "none") { col = el; w = mw; break; } }
      const cs = h && getComputedStyle(h);
      return { cls: h?.className.slice(0, 28), fs: cs?.fontSize, fw: cs?.fontWeight, ff: cs?.fontFamily.split(",")[0], top: h ? Math.round(h.getBoundingClientRect().top + scrollY) : null, colw: col ? Math.round(col.getBoundingClientRect().width) : null, maxw: w, mcls: m?.className.slice(0, 30) };
    });
    console.log([label, u, d.cls, d.fs, d.fw, d.ff, "top=" + d.top, "col=" + d.colw, d.maxw, d.mcls].join(" | "));
  }
}
await b.close();
