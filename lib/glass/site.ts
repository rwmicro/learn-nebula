// The site's liquid glass: the kit of bilalgursen/liquid-glass (./layer.ts,
// ./engine.ts, ./dom-snapshot.ts, MIT) put on the floating chrome (phone tab
// bar, its search button and mini player, the note's reading bar and the
// phone note toolbar). One WebGL2 context draws every piece: it paints the
// page behind each one into a texture and bends it at the rim, in every
// browser with WebGL2 (Safari included, where the old SVG lens never drew).
//
// Until the first frame, and for good without WebGL2, the element keeps the
// CSS glass of phone/base.css `.glass`. Nothing is attached when the reader
// asks for less transparency or more contrast (the glass is paper then).

import { attachGlass, type GlassOptions } from "./layer";

/** The looks, by what the glass is. Clear glass throughout (it bends the
 *  page); the tint is white on a light page and black on a dark one. */
export const GLASS_LOOKS = {
  /** A bar holding controls (the tab bar, the phone note toolbar): still under
   *  the finger, as clear as its labels allow over the page. */
  bar: {
    tint: 0.55,
    blur: 3,
    swell: false,
    pull: false,
    optics: { borderColor: "#ffffff", borderAlpha: 0.55, borderWidth: 1, saturation: 1.2, dark: { borderAlpha: 0.16 } },
  },
  /** Over running text (the reading bar, the phone note toolbar and its
   *  section pill): more frost, or the lines behind would fight the labels.
   *  The CSS scroll edge under those bars (a mask and a backdrop blur) is not
   *  in the picture the glass bends, so the glass does that frost itself. */
  dock: {
    tint: 0.62,
    blur: 5,
    swell: false,
    pull: false,
    optics: { borderColor: "#ffffff", borderAlpha: 0.6, borderWidth: 1, saturation: 1.15, dark: { borderAlpha: 0.16 } },
  },
  /** A round button on its own (search, back, next): it swells when pressed. */
  button: {
    tint: 0.5,
    blur: 3,
    swell: true,
    pull: false,
    optics: { borderColor: "#ffffff", borderAlpha: 0.55, borderWidth: 1, saturation: 1.2, dark: { borderAlpha: 0.16 } },
  },
  /** A button with a fill of its own (the green "next note"): the glass takes
   *  that colour, with its light and shadow, and swells when pressed. */
  tinted: {
    material: "tinted",
    swell: true,
    pull: false,
  },
} satisfies Record<string, GlassOptions>;

export type GlassLook = keyof typeof GLASS_LOOKS;

/** Makes `el` liquid glass with one of the site's looks. Returns the cleanup. */
export function liquidGlass(el: HTMLElement | null | undefined, look: GlassLook): () => void {
  if (!el || typeof window === "undefined") return () => {};
  if (matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more)").matches) return () => {};
  return attachGlass(el, GLASS_LOOKS[look]);
}
