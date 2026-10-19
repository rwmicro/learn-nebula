// Hover previews for internal note links — the digital-garden convention that
// lets a reader judge whether a [[wikilink]] is worth following without losing
// their place. Fetches the target page, lifts its title and opening prose out
// of `.article-body`, and shows them in a small card anchored to the link.
//
// Everything is inserted with textContent, never innerHTML: the source is
// another page of this same static site, but there is no reason for a preview
// to be a markup sink. Same-origin fetch only, so the `connect-src 'self'` CSP
// in lib/site.ts holds unchanged.
//
// instantpage.js already prefetches these very URLs on hover, so by the time
// this asks for one the browser usually answers from its cache.
//
// Where the browser has CSS anchor positioning, the card is a popover="hint"
// anchored to the link (lib/anchor-popover.ts): it follows the link and turns
// over near the edges by itself. Elsewhere place() below positions it.
import { anchoredCard, anchoredPopoverMode } from "../../lib/anchor-popover";

(function () {
  // Pointer-driven affordance: on touch a tap should just follow the link, and
  // a reader who asked for less motion gets the link's own title attribute.
  if (!window.matchMedia || !window.matchMedia("(hover: hover)").matches)
    return;

  const OPEN_DELAY = 180; // ms of dwell before a preview is worth fetching
  const CLOSE_DELAY = 140; // grace period so the pointer can cross the gap
  const MAX_CHARS = 220;

  const cache = new Map(); // href -> {title, excerpt} | null (no preview)
  let card = null;
  let openTimer = 0;
  let closeTimer = 0;
  let activeLink = null;
  const mode = anchoredPopoverMode();
  let host = null; // anchoredCard(), when the browser places the card

  const isShown = () => !!card && (host ? host.isOpen() : !card.hidden);
  function hideCard() {
    if (!card) return;
    if (host) host.hide();
    else card.hidden = true;
  }

  function ensureCard() {
    if (card) return card;
    card = document.createElement("div");
    card.className = "note-popover";
    card.setAttribute("role", "tooltip");
    card.hidden = true;
    const h = document.createElement("p");
    h.className = "note-popover-title";
    const p = document.createElement("p");
    p.className = "note-popover-excerpt";
    card.append(h, p);
    document.body.appendChild(card);
    if (mode)
      host = anchoredCard(card, "--gk-preview", mode, () => {
        clearTimeout(openTimer);
        activeLink = null;
      });
    // Keep the card open while the pointer is inside it, so a reader can move
    // onto it (to select the text) without it vanishing mid-gesture.
    card.addEventListener("mouseenter", () => clearTimeout(closeTimer));
    card.addEventListener("mouseleave", scheduleClose);
    return card;
  }

  // Same-origin note links only. Anchors inside the page apparatus (backlinks,
  // siblings, the local graph) count too — they are exactly where a reader is
  // deciding what to open next.
  function previewable(a) {
    if (!a || !a.href || a.target === "_blank") return false;
    if (a.closest(".note-popover")) return false;
    // Glossary marks have their own definition card (/js/glossary.js).
    if (a.classList.contains("gloss")) return false;
    let u;
    try {
      u = new URL(a.href);
    } catch {
      return false;
    }
    if (u.origin !== location.origin) return false;
    if (!u.pathname.startsWith("/posts/")) return false;
    // A link to the page we are already on has nothing to preview.
    return u.pathname !== location.pathname;
  }

  function extract(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const body = doc.querySelector(".article-body");
    if (!body) return null;
    const title = doc.querySelector("h1.title-note");
    // Skip the apparatus the note body opens with (KaTeX stylesheet link,
    // callouts, figures) and take the first real prose paragraph.
    let excerpt = "";
    for (const p of body.querySelectorAll("p")) {
      const text = (p.textContent || "").trim();
      if (text.length > 40) {
        excerpt = text;
        break;
      }
    }
    if (!excerpt) {
      excerpt = (body.textContent || "").trim().replace(/\s+/g, " ");
    }
    if (excerpt.length > MAX_CHARS) {
      const cut = excerpt.slice(0, MAX_CHARS);
      const lastSpace = cut.lastIndexOf(" ");
      excerpt = (lastSpace > 80 ? cut.slice(0, lastSpace) : cut) + "…";
    }
    const heading = title ? (title.textContent || "").trim() : "";
    if (!heading && !excerpt) return null;
    return { title: heading, excerpt: excerpt };
  }

  function load(href) {
    if (cache.has(href)) return Promise.resolve(cache.get(href));
    return fetch(href, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.text() : null))
      .then((html) => {
        const data = html ? extract(html) : null;
        cache.set(href, data);
        return data;
      })
      .catch(() => {
        cache.set(href, null);
        return null;
      });
  }

  function place(link) {
    const r = link.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const margin = 8;
    // Prefer below the link; flip above when that would run off the viewport.
    let top = r.bottom + margin;
    if (
      top + c.height > window.innerHeight - margin &&
      r.top - c.height - margin > 0
    ) {
      top = r.top - c.height - margin;
    }
    let left = r.left + r.width / 2 - c.width / 2;
    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - c.width - margin),
    );
    card.style.top = `${Math.round(top + window.scrollY)}px`;
    card.style.left = `${Math.round(left + window.scrollX)}px`;
  }

  function open(link) {
    const href = link.href;
    load(href).then((data) => {
      // The reader moved on while we were fetching.
      if (!data || activeLink !== link) return;
      const el = ensureCard();
      el.querySelector(".note-popover-title").textContent = data.title;
      el.querySelector(".note-popover-excerpt").textContent = data.excerpt;
      el.querySelector(".note-popover-title").hidden = !data.title;
      el.querySelector(".note-popover-excerpt").hidden = !data.excerpt;
      if (host) return host.show(link);
      el.hidden = false;
      // Measure once visible, then position.
      place(link);
    });
  }

  function scheduleClose() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      activeLink = null;
      hideCard();
    }, CLOSE_DELAY);
  }

  function onEnter(e) {
    const link = e.target.closest ? e.target.closest("a") : null;
    if (!previewable(link)) return;
    clearTimeout(closeTimer);
    clearTimeout(openTimer);
    activeLink = link;
    openTimer = setTimeout(() => open(link), OPEN_DELAY);
  }

  function onLeave(e) {
    const link = e.target.closest ? e.target.closest("a") : null;
    if (!link || link !== activeLink) return;
    clearTimeout(openTimer);
    scheduleClose();
  }

  document.addEventListener("mouseover", onEnter);
  document.addEventListener("mouseout", onLeave);
  // Keyboard parity: tabbing onto a link previews it, tabbing away closes it.
  document.addEventListener("focusin", onEnter);
  document.addEventListener("focusout", onLeave);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isShown()) {
      clearTimeout(openTimer);
      activeLink = null;
      hideCard();
    }
  });
  // A card pinned to a link that has scrolled away is just litter. An
  // anchored card scrolls with its link instead (and hides with it).
  window.addEventListener(
    "scroll",
    () => {
      if (!host && isShown()) {
        clearTimeout(openTimer);
        activeLink = null;
        hideCard();
      }
    },
    { passive: true },
  );
})();
