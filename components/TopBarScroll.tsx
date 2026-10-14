"use client";

import { useEffect } from "react";

// Phones (app.css): the site bar is no bar at all, only the "Moi" avatar as a
// round glass button. Once the page's large title has scrolled away, a glass
// pill with the leaf and that title comes in at the top left, over a soft
// fade of the paper. This marks <html data-topbar="scrolled"> and copies the
// title (re-read after a language switch) into the pill.
export function TopBarScroll() {
  useEffect(() => {
    const pill = document.querySelector<HTMLElement>(".site-bar-page");
    const title = () => document.querySelector<HTMLElement>("main h1");
    const fill = () => {
      const h = title();
      // No large title (the home): the current tab's name.
      const tab = document.querySelector<HTMLElement>('.tabbar-tab[aria-current="page"] .tabbar-label');
      if (pill) pill.textContent = (h?.textContent ?? tab?.textContent ?? "").trim();
    };
    let queued = false;
    const tick = () => {
      queued = false;
      const h = title();
      const past = h ? h.getBoundingClientRect().bottom < 56 : window.scrollY > 80;
      if (past && pill && !pill.textContent) fill();
      document.documentElement.dataset.topbar = past ? "scrolled" : "top";
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(tick);
    };
    const onLang = () => requestAnimationFrame(fill);
    fill();
    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("i18n:change", onLang);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("i18n:change", onLang);
    };
  }, []);
  return null;
}
