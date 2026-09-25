// Client-side fallback renderer for ```mermaid diagrams (flowcharts, etc.).
//
// The build step (scripts/render-mermaid.mjs) pre-renders diagrams to inline SVG
// when a Chromium is available; where it isn't (e.g. Cloudflare Pages' native
// build), the raw <pre class="mermaid"> blocks survive and CSS shows them as a
// flagged source box. This renders those in the browser instead.
//
// The (large) mermaid UMD bundle is loaded lazily — only on pages that actually
// contain a diagram. CSP-safe under the prod policy: mermaid's dist calls no
// eval; its 4 `Function("return this")()` global-detection sites short-circuit
// on `self` in a browser and are never evaluated.
import { normaliseMermaid, MERMAID_CONFIG } from "../../lib/mermaid-source.js";

(function () {
  const blocks = document.querySelectorAll("main pre.mermaid");
  if (!blocks.length) return;

  // Capture the source and hide the raw box while we load + render, so the
  // flagged fallback doesn't flash. Restore it if rendering fails.
  const targets = [];
  blocks.forEach((el) => {
    targets.push({ el, source: el.textContent || "", prevDisplay: el.style.display });
    el.style.display = "none";
  });
  const restore = (t) => {
    t.el.style.display = t.prevDisplay;
  };

  function loadMermaid() {
    return new Promise((resolve, reject) => {
      if (window.mermaid) return resolve(window.mermaid);
      const s = document.createElement("script");
      s.src = "/js/mermaid.min.js";
      s.onload = () =>
        window.mermaid ? resolve(window.mermaid) : reject(new Error("mermaid missing"));
      s.onerror = () => reject(new Error("mermaid load failed"));
      document.head.appendChild(s);
    });
  }

  loadMermaid()
    .then(async (mermaid) => {
      // The same config the build uses (lib/mermaid-source.js), so a diagram
      // that falls back to the browser looks like the 282 that didn't.
      mermaid.initialize(MERMAID_CONFIG);
      for (const t of targets) {
        const id = "m" + Math.random().toString(36).slice(2);
        try {
          const { svg } = await mermaid.render(id, normaliseMermaid(t.source.trim()));
          const figure = document.createElement("figure");
          figure.className = "mermaid-diagram";
          // Same as the build-time path: the box scrolls, so it must be
          // keyboard-reachable (see scripts/render-mermaid.mjs).
          figure.tabIndex = 0;
          figure.setAttribute("data-pagefind-ignore", "");
          figure.innerHTML = svg;
          t.el.replaceWith(figure);
        } catch {
          // Invalid diagram — re-reveal the flagged source so it can be fixed
          // (parity with the build-time behaviour). Drop any stray error node
          // mermaid left behind for this render id.
          restore(t);
          const orphan = document.getElementById("d" + id) || document.getElementById(id);
          if (orphan) orphan.remove();
        }
      }
    })
    .catch(() => {
      // Couldn't load mermaid at all (offline) — reveal the raw sources.
      targets.forEach(restore);
    });
})();
