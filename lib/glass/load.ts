// The loader of the site's liquid glass. The kit's engine (./engine.ts, the
// shader and the DOM painter) is a bundle of its own,
// /js/liquid-glass.bundle.js (public/js/liquid-glass.js → ./site.ts),
// fetched once by whichever piece of chrome asks first: the phone tab bar
// (React), the note's reading bar or its phone toolbar (the note bundle). So
// neither the Next chunks nor note.bundle.js carry it, and a browser without
// WebGL2, or a reader who asked for less transparency, never downloads it.

import type { GlassLook } from "./site";

type GlassApi = { liquidGlass: (el: HTMLElement, look: GlassLook) => () => void };
declare global {
  interface Window {
    __gkGlass?: GlassApi;
  }
}

const noop = () => {};
let loading: Promise<GlassApi | null> | null = null;

function load(): Promise<GlassApi | null> {
  loading ??= new Promise((resolve) => {
    if (window.__gkGlass) return resolve(window.__gkGlass);
    const s = document.createElement("script");
    s.src = "/js/liquid-glass.bundle.js";
    s.async = true;
    s.onload = () => resolve(window.__gkGlass ?? null);
    s.onerror = () => {
      loading = null;
      s.remove();
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** A WebGL2 drawn by the CPU (SwiftShader, llvmpipe, Microsoft's Basic
 *  Render Driver: a machine without a usable GPU, CI runners and headless
 *  browsers too). There every glass frame and its copy cost the main thread
 *  tens of ms, so the CSS glass stays. Asked once per tab. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|basic render|software/i;
function softwareGl(): boolean {
  try {
    const known = sessionStorage.getItem("gk-gl-soft");
    if (known) return known === "1";
  } catch {
    // No storage: ask the GPU every time.
  }
  let soft = true;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (gl) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "");
      soft = SOFTWARE.test(name);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    soft = true;
  }
  try {
    sessionStorage.setItem("gk-gl-soft", soft ? "1" : "0");
  } catch {
    // Not remembered.
  }
  return soft;
}

/** Whether this browser gets the drawn glass at all: WebGL2 on a GPU, and a
 *  reader who did not ask for less transparency or more contrast (the glass
 *  is paper then, phone/base.css). localStorage `gk-glass` = "on" draws it
 *  even on a software renderer (screenshots), "off" never. */
export function glassWanted(): boolean {
  if (typeof window === "undefined" || typeof WebGL2RenderingContext === "undefined") return false;
  if (matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more)").matches) return false;
  let pref: string | null = null;
  try {
    pref = localStorage.getItem("gk-glass");
  } catch {
    // No storage: the default.
  }
  if (pref === "off") return false;
  return pref === "on" || !softwareGl();
}

/** Makes `el` liquid glass with one of the site's looks (./site.ts) once the
 *  engine is here; the CSS glass shows until then. The cleanup works at any
 *  time, before the engine arrived too. */
export function liquidGlassLater(el: HTMLElement | null | undefined, look: GlassLook): () => void {
  if (!el || !glassWanted()) return noop;
  let off: (() => void) | null = null;
  let gone = false;
  load().then((api) => {
    if (!gone && api && el.isConnected) off = api.liquidGlass(el, look);
  });
  return () => {
    gone = true;
    off?.();
    off = null;
  };
}
