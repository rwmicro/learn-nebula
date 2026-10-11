"use client";

import { useEffect } from "react";

/**
 * The map's two behaviours, on top of the server-rendered SVG: a tooltip
 * (country, number of notes) that follows the pointer, and opening the
 * country's entry in the list when its link is followed (click, or arriving
 * with #pays-FRA in the URL). Without it the map still links to the list.
 */
export function CarteHover() {
  useEffect(() => {
    const wrap = document.querySelector<HTMLElement>(".carte-map-wrap");
    if (!wrap) return;
    const tip = document.createElement("div");
    tip.className = "carte-tip";
    tip.setAttribute("role", "status");
    tip.hidden = true;
    wrap.appendChild(tip);
    const notesWord = () =>
      window.__i18n?.t?.("carte.notesWord") ?? "notes";

    const move = (ev: PointerEvent) => {
      const p = (ev.target as Element).closest?.("path[data-n]");
      if (!p) return void (tip.hidden = true);
      tip.textContent = `${p.getAttribute("data-name")} · ${p.getAttribute("data-n")} ${notesWord()}`;
      tip.hidden = false;
      const r = wrap.getBoundingClientRect();
      const x = Math.min(ev.clientX - r.left + 12, r.width - tip.offsetWidth - 4);
      tip.style.left = `${Math.max(0, x)}px`;
      tip.style.top = `${Math.max(0, ev.clientY - r.top - tip.offsetHeight - 10)}px`;
    };
    const leave = () => (tip.hidden = true);
    wrap.addEventListener("pointermove", move);
    wrap.addEventListener("pointerleave", leave);

    const open = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id.startsWith("pays-")) return;
      const d = document.getElementById(id);
      if (d instanceof HTMLDetailsElement) {
        d.open = true;
        d.querySelector("summary")?.focus({ preventScroll: true });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => {
      wrap.removeEventListener("pointermove", move);
      wrap.removeEventListener("pointerleave", leave);
      window.removeEventListener("hashchange", open);
      tip.remove();
    };
  }, []);
  return null;
}
