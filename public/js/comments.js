// Comments: fetch existing approved comments on load, post new ones via the
// /api/comments Function. When a Turnstile widget is present and resolves OK,
// the server publishes the comment immediately; otherwise it lands in the
// moderation queue and we show a "pending" notice.
//
// Local dev fallback: under `next dev` the Pages Functions don't run, so the
// fetch fails. When that happens on localhost we render an in-memory fixture
// instead, and submissions are kept in memory only (no network). This is
// strictly a UI-preview affordance; the real flow runs under `wrangler pages dev`.
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

  function renderList(comments) {
    if (!comments.length) {
      list.innerHTML =
        '<p class="comments-empty">' + esc(tt("comments.empty")) + "</p>";
      return;
    }
    list.innerHTML = comments
      .map((c) => {
        const name = esc(c.name || tt("comments.anonymous"));
        const body = esc(c.body).replace(/\n/g, "<br>");
        const date = formatDate(c.created_at);
        return (
          '<article class="comment">' +
          '<header class="comment-head">' +
          '<span class="comment-author">' +
          name +
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

  function formatDate(ms) {
    try {
      return new Date(ms).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return "";
    }
  }

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
    if (turnstileEl && window.turnstile) {
      try {
        turnstileToken = window.turnstile.getResponse(turnstileEl) || "";
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
      if (turnstileEl && window.turnstile) {
        try {
          window.turnstile.reset(turnstileEl);
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
