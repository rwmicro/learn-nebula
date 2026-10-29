// Liquid glass refraction: the rim of a glass shape bends what is behind it,
// like the thick edge of a lens (iOS 26). An SVG filter does the bending —
// feDisplacementMap driven by a map drawn for the shape's size and radius —
// and is applied with `backdrop-filter: url(#…)`.
//
// Only Chromium renders an SVG filter in backdrop-filter. Safari and Firefox
// accept the syntax and draw nothing (so `@supports` answers yes), hence the
// engine check. Everywhere else the CSS glass (app.css `.glass`: blur,
// saturation, rim light) stays as it is, and it is also what Chromium shows
// until the filter is attached.
//
// Chromium offsets a backdrop-filter url() by the element's visual overflow
// (its outer box-shadow, a scaled child…): glass with a lens keeps its drop
// shadow on a separate element (MobileTabBar's .tabbar-shadow).

/** Displacement map for a rounded rectangle, RGBA. Red shifts along x, green
 *  along y, 128 is no shift: inside a band `edge` px wide along the rim the
 *  map points inward (the edge samples what lies further in, as a convex
 *  lens does), easing to nothing towards the middle. */
export function lensMap(w: number, h: number, r: number, edge: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  const hx = w / 2;
  const hy = h / 2;
  const rad = Math.max(0, Math.min(r, hx, hy));
  const band = Math.max(1, edge);
  // A quarter is enough: the shape is symmetric, so each pixel of the top
  // left quarter is written to its four mirror images (x and y flipped).
  const qw = Math.ceil(w / 2);
  const qh = Math.ceil(h / 2);
  for (let y = 0; y < qh; y++) {
    for (let x = 0; x < qw; x++) {
      // Distance from the centre, as a positive quarter (then mirrored).
      const px = hx - (x + 0.5);
      const py = hy - (y + 0.5);
      const qx = px - (hx - rad);
      const qy = py - (hy - rad);
      let dist: number;
      let nx: number;
      let ny: number;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy) || 1;
        dist = rad - l;
        nx = qx / l;
        ny = qy / l;
      } else if (qx > qy) {
        dist = hx - px;
        nx = 1;
        ny = 0;
      } else {
        dist = hy - py;
        nx = 0;
        ny = 1;
      }
      const t = Math.max(0, Math.min(1, 1 - dist / band));
      const m = t * t * 127;
      // Top left: the outward normal points left and up (negative), so the
      // inward shift is positive.
      const dx = Math.round(nx * m);
      const dy = Math.round(ny * m);
      for (const [mx, sx] of [[x, 1], [w - 1 - x, -1]] as const) {
        for (const [my, sy] of [[y, 1], [h - 1 - y, -1]] as const) {
          const i = (my * w + mx) * 4;
          out[i] = 128 + sx * dx;
          out[i + 1] = 128 + sy * dy;
          out[i + 2] = 128;
          out[i + 3] = 255;
        }
      }
    }
  }
  return out;
}

/** True where `backdrop-filter: url(#svg)` actually renders: Chromium
 *  (Chrome, Edge, Samsung Internet, Opera…), not on iOS where every browser
 *  is WebKit. */
export function backdropRefraction(nav: Navigator | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  if (!nav) return false;
  const brands = (nav as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  if (brands?.length) return brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand));
  const ua = nav.userAgent || "";
  return /\bChrome\/\d/.test(ua) && !/\b(CriOS|FxiOS|EdgiOS|Firefox)\//.test(ua);
}

// --- browser glue ------------------------------------------------------------

const NS = "http://www.w3.org/2000/svg";
let holder: SVGSVGElement | null = null;
let seq = 0;

function defs(): SVGSVGElement {
  if (holder?.isConnected) return holder;
  holder = document.createElementNS(NS, "svg");
  holder.setAttribute("aria-hidden", "true");
  holder.setAttribute("width", "0");
  holder.setAttribute("height", "0");
  holder.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  document.body.append(holder);
  return holder;
}

function mapUrl(w: number, h: number, r: number, edge: number): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return "";
  const img = g.createImageData(w, h);
  img.data.set(lensMap(w, h, r, edge));
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

export interface LensOptions {
  /** Largest shift at the rim, px. */
  depth?: number;
  /** Width of the bending band along the rim, px (default: a third of the
   *  height, at most 24). */
  edge?: number;
  /** Background blur under the glass, px. */
  blur?: number;
  /** Colour fringe at the rim (red and blue bent a little apart), 0–0.2. */
  chroma?: number;
  saturate?: number;
}

/** Gives `el` a refracting rim (Chromium only, and not when the reader asks
 *  for less transparency); the map follows the element's size. Returns the
 *  cleanup. */
export function attachLens(el: HTMLElement, opts: LensOptions = {}): () => void {
  if (!backdropRefraction() || matchMedia("(prefers-reduced-transparency: reduce)").matches) {
    return () => {};
  }
  const { depth = 22, blur = 3, chroma = 0, saturate = 1.8 } = opts;
  const id = `gk-lens-${++seq}`;
  const filter = document.createElementNS(NS, "filter");
  filter.id = id;
  filter.setAttribute("filterUnits", "userSpaceOnUse");
  filter.setAttribute("color-interpolation-filters", "sRGB");
  defs().append(filter);

  let size = "";
  const draw = () => {
    const w = Math.round(el.offsetWidth);
    const h = Math.round(el.offsetHeight);
    if (!w || !h || `${w}x${h}` === size) return;
    size = `${w}x${h}`;
    const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    const edge = opts.edge ?? Math.min(24, Math.max(8, h / 3));
    for (const [k, v] of [["x", 0], ["y", 0], ["width", w], ["height", h]] as const) filter.setAttribute(k, String(v));
    // Each channel bent by its own amount gives the colour fringe; without
    // chroma one displacement does.
    const pass = (scale: number, keep: string, out: string) =>
      `<feDisplacementMap in="soft" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="${out}d"/>` +
      `<feColorMatrix in="${out}d" type="matrix" values="${keep} 0 0 0 1 0" result="${out}"/>`;
    const bend = chroma
      ? pass(depth * (1 + chroma), "1 0 0 0 0 0 0 0 0 0 0 0 0 0 0", "r") +
        pass(depth, "0 0 0 0 0 0 1 0 0 0 0 0 0 0 0", "g") +
        pass(depth * (1 - chroma), "0 0 0 0 0 0 0 0 0 0 0 0 1 0 0", "b") +
        `<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen" result="bent"/>`
      : `<feDisplacementMap in="soft" in2="map" scale="${depth}" xChannelSelector="R" yChannelSelector="G" result="bent"/>`;
    filter.innerHTML =
      `<feImage href="${mapUrl(w, h, r, edge)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>` +
      `<feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="soft"/>` +
      bend +
      `<feColorMatrix in="bent" type="saturate" values="${saturate}"/>`;
    el.style.setProperty("backdrop-filter", `url(#${id})`);
    el.style.setProperty("-webkit-backdrop-filter", `url(#${id})`);
    el.classList.add("has-lens");
  };

  // While a size animates the map is redrawn once per frame at most.
  let frame = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  });
  ro.observe(el);
  draw();
  return () => {
    ro.disconnect();
    cancelAnimationFrame(frame);
    filter.remove();
    el.style.removeProperty("backdrop-filter");
    el.style.removeProperty("-webkit-backdrop-filter");
    el.classList.remove("has-lens");
  };
}
