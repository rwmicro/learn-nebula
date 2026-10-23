// Table of contents: the left-margin rail on wide screens, and the
// scrollspy that highlights the section currently in view.
//
// The TOC is rendered once, inside .note-aside (lib/html.ts buildToc). Above
// 1500px that aside is the fixed right-hand column; below it, a drawer behind
// the "sommaire" toggle — which left a 1280-1500px screen with the article
// centred in a 680px column and two thirds of the width empty. So a copy of
// the TOC is placed in the left margin as a sticky rail; CSS (main.css,
// .toc-rail) shows it only in that band and only in the normal reading width
// — "élargir" reclaims the margin, and the drawer remains the way in.
// Sidenotes are inline below 1500px, so the left margin is free there.
//
// From 1100px the rail is the left column of the three (main.css): under the
// section being read it opens that section's subsections and lead-ins, and
// ends on how far into the note the reader is and how long is left.
import { scrollProgress } from "../../lib/reading-progress";

(function () {
  const source = document.querySelector(".note-aside .toc");
  let rail = null;
  if (source && source.querySelector('a[href^="#"]')) {
    rail = source.cloneNode(true);
    rail.classList.add("toc-rail");
    rail.setAttribute("data-pagefind-ignore", "");
    // Each subsection's entry knows its section's, so the rail opens only
    // the current one.
    let group = null;
    rail.querySelectorAll("li").forEach((li) => {
      if (li.classList.contains("toc-h2")) group = li;
      else if (group) {
        li._section = group;
        li.classList.add("in-sec");
      }
    });
    // Outside <main>: the family colour has to come along.
    const fam = document.querySelector("main#main")?.getAttribute("data-family");
    if (fam) rail.setAttribute("data-family", fam);
    const progress = document.createElement("p");
    progress.className = "toc-progress";
    progress.innerHTML =
      '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><circle cx="10" cy="10" r="8"/>' +
      '<circle class="toc-progress-fill" cx="10" cy="10" r="8" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" transform="rotate(-90 10 10)"/></svg>' +
      "<span></span>";
    rail.appendChild(progress);
    document.body.appendChild(rail);
  }

  const links = document.querySelectorAll('.toc a[href^="#"]');
  if (!links.length) return;

  // id -> every link pointing at it (the drawer's and the rail's).
  const map = new Map();
  links.forEach((a) => {
    const id = decodeURIComponent(a.getAttribute("href").slice(1));
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(a);
  });

  const headings = Array.from(document.querySelectorAll("main h2[id], main h3[id], main p.lead-in[id]")).filter(
    (h) => map.has(h.id),
  );
  if (!headings.length) return;

  let current = null;
  function setActive(id) {
    if (id === current) return;
    if (current) (map.get(current) || []).forEach((a) => {
      a.classList.remove("active");
      a.removeAttribute("aria-current");
    });
    current = id;
    if (rail) {
      const here = rail.querySelector(`a[href="#${CSS.escape(id)}"]`)?.parentElement;
      const section = here ? here._section || (here.classList.contains("toc-h2") ? here : null) : null;
      rail.querySelectorAll("li").forEach((li) => {
        li.classList.toggle("is-open", !!section && (li === section || li._section === section));
        li.classList.toggle("is-parent", !!section && li === section && li !== here);
      });
    }
    (map.get(id) || []).forEach((a) => {
      a.classList.add("active");
      a.setAttribute("aria-current", "location");
      // Keep the active entry visible inside a rail taller than the screen,
      // by scrolling the rail itself — scrollIntoView would move the page.
      const box = a.closest(".toc-rail");
      if (box && box.scrollHeight > box.clientHeight) {
        const top = a.offsetTop - box.clientHeight / 3;
        box.scrollTop = Math.max(0, top);
      }
    });
  }

  function update() {
    // The reading line: a third of the way down the screen, never above 120px
    // (the sticky bar). The last heading above it owns the view.
    const line = Math.max(120, window.innerHeight * 0.3);
    let active = headings[0].id;
    for (const h of headings) {
      if (h.getBoundingClientRect().top <= line) active = h.id;
      else break;
    }
    setActive(active);
    paintProgress();
  }

  // "22 % · 2 min restantes" under the rail.
  const body = document.querySelector(".article-body");
  const minutes = Number(document.querySelector(".read-state[data-minutes]")?.getAttribute("data-minutes")) || 0;
  const fill = rail && rail.querySelector(".toc-progress-fill");
  const label = rail && rail.querySelector(".toc-progress span");
  let shown = "";
  function paintProgress() {
    if (!body || !fill || !label) return;
    const r = body.getBoundingClientRect();
    const p = scrollProgress(r.top, r.height, window.innerHeight);
    fill.setAttribute("stroke-dashoffset", String(Math.round(100 * (1 - p))));
    const pct = `${Math.round(p * 100)}\u00a0%`;
    const left = Math.ceil(minutes * (1 - p));
    const t = window.__i18n && window.__i18n.t;
    const text = minutes && left > 0 && t ? `${pct} · ${t("tabbar.left", { m: left })}` : pct;
    if (text !== shown) label.textContent = shown = text;
  }

  // Recompute only when a heading crosses the top band of the viewport, instead
  // of on every scroll event; the % rootMargin also re-fires on resize.
  const io = new IntersectionObserver(() => update(), {
    rootMargin: "0px 0px -70% 0px",
    threshold: [0, 1],
  });
  headings.forEach((h) => io.observe(h));
  // A jump (anchor link, Page Down, scrollbar drag) can carry a heading from
  // below the band to above the viewport without it ever intersecting, so the
  // observer stays silent; a rAF-throttled scroll pass catches those.
  let queued = false;
  window.addEventListener(
    "scroll",
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        update();
      });
    },
    { passive: true },
  );
  update();
})();
