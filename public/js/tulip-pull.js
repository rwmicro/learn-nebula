// A tulip that grows above the page when it is pulled past the top.
//
// Only where the browser itself rubber-bands and reports it: Safari on iPhone,
// iPad and Mac gives a negative scrollY while the page is pulled down, and
// paints what lies above the document. The band sits there (absolute, just
// above the page's top edge), built on the first pull; everywhere else the
// script never draws anything and costs one passive scroll listener.
//
// The look is the "Aube" print of the linocut logo: warm paper with ink
// streaks in light, the logo's night sky in dark (colours in global.css,
// .gk-bloom). Two blades, a stem, a bud that colours and opens in three
// petals, the sun (or moon) rising once it has opened.
(function () {
  var MAX = 120; // px of pull for a fully open tulip
  var BAND = 180;
  var NS = "http://www.w3.org/2000/svg";
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var band,
    svg,
    plant,
    sky,
    looping = false,
    done = false,
    last = -1;

  function fx(v) {
    return v.toFixed(1);
  }
  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }
  function almond(x, y, ang, L, W, cls) {
    var c = Math.cos(ang),
      s = Math.sin(ang),
      ex = x + c * L,
      ey = y + s * L;
    var mx = (x + ex) / 2,
      my = (y + ey) / 2,
      nx = -s * W,
      ny = c * W;
    return (
      '<path class="' +
      cls +
      '" d="M' +
      fx(x) +
      " " +
      fx(y) +
      "Q" +
      fx(mx + nx) +
      " " +
      fx(my + ny) +
      " " +
      fx(ex) +
      " " +
      fx(ey) +
      "Q" +
      fx(mx - nx) +
      " " +
      fx(my - ny) +
      " " +
      fx(x) +
      " " +
      fx(y) +
      'Z"/>'
    );
  }
  function stem(x0, y0, x1, y1, bend, w) {
    var d =
      "M" +
      fx(x0) +
      " " +
      fx(y0) +
      "Q" +
      fx((x0 + x1) / 2 + bend) +
      " " +
      fx((y0 + y1) / 2) +
      " " +
      fx(x1) +
      " " +
      fx(y1);
    return (
      '<path class="gk-bloom-edge" stroke-width="' +
      (w + 6) +
      '" d="' +
      d +
      '"/><path class="gk-bloom-stem" stroke-width="' +
      w +
      '" d="' +
      d +
      '"/>'
    );
  }
  function tulip(p) {
    var x = 75,
      y = 170,
      h = 20 + 98 * p,
      top = y - h,
      up = -Math.PI / 2;
    var o =
      almond(x - 2, y, up - 0.42, 30 + 46 * p, 7 + 6 * p, "gk-bloom-leaf") +
      almond(x + 2, y, up + 0.36, 26 + 38 * p, 6 + 6 * p, "gk-bloom-leaf");
    o += stem(x, y, x + 3, top, -8, 6);
    var q = clamp01((p - 0.35) / 0.65),
      L = 18 + 14 * p;
    var cls = q > 0.05 ? "gk-bloom-petal" : "gk-bloom-leaf";
    o +=
      almond(x + 3, top + 4, up - 0.12 - q * 0.6, L, L * 0.36, cls) +
      almond(x + 3, top + 4, up + 0.12 + q * 0.6, L, L * 0.36, cls) +
      almond(x + 3, top + 4, up, L * 1.05, L * 0.38, cls);
    return o;
  }
  function isDark() {
    var t = document.documentElement.getAttribute("data-theme");
    return t
      ? t === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function skyFor(p) {
    var q = clamp01((p - 0.55) / 0.45);
    if (q <= 0) return "";
    var sy = 66 - q * 40,
      o = '<g opacity="' + fx(q) + '">';
    if (isDark())
      return (
        o +
        '<circle class="gk-bloom-sun" cx="136" cy="' +
        fx(sy) +
        '" r="12"/><circle class="gk-bloom-cut" cx="142" cy="' +
        fx(sy - 4) +
        '" r="11"/></g>'
      );
    for (var i = 0; i < 7; i++) {
      var a = -Math.PI * (0.05 + i * 0.15);
      o +=
        '<line class="gk-bloom-ray" x1="' +
        fx(136 + Math.cos(a) * 17) +
        '" y1="' +
        fx(sy + Math.sin(a) * 17) +
        '" x2="' +
        fx(136 + Math.cos(a) * 24) +
        '" y2="' +
        fx(sy + Math.sin(a) * 24) +
        '"/>';
    }
    return (
      o +
      '<circle class="gk-bloom-sun" cx="136" cy="' +
      fx(sy) +
      '" r="12"/></g>'
    );
  }
  function build() {
    band = document.createElement("div");
    band.className = "gk-bloom";
    band.setAttribute("aria-hidden", "true");
    // Ink streaks of the print, seeded so they never move between pulls.
    var seed = 7,
      r = function () {
        return (seed = (seed * 16807) % 2147483647) / 2147483647;
      },
      lines = "";
    for (var i = 0; i < 26; i++) {
      var yy = 8 + r() * 165,
        xx = r() * 400,
        w = 14 + r() * 40;
      lines +=
        '<line x1="' +
        fx(xx) +
        '" y1="' +
        fx(yy) +
        '" x2="' +
        fx(xx + w) +
        '" y2="' +
        fx(yy + (r() - 0.5) * 2) +
        '" stroke-width="' +
        fx(1.4 + r() * 1.6) +
        '"/>';
    }
    band.innerHTML =
      '<svg class="gk-bloom-streaks" viewBox="0 0 400 ' +
      BAND +
      '" preserveAspectRatio="none">' +
      lines +
      "</svg>";
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "gk-bloom-plant");
    svg.setAttribute("viewBox", "0 0 150 170");
    svg.innerHTML = '<g class="gk-bloom-sky"></g><g></g>';
    sky = svg.firstChild;
    plant = svg.lastChild;
    band.appendChild(svg);
    document.body.appendChild(band);
  }
  function draw(pull) {
    var px = Math.round(Math.min(pull, BAND));
    if (px === last) return;
    last = px;
    if (!band) build();
    var p = Math.min(1, px / MAX);
    svg.style.height = Math.max(0, Math.min(px, MAX) * 0.92) + "px";
    plant.innerHTML = tulip(p);
    sky.innerHTML = skyFor(p);
    if (p >= 1 && !done) {
      done = true;
      if (!reduce) {
        svg.classList.remove("gk-bloom-done");
        void svg.getBoundingClientRect();
        svg.classList.add("gk-bloom-done");
      }
    }
    if (p < 0.9) done = false;
  }
  // Scroll events thin out during the bounce on some versions: once a pull
  // starts, follow it frame by frame until the page is back in place.
  function loop() {
    var y = window.scrollY;
    draw(y < 0 ? -y : 0);
    if (y < 0) requestAnimationFrame(loop);
    else looping = false;
  }
  window.addEventListener(
    "scroll",
    function () {
      if (window.scrollY < 0 && !looping) {
        looping = true;
        requestAnimationFrame(loop);
      }
    },
    { passive: true },
  );
})();
