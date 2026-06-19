// Draggable assistant bar (semantic RAG).
//
// A wide input bar (robot grip + question field + send button) floats on the
// right by default and can be dragged anywhere by its robot grip (or the answer
// header). The answer expands in a panel above it. Submitting POSTs the question
// to the /api/ask Function, which embeds it, retrieves the nearest note chunks
// from Vectorize, and streams back a grounded answer from Claude Haiku. Retrieval
// and the API key stay server-side; the client only sends the question. The
// position is remembered in localStorage.
(function () {
  if (document.querySelector(".ask-bar")) return; // guard against double-load
  const KEY = "askBar";

  const ROBOT =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="4" y="8" width="16" height="11" rx="2"/>' +
    '<path d="M12 4.5V8"/><circle cx="12" cy="3.2" r="1"/>' +
    '<circle cx="9" cy="13" r="1.1"/><circle cx="15" cy="13" r="1.1"/>' +
    '<path d="M9.5 16.4h5"/><path d="M2 12v3M22 12v3"/></svg>';

  const bar = document.createElement("div");
  bar.className = "ask-bar";
  bar.innerHTML =
    '<div class="ask-answer" hidden>' +
    '<div class="ask-answer-head">' +
    '<span class="ask-answer-title">demander au jardin</span>' +
    '<button class="ask-close" type="button" aria-label="Fermer">×</button>' +
    "</div>" +
    '<div class="ask-output" aria-live="polite"></div>' +
    '<div class="ask-sources"></div>' +
    "</div>" +
    '<form class="ask-form">' +
    '<span class="ask-grip" aria-hidden="true" title="Glisser pour déplacer">' +
    ROBOT +
    "</span>" +
    '<input class="ask-input" type="text" autocomplete="off" maxlength="1000" placeholder="Demander au jardin…" aria-label="Votre question">' +
    '<button class="ask-submit" type="submit">envoyer</button>' +
    "</form>";
  document.body.appendChild(bar);

  const answer = bar.querySelector(".ask-answer");
  const answerHead = bar.querySelector(".ask-answer-head");
  const grip = bar.querySelector(".ask-grip");
  const closeBtn = bar.querySelector(".ask-close");
  const output = bar.querySelector(".ask-output");
  const sourcesEl = bar.querySelector(".ask-sources");
  const form = bar.querySelector(".ask-form");
  const input = bar.querySelector(".ask-input");
  const submit = bar.querySelector(".ask-submit");

  // --- restore + keep position ----------------------------------------------
  const pos = load();
  if (pos.left != null && pos.top != null) placeAt(pos.left, pos.top);
  window.addEventListener("resize", () => {
    if (bar.style.left)
      placeAt(parseFloat(bar.style.left), parseFloat(bar.style.top));
  });

  // --- drag (by the robot grip and the answer header) -----------------------
  attachDrag(grip);
  attachDrag(answerHead, ".ask-close");

  function attachDrag(handle, ignoreSel) {
    let drag = null;
    handle.style.cursor = "move";
    handle.addEventListener("pointerdown", (e) => {
      if (ignoreSel && e.target.closest(ignoreSel)) return;
      const r = bar.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      handle.setPointerCapture(e.pointerId);
      e.preventDefault(); // don't focus/select while grabbing
    });
    handle.addEventListener("pointermove", (e) => {
      if (drag) placeAt(e.clientX - drag.dx, e.clientY - drag.dy);
    });
    handle.addEventListener("pointerup", (e) => {
      if (!drag) return;
      drag = null;
      handle.releasePointerCapture(e.pointerId);
      const r = bar.getBoundingClientRect();
      save({ left: r.left, top: r.top });
    });
  }

  function placeAt(left, top) {
    // The answer panel is absolutely positioned, so the bar box is just the
    // input row — clamp that into the viewport (the panel floats above it).
    const w = bar.offsetWidth;
    const h = bar.offsetHeight;
    left = Math.max(4, Math.min(left, window.innerWidth - w - 4));
    top = Math.max(4, Math.min(top, window.innerHeight - h - 4));
    bar.style.left = left + "px";
    bar.style.top = top + "px";
    bar.style.right = "auto";
    bar.style.bottom = "auto";
  }

  // --- answer panel ---------------------------------------------------------
  closeBtn.addEventListener("click", () => {
    answer.hidden = true;
    output.textContent = "";
    sourcesEl.textContent = "";
    input.focus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !answer.hidden) closeBtn.click();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) ask(q);
  });

  async function ask(question) {
    answer.hidden = false;
    output.textContent = "";
    sourcesEl.textContent = "";
    setBusy(true);

    let resp;
    try {
      resp = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
    } catch {
      output.textContent = "Impossible de joindre l'assistant.";
      setBusy(false);
      return;
    }
    if (!resp.ok || !resp.body) {
      output.textContent = "L'assistant est indisponible pour le moment.";
      setBusy(false);
      return;
    }

    renderSources(resp.headers.get("x-sources"));
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      output.textContent += dec.decode(value, { stream: true });
      output.scrollTop = output.scrollHeight;
    }
    setBusy(false);
  }

  function renderSources(header) {
    if (!header) return;
    let sources = [];
    try {
      sources = JSON.parse(decodeURIComponent(header));
    } catch {
      return;
    }
    if (!Array.isArray(sources) || !sources.length) return;

    const title = document.createElement("p");
    title.className = "ask-sources-title";
    title.textContent = "Notes consultées";
    const ul = document.createElement("ul");
    for (const s of sources) {
      if (!s || !s.url) continue;
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = s.url; // same-origin /posts/… path
      a.textContent = s.title || s.url;
      li.appendChild(a);
      ul.appendChild(li);
    }
    sourcesEl.append(title, ul);
  }

  function setBusy(busy) {
    input.disabled = busy;
    submit.disabled = busy;
    answer.dataset.busy = busy ? "true" : "false";
    form.setAttribute("aria-busy", busy ? "true" : "false");
  }

  // --- persistence ----------------------------------------------------------
  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    } catch {
      return {};
    }
  }
  function save(p) {
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* localStorage unavailable */
    }
  }
})();
