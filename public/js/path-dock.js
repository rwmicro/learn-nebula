// "Étape suivante" on a note of a reading path (phones and tablets): a chip
// pinned bottom left once the path bar at the top has scrolled away — a
// ring with this note's reading progress and its step ("4/35"), the next
// note's title and time, one tap to go on. Built from the path bar
// (lib/path-step.ts), so it exists only where that bar does.
import { scrollProgress } from "../../lib/reading-progress";

(function () {
  const bar = document.querySelector("nav.path-step");
  const next = bar && bar.querySelector('a.path-step-link[rel="next"]');
  const body = document.querySelector(".article-body");
  if (!bar || !next || !body) return;
  const tt = (k, v) =>
    window.__i18n && window.__i18n.t ? window.__i18n.t(k, v) : k;
  const esc = (s) =>
    s.replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );
  const step = (bar.querySelector(".path-step-count")?.textContent || "")
    .replace(/^\D+/, "")
    .trim();
  const title = (
    next.querySelector(".path-step-name")?.textContent ||
    next.title ||
    ""
  ).trim();
  const minutes = Number(next.getAttribute("data-minutes")) || 0;
  const R = 15;
  const C = 2 * Math.PI * R;

  const dock = document.createElement("a");
  dock.className = "path-dock";
  dock.href = next.href;
  dock.hidden = true;
  dock.setAttribute("data-pagefind-ignore", "");
  dock.setAttribute("aria-label", tt("pathStep.dockAria", { title }));
  dock.innerHTML =
    `<svg class="path-dock-ring" viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">` +
    `<circle class="path-dock-track" cx="18" cy="18" r="${R}"/>` +
    `<circle class="path-dock-fill" cx="18" cy="18" r="${R}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}" transform="rotate(-90 18 18)"/>` +
    `<text x="18" y="21.5" text-anchor="middle">${esc(step.replace(/\s+/g, ""))}</text>` +
    `</svg>` +
    `<span class="path-dock-text"><span class="path-dock-k">${esc(tt("pathStep.dockNext"))}</span>` +
    `<span class="path-dock-title">${esc(title)}${minutes ? ` <span class="path-dock-min">· ${esc(tt("parcours.min", { m: minutes }))}</span>` : ""}</span></span>` +
    `<span class="path-dock-go" aria-hidden="true">→</span>`;
  document.body.appendChild(dock);
  const fill = dock.querySelector(".path-dock-fill");

  let barGone = false;
  if (typeof IntersectionObserver !== "undefined") {
    new IntersectionObserver(([e]) => {
      barGone = !e.isIntersecting && e.boundingClientRect.top < 0;
      update();
    }).observe(bar);
  }
  let queued = false;
  function update() {
    queued = false;
    const r = body.getBoundingClientRect();
    const p = scrollProgress(r.top, r.height, window.innerHeight);
    // Only what changed: this runs every scroll frame (see reader-tools.js).
    const dash = (C * (1 - p)).toFixed(2);
    if (fill.getAttribute("stroke-dashoffset") !== dash) fill.setAttribute("stroke-dashoffset", dash);
    if (dock.hidden !== !barGone) dock.hidden = !barGone;
  }
  window.addEventListener(
    "scroll",
    () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
})();
