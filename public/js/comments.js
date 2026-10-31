// Comments: fetch existing approved comments on load, post new ones via the
// /api/comments Function. When a Turnstile widget is present and resolves OK,
// the server publishes the comment immediately; otherwise it lands in the
// moderation queue and we show a "pending" notice.
//
// Local dev fallback: under `next dev` the Pages Functions don't run, so the
// fetch fails. When that happens on localhost we render an in-memory fixture
// instead, and submissions are kept in memory only (no network). This is
// strictly a UI-preview affordance; the real flow runs under `wrangler pages dev`.
import { BENCH } from "../../lib/deco-bench";

(function () {
  const section = document.querySelector(".comments");
  if (!section) return;

  const slug = section.dataset.slug;
  const DEV =
    location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const DAY = 86400000;
  const devComments = DEV
    ? [
        {
          id: 1,
          name: "Alice",
          body: "Très belle note — j'aime particulièrement le passage sur la mémoire.",
          created_at: Date.now() - 5 * DAY,
        },
        {
          id: 2,
          name: "",
          body: "Merci pour ce partage. J'avais lu une idée similaire chez Bachelard,\nça résonne ici aussi.",
          created_at: Date.now() - 2 * DAY,
        },
        {
          id: 3,
          name: "Bertrand",
          body: "Petite question : tu as une source pour le chiffre cité au milieu ?",
          created_at: Date.now() - 6 * 3600 * 1000,
        },
      ]
    : null;
  const list = section.querySelector(".comments-list");
  const form = section.querySelector(".comments-form");
  const nameInput = section.querySelector(".comments-name");
  const bodyInput = section.querySelector(".comments-body");
  const submit = section.querySelector(".comments-submit");
  const statusEl = section.querySelector(".comments-status");
  const turnstileEl = section.querySelector(".cf-turnstile");
  // Turnstile's script is Cloudflare's, keeps polling once loaded, and most
  // readers never comment: load it only when the form comes near the screen
  // or gets focus, then render explicitly into the widget's box.
  let turnstileWidget = null;
  if (turnstileEl) {
    let asked = false;
    const loadTurnstile = () => {
      if (asked) return;
      asked = true;
      io && io.disconnect();
      const render = () => {
        if (!window.turnstile || turnstileWidget != null) return;
        const d = turnstileEl.dataset;
        turnstileWidget = window.turnstile.render(turnstileEl, {
          sitekey: d.sitekey,
          theme: d.theme,
          size: d.size,
          action: d.action,
        });
      };
      if (window.turnstile) return render();
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    };
    const io =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => entries.some((e) => e.isIntersecting) && loadTurnstile(),
            { rootMargin: "600px 0px" },
          )
        : null;
    if (io) io.observe(form);
    else loadTurnstile();
    form.addEventListener("focusin", loadTurnstile, { once: true });
    // Phones fold the form away (it never intersects then): opening it counts.
    const fold = section.querySelector(".fold-toggle");
    if (fold) fold.addEventListener("change", loadTurnstile, { once: true });
  }

  function tt(k, vars) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k, vars) : k;
  }

  // Defined before loadComments() runs: the async fn touches esc() synchronously
  // (before its first await), so a later `const` would hit the temporal dead zone.
  const esc = window.__i18n.escapeHtml;

  loadComments();

  async function loadComments() {
    list.innerHTML =
      '<p class="comments-loading">' + esc(tt("comments.loading")) + "</p>";
    try {
      const r = await fetch(
        "/api/comments?slug=" + encodeURIComponent(slug),
        { headers: { accept: "application/json" } },
      );
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      renderList(data.comments || []);
    } catch {
      if (DEV) {
        renderList(devComments);
        return;
      }
      list.innerHTML =
        '<p class="comments-empty">' + esc(tt("comments.loadError")) + "</p>";
    }
  }

  let lastComments = null;
  function renderList(comments) {
    lastComments = comments;
    if (!comments.length) {
      // An empty bench under a tree (lib/deco-bench.ts).
      list.innerHTML =
        '<div class="comments-empty-scene deco">' + BENCH + "</div>" +
        '<p class="comments-empty">' + esc(tt("comments.empty")) + "</p>";
      return;
    }
    list.innerHTML = comments
      .map((c) => {
        const name = esc(c.name || tt("comments.anonymous"));
        const body = esc(c.body).replace(/\n/g, "<br>");
        const date = formatDate(c.created_at);
        // The site owner's replies, written from /admin.
        const isAuthor = !!c.author;
        const badge = isAuthor
          ? ' <span class="comment-badge">' + esc(tt("comments.authorBadge")) + "</span>"
          : "";
        const replyTo = c.reply_to
          ? '<p class="comment-replyto">↳ ' +
            esc(tt("comments.replyTo", { name: c.reply_to_name || tt("comments.anonymous") })) +
            "</p>"
          : "";
        return (
          '<article class="comment' +
          (isAuthor ? " comment--author" : "") +
          '">' +
          replyTo +
          '<header class="comment-head">' +
          '<span class="comment-author">' +
          name +
          badge +
          "</span>" +
          '<time class="comment-date">' +
          date +
          "</time>" +
          "</header>" +
          '<div class="comment-body">' +
          body +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  // Match the rest of the site: format comment dates in the active UI locale
  // (mirrors the BCP-47 map in components/ui/EditionDate.tsx), not a fixed fr-FR.
  const BCP47 = { fr: "fr-FR", en: "en-US", es: "es-ES", zh: "zh-CN" };
  function currentLocale() {
    const g = window.__i18n || {};
    const loc =
      (g.getActiveLocale ? g.getActiveLocale() : g.locale || g.defaultLocale) ||
      "fr";
    return BCP47[loc] || loc;
  }
  function formatDate(ms) {
    try {
      return new Date(ms).toLocaleDateString(currentLocale(), {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return "";
    }
  }

  // Re-localize dates + labels ("anonymous", empty message) when the UI language
  // changes, like the server-rendered dates elsewhere on the page.
  document.addEventListener("i18n:change", () => {
    if (lastComments) renderList(lastComments);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const body = bodyInput.value.trim();
    if (!body) {
      setStatus(tt("comments.emptyMessage"), "error");
      return;
    }
    submit.disabled = true;
    setStatus(tt("comments.sending"), "info");

    let turnstileToken = "";
    if (turnstileWidget != null && window.turnstile) {
      try {
        turnstileToken = window.turnstile.getResponse(turnstileWidget) || "";
      } catch {
        /* widget not ready */
      }
    }

    try {
      const r = await fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, name, body, turnstileToken }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStatus(data.error || tt("comments.networkError"), "error");
        submit.disabled = false;
        return;
      }
      if (data.status === "approved") {
        setStatus(tt("comments.publishedOk"), "success");
        await loadComments();
      } else {
        setStatus(tt("comments.publishedPending"), "success");
      }
      form.reset();
      if (turnstileWidget != null && window.turnstile) {
        try {
          window.turnstile.reset(turnstileWidget);
        } catch {
          /* widget not ready */
        }
      }
    } catch {
      if (DEV) {
        devComments.push({
          id: Date.now(),
          name,
          body,
          created_at: Date.now(),
        });
        setStatus(tt("comments.publishedOk") + " (dev)", "success");
        renderList(devComments);
        form.reset();
        submit.disabled = false;
        return;
      }
      setStatus(tt("comments.networkError"), "error");
    } finally {
      submit.disabled = false;
    }
  });

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.dataset.kind = kind || "";
  }
})();
