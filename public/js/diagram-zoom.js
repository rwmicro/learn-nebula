// Full-screen view for the build-time mermaid diagrams.
//
// Two thirds of the vault's diagrams are wider than the text column (up to
// ~3400px for a long timeline), so in the page they scroll sideways, and on a
// phone a reader sees a slice of one at a time. Shrinking them to fit is not
// the answer: their labels would drop to 3-5px (see .mermaid-diagram svg in
// main.css). This adds an "Agrandir" button to each diagram, and a tap or click
// on the diagram itself does the same: the diagram opens in a <dialog> fitted
// to the screen, where it pans (drag, arrows), zooms (pinch, wheel, +/−, double
// tap) and closes with Escape.
//
// The dialog's stage carries .mermaid-diagram so the shared stylesheet (scoped
// `.mermaid-diagram svg[aria-roledescription=…]`, scripts/render-mermaid.mjs)
// still dresses the copy; the copy keeps the SVG's id, so the rules an author's
// `classDef` left inline (scoped to that id) and its markers apply to it too.
(function () {
  const figures = document.querySelectorAll("main figure.mermaid-diagram");
  if (!figures.length) return;

  function tt(k) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k) : k;
  }
  function label(el, key) {
    el.setAttribute("aria-label", tt(key));
    el.setAttribute("title", tt(key));
    el.setAttribute("data-i18n-aria-label", key);
    el.setAttribute("data-i18n-title", key);
  }

  let dlg, stage, svg, w, h, scale, tx, ty, returnTo;
  const MIN = 0.1;
  const MAX = 8;

  function build() {
    if (dlg) return;
    dlg = document.createElement("dialog");
    dlg.className = "diagram-dlg";
    dlg.innerHTML =
      '<div class="diagram-dlg-bar">' +
      '<button type="button" class="diagram-dlg-btn" data-act="out">−</button>' +
      '<button type="button" class="diagram-dlg-btn" data-act="fit">⤢</button>' +
      '<button type="button" class="diagram-dlg-btn" data-act="in">+</button>' +
      '<button type="button" class="diagram-dlg-btn diagram-dlg-close" data-act="close">×</button>' +
      "</div>" +
      '<div class="mermaid-diagram diagram-dlg-stage"></div>';
    const acts = { out: "diagram.zoomOut", fit: "diagram.fit", in: "diagram.zoomIn", close: "diagram.close" };
    dlg.querySelectorAll("[data-act]").forEach((b) => label(b, acts[b.dataset.act]));
    dlg.setAttribute("aria-label", tt("diagram.dialog"));
    dlg.setAttribute("data-i18n-aria-label", "diagram.dialog");
    stage = dlg.querySelector(".diagram-dlg-stage");
    document.body.appendChild(dlg);

    dlg.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const r = stage.getBoundingClientRect();
      if (b.dataset.act === "close") dlg.close();
      else if (b.dataset.act === "fit") fit();
      else zoomAt(b.dataset.act === "in" ? 1.4 : 1 / 1.4, r.width / 2, r.height / 2);
    });
    dlg.addEventListener("close", () => {
      stage.textContent = "";
      svg = null;
      document.documentElement.style.overflow = "";
      if (returnTo) returnTo.focus({ preventScroll: true });
    });
    dlg.addEventListener("keydown", (e) => {
      const r = stage.getBoundingClientRect();
      const step = 60;
      const k = e.key;
      if (k === "+" || k === "=") zoomAt(1.25, r.width / 2, r.height / 2);
      else if (k === "-" || k === "_") zoomAt(0.8, r.width / 2, r.height / 2);
      else if (k === "0") fit();
      else if (k === "ArrowLeft") (tx += step), apply();
      else if (k === "ArrowRight") (tx -= step), apply();
      else if (k === "ArrowUp") (ty += step), apply();
      else if (k === "ArrowDown") (ty -= step), apply();
      else return;
      e.preventDefault();
    });

    stage.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = stage.getBoundingClientRect();
        // Trackpad pinch arrives as ctrl+wheel with small deltas.
        const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        zoomAt(f, e.clientX - r.left, e.clientY - r.top);
      },
      { passive: false },
    );

    // Pointer events: one pointer pans, two pinch around their midpoint.
    const pts = new Map();
    let last = null;
    let lastTap = 0;
    const mid = () => {
      const [a, b] = [...pts.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
    };
    stage.addEventListener("pointerdown", (e) => {
      stage.setPointerCapture(e.pointerId);
      const r = stage.getBoundingClientRect();
      pts.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
      last = pts.size === 2 ? mid() : { ...pts.get(e.pointerId) };
      if (pts.size === 1) {
        const now = Date.now();
        if (now - lastTap < 300) {
          // Double tap / double click: 1:1 there, or back to the fitted view.
          const fitted = fitScale();
          if (scale > fitted * 1.05) fit();
          else zoomAt(Math.max(1, fitted * 2) / scale, last.x, last.y);
          lastTap = 0;
        } else lastTap = now;
      }
    });
    stage.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      const r = stage.getBoundingClientRect();
      pts.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
      if (pts.size === 2) {
        const m = mid();
        tx += m.x - last.x;
        ty += m.y - last.y;
        if (last.d > 0) zoomAt(m.d / last.d, m.x, m.y, true);
        last = m;
      } else if (pts.size === 1) {
        const p = pts.get(e.pointerId);
        tx += p.x - last.x;
        ty += p.y - last.y;
        last = { ...p };
      }
      apply();
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      last = pts.size ? { ...[...pts.values()][0] } : null;
    };
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);
  }

  function apply() {
    if (svg) svg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }
  function fitScale() {
    const r = stage.getBoundingClientRect();
    return Math.min(r.width / w, r.height / h, 2);
  }
  function fit() {
    const r = stage.getBoundingClientRect();
    scale = fitScale();
    tx = (r.width - w * scale) / 2;
    ty = (r.height - h * scale) / 2;
    apply();
  }
  // The first view. Fitting the whole drawing is right for most, but a
  // fifteen-event timeline fitted to a phone is a 3px-high strip: when fitting
  // would shrink it below half size, fit the short side instead and start at
  // its beginning (left, or top), so it reads and pans along its length.
  function initialView() {
    if (fitScale() >= 0.5) return fit();
    const r = stage.getBoundingClientRect();
    const wide = w / h > r.width / r.height;
    scale = Math.min(1, wide ? r.height / h : r.width / w);
    tx = wide ? 0 : (r.width - w * scale) / 2;
    ty = wide ? (r.height - h * scale) / 2 : 0;
    apply();
  }
  function zoomAt(f, x, y, quiet) {
    const next = Math.min(MAX, Math.max(MIN, scale * f));
    tx = x - ((x - tx) * next) / scale;
    ty = y - ((y - ty) * next) / scale;
    scale = next;
    if (!quiet) apply();
  }

  function open(figure) {
    const src = figure.querySelector("svg");
    if (!src) return;
    build();
    const vb = (src.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
    const box = src.getBoundingClientRect();
    w = vb[2] || box.width;
    h = vb[3] || box.height;
    svg = src.cloneNode(true);
    svg.removeAttribute("width");
    svg.style.maxWidth = "none";
    svg.style.width = w + "px";
    svg.style.height = h + "px";
    stage.appendChild(svg);
    returnTo = figure;
    document.documentElement.style.overflow = "hidden";
    dlg.showModal();
    initialView();
  }

  figures.forEach((figure) => {
    if (figure.parentElement && figure.parentElement.classList.contains("diagram-frame")) return;
    const frame = document.createElement("div");
    frame.className = "diagram-frame";
    figure.replaceWith(frame);
    frame.appendChild(figure);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "diagram-expand";
    btn.setAttribute("data-pagefind-ignore", "");
    btn.textContent = tt("diagram.expand");
    btn.setAttribute("data-i18n", "diagram.expand");
    btn.addEventListener("click", () => open(figure));
    frame.appendChild(btn);

    // A tap or click on the diagram opens it too, unless it lands on a link
    // the diagram itself carries (mermaid `click … href`). A drag that scrolls
    // the figure sideways fires no click, so scrolling keeps working.
    figure.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      if (window.getSelection && String(window.getSelection())) return;
      open(figure);
    });
  });
})();
