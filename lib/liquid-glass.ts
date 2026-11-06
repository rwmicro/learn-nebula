// Liquid glass refraction: the rim of a glass shape bends what is behind it,
// like the thick edge of a lens (iOS 26). An SVG filter does the bending —
// feDisplacementMap driven by a map drawn for the shape's size and radius —
// and is applied with `backdrop-filter: url(#…)`.
//
// The rim also catches light: a specular image drawn from the same bezel
// (brighter where it is steep and faces the light), shown by CSS in every
// browser, Safari included, as a plain background image. The light follows
// the phone's tilt or the mouse: one image per 10° of direction, drawn once
// and swapped, so moving it costs a background change, not a filter.
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

/** Where a point sits against a rounded rectangle's rim: its distance in
 *  from the rim and the rim's outward normal there. `px`, `py` are measured
 *  from the centre and positive (the top left quarter, mirrored). */
function rim(px: number, py: number, hx: number, hy: number, rad: number): [number, number, number] {
  const qx = px - (hx - rad);
  const qy = py - (hy - rad);
  if (qx > 0 && qy > 0) {
    const l = Math.hypot(qx, qy) || 1;
    return [rad - l, qx / l, qy / l];
  }
  return qx > qy ? [hx - px, 1, 0] : [hy - py, 0, 1];
}

/** The glass's height across its bezel, t from 0 (rim) to 1 (where it turns
 *  flat): a squircle, (1 - (1 - t)^4)^(1/4), the profile Apple's glass shows
 *  (steep at the very edge, then flat fast, so the middle stays clear). */
const squircle = (t: number) => Math.pow(1 - Math.pow(1 - t, 4), 0.25);

/** Refraction across the bezel, sampled at LUT_N steps of t: a ray falling
 *  straight down meets the curved top surface and bends (Snell, glass
 *  n = 1.5), and reaches the backdrop shifted by the glass's thickness there
 *  times the tangent of its deviation. Normalised to 1 at its peak, which a
 *  squircle puts just inside the rim; it fades to nothing well before the
 *  middle. Also the slope's sine, which lights the specular rim. */
const LUT_N = 256;
const IOR = 1.5;
/** The bezel's height over its width: a thick, rounded edge (a pebble more
 *  than a pane), so the bending spreads over the band instead of only its
 *  outer pixels. */
const RISE = 2;
/** Thickness of the flat slab under the bezel, relative to the bezel's own
 *  height: some bending is left at the very rim, as on a real edge. */
const SLAB = 0.3;
const [BEND, TILT] = (() => {
  const bend = new Float32Array(LUT_N + 1);
  const tilt = new Float32Array(LUT_N + 1);
  const e = 1e-3;
  let peak = 0;
  for (let i = 0; i <= LUT_N; i++) {
    const t = i / LUT_N;
    const a = Math.max(0, t - e);
    const b = Math.min(1, t + e);
    const slope = (RISE * (squircle(b) - squircle(a))) / (b - a);
    const t1 = Math.atan(slope);
    const t2 = Math.asin(Math.sin(t1) / IOR);
    bend[i] = (squircle(t) + SLAB) * Math.tan(t1 - t2);
    tilt[i] = Math.sin(t1);
    peak = Math.max(peak, bend[i]);
  }
  for (let i = 0; i <= LUT_N; i++) bend[i] /= peak;
  return [bend, tilt];
})();
const lut = (table: Float32Array, t: number) => table[Math.round(Math.max(0, Math.min(1, t)) * LUT_N)];

/** Displacement map for a rounded rectangle, RGBA. Red shifts along x, green
 *  along y, 128 is no shift: inside a band `edge` px wide along the rim the
 *  map points inward (the edge samples what lies further in, as a convex
 *  lens does), by the refraction of a squircle bezel (BEND). */
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
      const [dist, nx, ny] = rim(hx - (x + 0.5), hy - (y + 0.5), hx, hy, rad);
      const m = dist >= band ? 0 : lut(BEND, dist / band) * 127;
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

/** The light the glass catches, RGBA (white, its strength in alpha), for a
 *  rounded rectangle drawn at `scale` device pixels per CSS px. Where the
 *  bezel is steep and faces the light (from the top left, `light` radians
 *  from +x, y down) it shines; the side facing away catches a weaker
 *  reflection, as on iOS 26. On top: a hairline along the rim, lit the same
 *  way, which is what reads as the glass's edge. */
export function specularMap(
  w: number,
  h: number,
  r: number,
  edge: number,
  scale = 1,
  light = (-3 * Math.PI) / 4,
): Uint8ClampedArray {
  const W = Math.max(1, Math.round(w * scale));
  const H = Math.max(1, Math.round(h * scale));
  const out = new Uint8ClampedArray(W * H * 4);
  const hx = w / 2;
  const hy = h / 2;
  const rad = Math.max(0, Math.min(r, hx, hy));
  const band = Math.max(1, edge);
  const lx = Math.cos(light);
  const ly = Math.sin(light);
  // Half a device pixel in from the rim: the hairline stays one pixel wide
  // at any density.
  const hair = 0.6 / scale;
  const fade = 0.7 / scale;
  // Past 60% of the bezel the sheen (TILT^4) is under 1%: nothing to draw,
  // which leaves most of a bar's pixels at a single comparison.
  const reach = band * 0.6;
  const shine = (d: number) => (d > 0 ? d * Math.sqrt(d) : -0.4 * d * Math.sqrt(-d));
  for (let y = 0; y < H; y++) {
    const cy = (y + 0.5) / scale - hy;
    for (let x = 0; x < W; x++) {
      const cx = (x + 0.5) / scale - hx;
      const [dist, ax, ay] = rim(Math.abs(cx), Math.abs(cy), hx, hy, rad);
      if (dist >= reach) continue;
      const facing = shine((cx < 0 ? -ax : ax) * lx + (cy < 0 ? -ay : ay) * ly);
      const tl = lut(TILT, dist / band);
      const sheen = tl * tl * tl * tl * facing;
      const line = dist < hair + 6 * fade ? Math.exp(-Math.max(0, dist - hair) / fade) * (0.35 + 0.65 * facing) : 0;
      const a = Math.min(1, 0.8 * sheen + line);
      const i = (y * W + x) * 4;
      out[i] = out[i + 1] = out[i + 2] = 255;
      out[i + 3] = Math.round(a * 255);
    }
  }
  return out;
}

/** Where the light comes from when nothing moves it: the top left. */
export const LIGHT_REST = (-3 * Math.PI) / 4;
/** The light's direction is drawn in this many steps around the circle
 *  (10° each): every step is one specular image, drawn the first time it is
 *  needed and kept, so a light that wanders back and forth costs nothing
 *  after its first pass. */
export const LIGHT_STEPS = 36;

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

/** The light's direction for a phone tilted `dGamma` degrees to the right
 *  and `dBeta` degrees towards the reader from how it was being held: the
 *  room's light stays put, so on the screen it slides the other way, as the
 *  highlights of iOS 26 do. 30° of tilt moves it by a whole unit. */
export function tiltLight(dGamma: number, dBeta: number): number {
  return Math.atan2(Math.sin(LIGHT_REST) - clamp1(dBeta / 30), Math.cos(LIGHT_REST) - clamp1(dGamma / 30));
}

/** The light's direction for a pointer `dx`, `dy` px from the glass's
 *  centre: it shines from the pointer's side, still leaning towards the top
 *  left, so the rim facing the pointer lights up. */
export function pointerLight(dx: number, dy: number): number {
  const l = Math.hypot(dx, dy);
  if (l < 1) return LIGHT_REST;
  return Math.atan2(0.6 * Math.sin(LIGHT_REST) + dy / l, 0.6 * Math.cos(LIGHT_REST) + dx / l);
}

/** The step (0 … LIGHT_STEPS - 1) nearest to a direction, and back. */
export const lightStep = (angle: number) => {
  const turn = (((angle / (2 * Math.PI)) % 1) + 1) % 1;
  return Math.round(turn * LIGHT_STEPS) % LIGHT_STEPS;
};
export const stepAngle = (step: number) => (step * 2 * Math.PI) / LIGHT_STEPS;

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

// One source of light for every glass on the page: the device's tilt
// (phones, wherever orientation events arrive without asking: Android; iOS
// only sends them once a page was granted motion access) or the mouse.
// Nothing when the reader asks for reduced motion.
type Light = { tilt: number } | { x: number; y: number };
let light: Light | null = null;
const watchers = new Set<() => void>();
let stopLight: (() => void) | null = null;

function startLight() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  let frame = 0;
  const publish = (next: Light) => {
    light = next;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      watchers.forEach((f) => f());
    });
  };
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType === "mouse" || e.pointerType === "pen") publish({ x: e.clientX, y: e.clientY });
  };
  // The phone's posture drifts (one reads lying down, then sitting): the
  // rest position follows it slowly, so only a tilt reads as one.
  let base: [number, number] | null = null;
  const onTilt = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    base = base ? [base[0] + (e.gamma - base[0]) * 0.02, base[1] + (e.beta - base[1]) * 0.02] : [e.gamma, e.beta];
    publish({ tilt: tiltLight(e.gamma - base[0], e.beta - base[1]) });
  };
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("deviceorientation", onTilt, { passive: true });
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", onPointer);
    window.removeEventListener("deviceorientation", onTilt);
  };
}

function watchLight(f: () => void): () => void {
  watchers.add(f);
  stopLight ??= startLight();
  return () => {
    watchers.delete(f);
    if (!watchers.size && stopLight) {
      stopLight();
      stopLight = null;
      light = null;
    }
  };
}

function pngUrl(w: number, h: number, data: Uint8ClampedArray): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return "";
  const img = g.createImageData(w, h);
  img.data.set(data);
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

export interface LensOptions {
  /** Largest shift at the rim, px. */
  depth?: number;
  /** Width of the bezel along the rim, px (default: half the height,
   *  between 12 and 32). */
  edge?: number;
  /** Background blur under the glass, px. */
  blur?: number;
  /** Colour fringe at the rim (red and blue bent a little apart), 0–0.2. */
  chroma?: number;
  saturate?: number;
  /** The rim's light follows the device's tilt or the mouse (default). */
  follow?: boolean;
}

/** Gives `el` the light its rim catches (every browser: an image the CSS
 *  `::after` of `.glass.has-spec` shows, swapped as the light moves) and,
 *  on Chromium, a rim that bends what is behind it. Neither when the reader asks for less
 *  transparency. Both follow the element's size. Returns the cleanup. */
export function attachLens(el: HTMLElement, opts: LensOptions = {}): () => void {
  if (typeof ResizeObserver === "undefined" || matchMedia("(prefers-reduced-transparency: reduce)").matches) {
    return () => {};
  }
  const refract = backdropRefraction();
  const { depth = 22, blur = 3, chroma = 0, saturate = 1.8 } = opts;
  const id = `gk-lens-${++seq}`;
  const filter = refract ? document.createElementNS(NS, "filter") : null;
  if (filter) {
    filter.id = id;
    filter.setAttribute("filterUnits", "userSpaceOnUse");
    filter.setAttribute("color-interpolation-filters", "sRGB");
    defs().append(filter);
  }

  let size = "";
  // The specular images drawn for this size, one per light step (stepAngle).
  let geom: { w: number; h: number; r: number; edge: number; dpr: number } | null = null;
  let specs = new Map<number, string>();
  let shown = -1;
  let want = lightStep(LIGHT_REST);
  const showSpec = () => {
    if (!geom) return;
    let url = specs.get(want);
    if (!url) {
      const { w, h, r, edge, dpr } = geom;
      url = `url("${pngUrl(Math.round(w * dpr), Math.round(h * dpr), specularMap(w, h, r, edge, dpr, stepAngle(want)))}")`;
      specs.set(want, url);
    }
    if (want === shown) return;
    shown = want;
    el.style.setProperty("--glass-spec", url);
  };
  const aim = () => {
    let angle = LIGHT_REST;
    if (light && "tilt" in light) angle = light.tilt;
    else if (light) {
      const b = el.getBoundingClientRect();
      angle = pointerLight(light.x - (b.left + b.width / 2), light.y - (b.top + b.height / 2));
    }
    want = lightStep(angle);
    if (want !== shown) showSpec();
  };
  const unwatch = opts.follow === false ? () => {} : watchLight(aim);

  const draw = () => {
    const w = Math.round(el.offsetWidth);
    const h = Math.round(el.offsetHeight);
    // Two device pixels per CSS px are enough for a hairline; a third would
    // only make the image 2.25 times larger to draw and decode.
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    if (!w || !h || `${w}x${h}@${dpr}` === size) return;
    size = `${w}x${h}@${dpr}`;
    const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    const edge = opts.edge ?? Math.min(32, Math.max(12, h * 0.5));
    geom = { w, h, r, edge, dpr };
    specs = new Map();
    shown = -1;
    showSpec();
    el.classList.add("has-spec");
    if (!filter) return;
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
      `<feImage href="${pngUrl(w, h, lensMap(w, h, r, edge))}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>` +
      `<feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="soft"/>` +
      bend +
      `<feColorMatrix in="bent" type="saturate" values="${saturate}"/>`;
    el.style.setProperty("backdrop-filter", `url(#${id})`);
    el.style.setProperty("-webkit-backdrop-filter", `url(#${id})`);
    el.classList.add("has-lens");
  };

  // While a size animates (the tab bar shrinking as the reader scrolls
  // down), the maps already drawn are only stretched to the new size: the
  // filter region and the image's box, two attributes (the specular image
  // stretches by itself, it is a 100% 100% background). Drawing new ones
  // (canvas, PNG data URL, decode) costs a few ms on a phone, per frame for
  // the length of the animation: frames dropped exactly while the bar
  // moves. They are redrawn once the size has held still for SETTLE_MS.
  const SETTLE_MS = 160;
  let frame = 0;
  let settle = 0;
  const stretch = () => {
    if (!filter) return;
    const w = Math.round(el.offsetWidth);
    const h = Math.round(el.offsetHeight);
    const img = filter.firstElementChild;
    if (!w || !h || !size || !img) return draw();
    for (const [k, v] of [["width", w], ["height", h]] as const) {
      filter.setAttribute(k, String(v));
      img.setAttribute(k, String(v));
    }
  };
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(stretch);
    clearTimeout(settle);
    settle = window.setTimeout(draw, SETTLE_MS);
  });
  ro.observe(el);
  draw();
  return () => {
    unwatch();
    ro.disconnect();
    cancelAnimationFrame(frame);
    clearTimeout(settle);
    filter?.remove();
    el.style.removeProperty("backdrop-filter");
    el.style.removeProperty("-webkit-backdrop-filter");
    el.style.removeProperty("--glass-spec");
    el.classList.remove("has-lens", "has-spec");
  };
}
