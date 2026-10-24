// The note page as a phone app (lib/note-app.ts builds the markup, app.css
// shows it under 640px): the section pill and its dots, the cover's floating
// buttons, the bottom toolbar and the "Affichage" sheet. Its buttons proxy
// the note's own controls (.audio-btn, .lesson-btn, .bookmark-btn,
// .text-size-btn, .wide-text-btn, .focus-btn, .translate-wrap), which the
// phone layout hides, so every feature keeps a single implementation.
(function () {
  const root = document.querySelector(".na-chrome");
  const main = document.getElementById("main");
  if (!root || !main) return;
  const phone = window.matchMedia("(max-width: 639.98px)");
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  function tt(k, vars) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k, vars) : k;
  }
  // A proxied click must not bubble on to the document: the drawer and the
  // menus close on any click outside their own trigger.
  function proxy(target, e) {
    if (!target) return;
    if (e) e.stopPropagation();
    target.click();
  }

  // --- back ------------------------------------------------------------------
  // Back to the previous page when there is one on this site; otherwise up to
  // the path or discipline (the link's own href).
  $$("[data-na-back]", root).forEach((a) =>
    a.addEventListener("click", (e) => {
      let same = false;
      try {
        same = !!document.referrer && new URL(document.referrer).origin === location.origin;
      } catch {
        /* no referrer */
      }
      if (same && history.length > 1) {
        e.preventDefault();
        history.back();
      }
    }),
  );

  // --- sections: pill + dots -------------------------------------------------
  const secnav = $(".na-secnav", root);
  const label = $(".na-sec b", root);
  const count = $(".na-sec small", root);
  const dotsEl = $(".na-dots", root);
  const title = label ? label.textContent : "";
  // A heading's own words, without its "#" permalink.
  const headText = (h) => {
    const c = h.cloneNode(true);
    c.querySelectorAll(".anchor, [aria-hidden='true']").forEach((x) => x.remove());
    return c.textContent.trim();
  };
  const heads = $$(".article-body > h2", main).filter((h) => headText(h));
  const dots = heads.map((h, i) => {
    const d = document.createElement("i");
    d.addEventListener("click", () => h.scrollIntoView({ behavior: "smooth", block: "start" }));
    d.dataset.i = String(i);
    d.title = headText(h);
    dotsEl && dotsEl.appendChild(d);
    return d;
  });
  if (dotsEl && heads.length < 2) dotsEl.hidden = true;
  const cover = $(".na-cover", main);
  let current = -2;

  function update() {
    const y = window.scrollY;
    // Over the cover: its own floating buttons; past it, the section pill.
    if (cover) {
      const past = cover.getBoundingClientRect().bottom < 70;
      root.classList.toggle("na-past-cover", past);
    }
    const line = (secnav ? secnav.getBoundingClientRect().bottom : 60) + 24;
    let cur = -1;
    for (let i = 0; i < heads.length; i++) {
      if (heads[i].getBoundingClientRect().top <= line) cur = i;
      else break;
    }
    root.classList.toggle("na-scrolled", y > 8);
    if (cur === current) return;
    current = cur;
    if (label) {
      label.textContent = cur < 0 ? title : `${cur + 1} · ${headText(heads[cur])}`;
    }
    if (count) count.textContent = cur < 0 || heads.length < 2 ? "" : `${cur + 1}/${heads.length}`;
    dots.forEach((d, i) => {
      d.className = i < cur ? "done" : i === cur ? "on" : "";
    });
    // Above the first section the row has nothing to say yet (the pill shows
    // the title, not "1/9"): it appears with the section count.
    if (dotsEl) dotsEl.classList.toggle("na-dots--wait", cur < 0);
  }
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
  window.addEventListener("resize", update);
  update();

  // --- contents: the "Sommaire" sheet ---------------------------------------
  // The sections, read ones ticked and the current one lit with its
  // sub-sections; "N notes mènent ici" opens the note's drawer (tags, local
  // graph). Without the sheet (no headings), the drawer as before.
  const tocSheet = $(".na-toc-sheet", root);
  const tocList = $(".na-toc-list", root);
  const tocMeta = $(".na-toc-meta", root);
  const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  function subsOf(h) {
    const out = [];
    for (let el = h.nextElementSibling; el && el.tagName !== "H2"; el = el.nextElementSibling) {
      if (el.tagName === "H3" && headText(el)) out.push(el);
    }
    return out;
  }
  function paintToc() {
    if (!tocList) return;
    tocList.textContent = "";
    const go = (h) => (e) => {
      e.preventDefault();
      setSheet(false);
      setTimeout(() => h.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    };
    heads.forEach((h, i) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = h.id ? `#${h.id}` : "#";
      a.className = i < current ? "done" : i === current ? "on" : "";
      if (i === current) a.setAttribute("aria-current", "location");
      const n = document.createElement("i");
      if (i < current) n.innerHTML = check;
      else n.textContent = String(i + 1);
      a.append(n, document.createTextNode(headText(h)));
      a.addEventListener("click", go(h));
      li.appendChild(a);
      if (i === current) {
        for (const s of subsOf(h)) {
          const sa = document.createElement("a");
          sa.href = s.id ? `#${s.id}` : "#";
          sa.className = "sub";
          sa.textContent = headText(s);
          sa.addEventListener("click", go(s));
          li.appendChild(sa);
        }
      }
      tocList.appendChild(li);
    });
    if (tocMeta) {
      const m = tocSheet ? tocSheet.dataset.minutes : "";
      tocMeta.textContent =
        current >= 0
          ? tt("noteApp.tocMeta", { n: current + 1, total: heads.length, m })
          : tt("noteApp.tocMetaTotal", { total: heads.length, m });
    }
  }
  $$("[data-na-toc]", root).forEach((b) =>
    b.addEventListener("click", (e) => {
      if (tocSheet && heads.length) {
        e.stopPropagation();
        setSheet(true, tocSheet);
      } else proxy($(".aside-toggle"), e);
    }),
  );
  $$("[data-na-near]", root).forEach((b) =>
    b.addEventListener("click", (e) => {
      setSheet(false);
      proxy($(".aside-toggle"), e);
    }),
  );
  // "étape 7" in the crumbs opens the list of the path's steps.
  const step = $(".na-crumbs .na-step", main);
  const stepOpen = $(".path-step-open");
  if (step && stepOpen) {
    step.setAttribute("role", "button");
    step.tabIndex = 0;
    step.addEventListener("click", (e) => proxy(stepOpen, e));
    step.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        proxy(stepOpen, e);
      }
    });
  }

  // --- lesson ----------------------------------------------------------------
  const lessonBtn = $("[data-na-lesson]", root);
  if (lessonBtn) lessonBtn.addEventListener("click", (e) => proxy($(".lesson-btn"), e));

  // --- listen: mirrors .audio-btn ----------------------------------------------
  const audio = $(".audio-btn");
  const listen = $("[data-na-listen]", root);
  function paintAudio() {
    if (!listen) return;
    listen.disabled = !audio || audio.hidden;
    const on = !!audio && audio.dataset.state === "playing";
    listen.dataset.state = on ? "playing" : "idle";
    listen.setAttribute("aria-pressed", on ? "true" : "false");
  }
  if (listen) {
    listen.addEventListener("click", (e) => proxy(audio, e));
    if (audio) new MutationObserver(paintAudio).observe(audio, { attributes: true, attributeFilter: ["data-state", "hidden"] });
    paintAudio();
  }

  // --- bookmark: mirrors .bookmark-btn -----------------------------------------
  const bm = $(".bookmark-btn");
  const bmProxies = $$("[data-na-bookmark]", root);
  function paintBm() {
    const on = !!bm && bm.getAttribute("aria-pressed") === "true";
    bmProxies.forEach((b) => {
      b.setAttribute(b.getAttribute("role") === "switch" ? "aria-checked" : "aria-pressed", on ? "true" : "false");
      b.hidden = !bm;
    });
  }
  bmProxies.forEach((b) => b.addEventListener("click", (e) => proxy(bm, e)));
  if (bm) new MutationObserver(paintBm).observe(bm, { attributes: true, attributeFilter: ["aria-pressed"] });
  paintBm();

  // --- share -----------------------------------------------------------------
  let toastTimer = null;
  function toast(text) {
    let el = $(".na-toast", root);
    if (!el) {
      el = document.createElement("div");
      el.className = "na-toast glass";
      el.setAttribute("role", "status");
      root.appendChild(el);
    }
    el.textContent = text;
    el.dataset.on = "";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => delete el.dataset.on, 1800);
  }
  $$("[data-na-share]", root).forEach((b) =>
    b.addEventListener("click", async () => {
      const data = { title: document.title, url: location.href.split("#")[0] };
      if (navigator.share) {
        try {
          await navigator.share(data);
        } catch {
          /* dismissed */
        }
        return;
      }
      try {
        await navigator.clipboard.writeText(data.url);
        toast(tt("noteApp.copied"));
      } catch {
        /* no clipboard */
      }
    }),
  );

  // --- the "Affichage" sheet -------------------------------------------------
  const sheet = $(".na-sheet:not(.na-toc-sheet)", root);
  const scrim = $(".na-scrim", root);
  let opener = null;
  let shown = null;
  function setSheet(open, which) {
    const el = which || sheet;
    if (!el || !scrim) return;
    if (open) {
      opener = document.activeElement;
      if (el === sheet) paintSheet();
      else paintToc();
      if (shown && shown !== el) shown.hidden = true;
      shown = el;
      el.hidden = false;
      scrim.hidden = false;
      requestAnimationFrame(() => {
        root.dataset.sheet = "open";
        const first = $("[data-na-close], .on, a, button", el);
        if (first) first.focus({ preventScroll: true });
      });
    } else {
      if (!shown) return;
      const was = shown;
      delete root.dataset.sheet;
      const done = () => {
        if (root.dataset.sheet) return;
        was.hidden = true;
        scrim.hidden = true;
        if (shown === was) shown = null;
      };
      setTimeout(done, 280);
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    }
  }
  $$("[data-na-sheet]", root).forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      setSheet(true);
    }),
  );
  $$("[data-na-close]", root).forEach((b) => b.addEventListener("click", () => setSheet(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root.dataset.sheet) setSheet(false);
  });
  // Drag the grabber (or the header) down to dismiss.
  for (const sheet of [$(".na-sheet:not(.na-toc-sheet)", root), tocSheet].filter(Boolean)) {
    let startY = null;
    sheet.addEventListener(
      "touchstart",
      (e) => {
        if (!e.target.closest(".na-grab, .na-sheet-h")) return;
        startY = e.touches[0].clientY;
      },
      { passive: true },
    );
    sheet.addEventListener(
      "touchmove",
      (e) => {
        if (startY == null) return;
        const dy = Math.max(0, e.touches[0].clientY - startY);
        sheet.style.transform = `translateY(${dy}px)`;
      },
      { passive: true },
    );
    sheet.addEventListener("touchend", (e) => {
      if (startY == null) return;
      const dy = e.changedTouches[0].clientY - startY;
      startY = null;
      sheet.style.transform = "";
      if (dy > 70) setSheet(false);
    });
  }

  // Text size: the three steps of .text-size-btn (font-size.js), which cycles.
  const SIZES = ["sm", "md", "lg"];
  const sizeBtn = $(".text-size-btn");
  const range = $("[data-na-size]", root);
  function paintRange() {
    if (!range) return;
    const i = Math.max(0, SIZES.indexOf(document.body.dataset.textSize || "md"));
    range.value = String(i);
    range.style.setProperty("--v", String(i / 2));
  }
  if (range) {
    range.disabled = !sizeBtn;
    range.addEventListener("input", () => {
      const want = SIZES[+range.value];
      for (let n = 0; n < 3 && sizeBtn && document.body.dataset.textSize !== want; n++) sizeBtn.click();
      paintRange();
    });
  }

  // Theme: theme.js's window.__theme.
  const themeBtns = $$("[data-na-theme]", root);
  function paintTheme() {
    const p = window.__theme ? window.__theme.pref() : "auto";
    themeBtns.forEach((b) => b.setAttribute("aria-checked", b.dataset.naTheme === p ? "true" : "false"));
  }
  themeBtns.forEach((b) =>
    b.addEventListener("click", () => {
      if (window.__theme) window.__theme.set(b.dataset.naTheme);
      paintTheme();
    }),
  );

  // Wide text and focus: switches mirroring their buttons.
  const wideBtn = $(".wide-text-btn");
  const focusBtn = $(".focus-btn");
  const wideSw = $("[data-na-wide]", root);
  const focusSw = $("[data-na-focus]", root);
  function paintSwitches() {
    if (wideSw) {
      wideSw.hidden = !wideBtn;
      wideSw.setAttribute("aria-checked", wideBtn && wideBtn.dataset.state !== "normal" ? "true" : "false");
    }
    if (focusSw) {
      focusSw.hidden = !focusBtn;
      focusSw.setAttribute("aria-checked", document.body.dataset.focus === "true" ? "true" : "false");
    }
  }
  // The column cycles normal → wide → widest; the switch is off or widest.
  if (wideSw)
    wideSw.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!wideBtn) return;
      const goal = wideBtn.dataset.state === "normal" ? "widest" : "normal";
      for (let n = 0; n < 3 && wideBtn.dataset.state !== goal; n++) wideBtn.click();
      paintSwitches();
    });
  if (focusSw)
    focusSw.addEventListener("click", (e) => {
      proxy(focusBtn, e);
      paintSwitches();
      // Focus mode is for reading: show the text straight away.
      if (document.body.dataset.focus === "true") setSheet(false);
    });

  // Ask the garden: the pinned assistant's trigger, when the page has one.
  const ask = $("[data-na-ask]", root);
  if (ask) {
    ask.addEventListener("click", (e) => {
      const trigger = $(".gk-pinned-trigger");
      setSheet(false);
      proxy(trigger, e);
    });
  }

  function paintSheet() {
    paintRange();
    paintTheme();
    paintSwitches();
    paintBm();
    if (ask) ask.hidden = !$(".gk-pinned-trigger");
  }

  // Translate: on a phone, the note's own translate control moves into the
  // sheet (its menu opens inline there); it goes back above the text when
  // the window widens.
  const wrap = $(".translate-wrap");
  const slot = $(".na-translate-slot", root);
  const home = wrap ? { parent: wrap.parentNode, next: wrap.nextSibling } : null;
  const transRow = $(".na-translate", root);
  function placeTranslate() {
    if (!wrap || !slot || !home) {
      if (transRow) transRow.hidden = true;
      return;
    }
    if (phone.matches) {
      if (wrap.parentNode !== slot) slot.appendChild(wrap);
    } else if (wrap.parentNode === slot) {
      home.parent.insertBefore(wrap, home.next);
    }
  }
  placeTranslate();
  if (phone.addEventListener) phone.addEventListener("change", placeTranslate);
  // Picking a language closes the sheet so the translated note shows.
  if (wrap)
    wrap.addEventListener("click", (e) => {
      if (phone.matches && e.target.closest(".translate-menu-item")) setSheet(false);
    });

  document.addEventListener("i18n:change", () => {
    current = -2;
    update();
  });
})();
