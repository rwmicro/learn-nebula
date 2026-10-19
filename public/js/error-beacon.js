// Tells the owner when a page breaks for a reader: uncaught exceptions and
// unhandled promise rejections go to POST /api/client-error (lib/feedback.ts,
// listed in /admin → Site). At most five per page view, each distinct message
// once; nothing about the reader is sent beyond the page path. Errors from
// browser extensions are dropped server-side.
(function () {
  const seen = new Set();
  let sent = 0;
  function send(message, source, line, stack) {
    if (sent >= 5 || !message) return;
    const key = message + "|" + source + ":" + line;
    if (seen.has(key)) return;
    seen.add(key);
    sent++;
    const body = JSON.stringify({
      message: String(message).slice(0, 300),
      source: String(source || "").slice(0, 300),
      line: line || 0,
      stack: String(stack || "").slice(0, 2000),
      path: location.pathname,
    });
    try {
      fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        credentials: "same-origin",
      }).catch(function () {});
    } catch {
      /* no backend (next dev) or offline: nothing to do */
    }
  }
  window.addEventListener("error", function (e) {
    // Resource load failures (an <img> 404) bubble here too, without a message.
    if (!e.message) return;
    send(e.message, e.filename, e.lineno, e.error && e.error.stack);
  });
  window.addEventListener("unhandledrejection", function (e) {
    const r = e.reason;
    const message = r && r.message ? r.message : String(r);
    send("Unhandled rejection: " + message, "", 0, r && r.stack);
  });
  // React error boundaries (app/error.tsx) report what they catch here.
  window.__gkReportError = function (err) {
    send(err && err.message ? err.message : String(err), "react", 0, err && err.stack);
  };
})();
