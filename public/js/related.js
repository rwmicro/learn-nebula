// "Notes proches": fetches /api/related (server/rag.ts's embedding index) and
// fills in the placeholder lib/html.ts's relatedNotesHtml() renders. That index
// only exists at server runtime (embeddings are computed once the Node server
// starts, not at this static build), so unlike backlinks this can't be baked
// in ahead of time. Silently removes itself on any failure or empty result —
// RAG being unconfigured is a normal, supported state, not an error to surface.
(function () {
  const nav = document.querySelector(".related-notes");
  if (!nav) return;

  const url = nav.dataset.url;
  const esc = window.__i18n.escapeHtml;

  fetch("/api/related?url=" + encodeURIComponent(url), {
    headers: { accept: "application/json" },
  })
    .then((r) => (r.ok ? r.json() : { related: [] }))
    .then((data) => {
      const related = data.related || [];
      if (!related.length) {
        nav.remove();
        return;
      }
      const list = nav.querySelector(".related-notes-list");
      list.innerHTML = related
        .map((h) => `<li><a href="${esc(h.url)}">${esc(h.title)}</a></li>`)
        .join("");
    })
    .catch(() => nav.remove());
})();
