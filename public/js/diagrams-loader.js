// Loads the diagram scripts only on a note that has a diagram — four notes in
// five have none. Both are their own bundles (scripts/bundle-js.mjs):
// - diagram-zoom: "Agrandir", the full-screen view of a build-time diagram;
// - mermaid-render: the in-browser fallback for a ```mermaid block the build
//   could not pre-render (it then also fetches /js/mermaid.min.js).
(function () {
  function load(name) {
    const s = document.createElement("script");
    s.src = "/js/" + name + ".bundle.js";
    document.head.appendChild(s);
  }
  if (document.querySelector("main pre.mermaid")) load("mermaid-render");
  if (document.querySelector("main figure.mermaid-diagram")) load("diagram-zoom");
})();
