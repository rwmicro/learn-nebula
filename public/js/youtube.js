// Click-to-load YouTube facade (#16). lib/markdown.ts renders a
// `.yt-embed[data-yt-id]` with the video thumbnail + a play button; only when
// the reader clicks do we swap in a youtube-nocookie iframe (no Google frame or
// cookie loads up front). Progressive enhancement: with JS off, the facade's
// `.yt-embed-link` still opens the video on YouTube.
(function () {
  function activate(embed) {
    var id = embed.getAttribute("data-yt-id");
    if (!id || embed.dataset.loaded === "true") return;
    embed.dataset.loaded = "true";
    var iframe = document.createElement("iframe");
    iframe.className = "yt-embed-frame";
    iframe.src =
      "https://www.youtube-nocookie.com/embed/" +
      encodeURIComponent(id) +
      "?autoplay=1&rel=0";
    iframe.title = "YouTube";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    var btn = embed.querySelector(".yt-embed-btn");
    if (btn) btn.replaceWith(iframe);
    else embed.appendChild(iframe);
    var focusable = iframe;
    requestAnimationFrame(function () {
      try {
        focusable.focus();
      } catch (e) {
        /* ignore */
      }
    });
  }

  function onClick(e) {
    var btn = e.target.closest(".yt-embed-btn");
    if (!btn) return;
    var embed = btn.closest(".yt-embed");
    if (embed) activate(embed);
  }

  document.addEventListener("click", onClick);
})();
