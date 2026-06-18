// In-page image preview with gallery navigation, caption, counter, zoom/pan,
// keyboard and touch (swipe) support. No dependencies.
(function () {
  const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/i;

  let items = [];
  let index = 0;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let overlay, imgEl, captionEl, countEl, prevBtn, nextBtn;
  let lastFocus = null;

  function build() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "lightbox";
    overlay.hidden = true;
    overlay.innerHTML =
      '<button class="lb-btn lb-close" aria-label="Close">×</button>' +
      '<button class="lb-btn lb-prev" aria-label="Previous">‹</button>' +
      '<button class="lb-btn lb-next" aria-label="Next">›</button>' +
      '<div class="lb-stage"><img class="lb-img" alt=""></div>' +
      '<div class="lb-bar"><span class="lb-count"></span><span class="lb-caption"></span></div>';
    document.body.appendChild(overlay);
    imgEl = overlay.querySelector(".lb-img");
    captionEl = overlay.querySelector(".lb-caption");
    countEl = overlay.querySelector(".lb-count");
    prevBtn = overlay.querySelector(".lb-prev");
    nextBtn = overlay.querySelector(".lb-next");

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.classList.contains("lb-stage")) close();
    });
    overlay.querySelector(".lb-close").addEventListener("click", close);
    prevBtn.addEventListener("click", (e) => { e.stopPropagation(); go(-1); });
    nextBtn.addEventListener("click", (e) => { e.stopPropagation(); go(1); });
    addZoomAndSwipe();
  }

  function gather() {
    const list = [];
    document.querySelectorAll("main img, a[href]").forEach((el) => {
      if (el.tagName === "IMG") {
        if (el.closest(".lightbox")) return;
        list.push({ src: el.currentSrc || el.src, alt: el.alt || "", el });
      } else {
        const href = el.getAttribute("href") || "";
        if (IMG_EXT.test(href)) list.push({ src: el.href, alt: (el.textContent || "").trim(), el });
      }
    });
    return list;
  }

  function render() {
    const it = items[index];
    resetZoom();
    imgEl.src = it.src;
    imgEl.alt = it.alt;
    captionEl.textContent = it.alt;
    const multiple = items.length > 1;
    countEl.textContent = multiple ? `${index + 1} / ${items.length}` : "";
    prevBtn.hidden = nextBtn.hidden = !multiple;
  }

  function open(list, i) {
    build();
    lastFocus = document.activeElement;
    items = list;
    index = i;
    overlay.hidden = false;
    document.documentElement.style.overflow = "hidden";
    render();
    overlay.querySelector(".lb-close").focus();
  }

  function close() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    imgEl.src = "";
    document.documentElement.style.overflow = "";
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function go(delta) {
    index = (index + delta + items.length) % items.length;
    render();
  }

  // --- zoom / pan / swipe ---
  function applyTransform() {
    imgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    imgEl.style.cursor = scale > 1 ? "grab" : "zoom-in";
  }
  function resetZoom() {
    scale = 1; tx = 0; ty = 0;
    if (imgEl) applyTransform();
  }

  function addZoomAndSwipe() {
    // Desktop: wheel zoom, drag pan, double-click toggle.
    imgEl.addEventListener("wheel", (e) => {
      e.preventDefault();
      scale = Math.min(5, Math.max(1, scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      if (scale === 1) { tx = 0; ty = 0; }
      applyTransform();
    }, { passive: false });

    imgEl.addEventListener("dblclick", (e) => {
      e.preventDefault();
      scale = scale > 1 ? 1 : 2.5;
      tx = 0; ty = 0;
      applyTransform();
    });

    let dragging = false, sx = 0, sy = 0;
    imgEl.addEventListener("mousedown", (e) => {
      if (scale <= 1) return;
      dragging = true; sx = e.clientX - tx; sy = e.clientY - ty;
      imgEl.style.cursor = "grabbing"; e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      tx = e.clientX - sx; ty = e.clientY - sy; applyTransform();
    });
    window.addEventListener("mouseup", () => { dragging = false; if (imgEl) applyTransform(); });

    // Touch: swipe to navigate (unzoomed), one-finger pan (zoomed), double-tap zoom.
    let tStartX = 0, tStartY = 0, tStartTx = 0, tStartTy = 0, lastTap = 0;
    overlay.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      tStartX = t.clientX; tStartY = t.clientY; tStartTx = tx; tStartTy = ty;
      const now = Date.now();
      if (now - lastTap < 300 && e.target === imgEl) {
        scale = scale > 1 ? 1 : 2.5; tx = 0; ty = 0; applyTransform();
      }
      lastTap = now;
    }, { passive: true });
    overlay.addEventListener("touchmove", (e) => {
      if (scale > 1) {
        const t = e.touches[0];
        tx = tStartTx + (t.clientX - tStartX);
        ty = tStartTy + (t.clientY - tStartY);
        applyTransform();
      }
    }, { passive: true });
    overlay.addEventListener("touchend", (e) => {
      if (scale > 1) return;
      const dx = (e.changedTouches[0].clientX - tStartX);
      const dy = (e.changedTouches[0].clientY - tStartY);
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  document.addEventListener("keydown", (e) => {
    if (!overlay || overlay.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "Tab") {
      // Trap focus within the overlay controls.
      const f = [...overlay.querySelectorAll(".lb-btn")].filter((b) => !b.hidden);
      if (!f.length) return;
      e.preventDefault();
      const i = f.indexOf(document.activeElement);
      const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i >= f.length - 1 ? 0 : i + 1);
      f[n].focus();
    }
  });

  document.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    const img = e.target.closest("main img");
    let target = null;
    if (a && IMG_EXT.test(a.getAttribute("href") || "")) target = a;
    else if (img) target = img;
    if (!target) return;
    e.preventDefault();
    const list = gather();
    const i = list.findIndex((it) => it.el === target);
    open(list, i >= 0 ? i : 0);
  });
})();
