// Copy affordances in the note body:
// - the "#" anchor rehype-autolink-headings appends to every heading (lib/
//   markdown.ts) copies the section's URL, and still jumps to it as before;
// - every code block (Shiki's <pre class="chroma">) gets a "copier" button.
// Both show a short "copié" confirmation. Labels come from the i18n runtime
// and carry data-i18n markers, so a later locale switch relabels them too.
// The buttons are created here, after the build, so Pagefind never sees them;
// the print stylesheet hides them (main.css).
(function () {
  const article = document.querySelector(".article-body");
  if (!article) return;

  function tt(k) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k) : k;
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Plain-http fallback (a LAN preview): the legacy selection-based copy.
    return new Promise((resolve, reject) => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
      if (ok) resolve();
      else reject(new Error("copy failed"));
    });
  }

  // One polite live region for both kinds of confirmation, so a screen reader
  // hears "copié" without the focus moving.
  const live = document.createElement("span");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");
  live.setAttribute("data-pagefind-ignore", "");
  document.body.appendChild(live);
  function announce(msg) {
    live.textContent = "";
    setTimeout(() => (live.textContent = msg), 30);
  }

  // Flash a confirmation on `el` for 1.6s. data-copied drives the styling; a
  // button swaps its own label ("copier" → "copié"), an anchor shows the label
  // in a small tag drawn from data-copied-label (CSS ::after).
  const timers = new WeakMap();
  function flash(el, key, restoreKey) {
    el.dataset.copied = "true";
    el.setAttribute("data-copied-label", tt(key));
    if (restoreKey) el.textContent = tt(key);
    clearTimeout(timers.get(el));
    timers.set(
      el,
      setTimeout(() => {
        el.dataset.copied = "false";
        if (restoreKey) el.textContent = tt(restoreKey);
      }, 1600),
    );
    announce(tt(key));
  }

  // --- Heading anchors -----------------------------------------------------
  article.querySelectorAll("h2 > a.anchor, h3 > a.anchor, h4 > a.anchor").forEach((a) => {
    a.setAttribute("aria-label", tt("noteActions.copyLinkAria"));
    a.setAttribute("data-i18n-aria-label", "noteActions.copyLinkAria");
    a.setAttribute("title", tt("noteActions.copyLinkAria"));
    a.setAttribute("data-i18n-title", "noteActions.copyLinkAria");
    a.addEventListener("click", (e) => {
      // Modified clicks (new tab, etc.) keep the browser's own behaviour.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      const hash = a.getAttribute("href") || "";
      const url = new URL(hash, location.href).href;
      // Still a link to the section: put it in the address bar (without a
      // history entry per click). No scroll — the heading was just clicked, so
      // it is on screen already; jumping it to the top hid it under the bar.
      try {
        history.replaceState(history.state, "", hash);
      } catch {
        /* sandboxed */
      }
      copy(url).then(
        () => flash(a, "noteActions.linkCopied"),
        () => {
          location.hash = hash;
        },
      );
    });
  });

  // --- Code blocks ---------------------------------------------------------
  article.querySelectorAll("pre.chroma").forEach((pre) => {
    if (pre.parentElement && pre.parentElement.classList.contains("code-block")) return;
    const wrap = document.createElement("div");
    wrap.className = "code-block";
    pre.replaceWith(wrap);
    wrap.appendChild(pre);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-copy";
    btn.setAttribute("data-pagefind-ignore", "");
    btn.textContent = tt("noteActions.copyCode");
    btn.setAttribute("data-i18n", "noteActions.copyCode");
    btn.setAttribute("aria-label", tt("noteActions.copyCodeAria"));
    btn.setAttribute("data-i18n-aria-label", "noteActions.copyCodeAria");
    btn.addEventListener("click", () => {
      const code = pre.querySelector("code");
      copy((code || pre).innerText.replace(/\n$/, "")).then(
        () => flash(btn, "noteActions.codeCopied", "noteActions.copyCode"),
        () => {},
      );
    });
    wrap.appendChild(btn);
  });
})();
