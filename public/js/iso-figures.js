// Brings the isometric figures (```iso:<name>``` blocks) to life.
//
// rehypeIsoFigures (lib/markdown.ts) already put each figure's static plate in
// the page, inside <div class="iso iso-mount" data-iso="<name>">, so the
// drawing is there from the first paint. This script does two things, and only
// on a page that has one:
//   - keeps the plate's data-theme (the kit's palette switch) in step with the
//     site's: <html data-theme>, else the OS preference;
//   - imports /figures/<name>.js (written by scripts/build-figures.mjs) and
//     calls its mount(root), which wires the hover, the keys and the readout.
// Same-origin module, so the `script-src 'self'` CSP in lib/site.ts holds.
(function () {
  const mounts = document.querySelectorAll(".iso-mount[data-iso]");
  if (!mounts.length) return;

  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  function theme() {
    const pinned = root.getAttribute("data-theme");
    if (pinned === "light" || pinned === "dark") return pinned;
    return media.matches ? "dark" : "light";
  }
  function sync() {
    const t = theme();
    for (const el of mounts) el.setAttribute("data-theme", t);
  }
  sync();
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  media.addEventListener("change", sync);

  for (const el of mounts) {
    const name = el.getAttribute("data-iso");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name || "")) continue;
    import(/* webpackIgnore: true */ "/figures/" + name + ".js")
      .then((m) => m.mount(el))
      .catch((err) => console.warn("iso-figures: " + name, err));
  }
})();
