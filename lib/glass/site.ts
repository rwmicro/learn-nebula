// The site's liquid glass: the kit of bilalgursen/liquid-glass (./layer.ts,
// ./engine.ts, ./dom-snapshot.ts, MIT) put on the floating chrome (phone tab
// bar, its search button and mini player, the title pill at the top
// of a phone screen, the note's reading bar and the phone
// note toolbar). One WebGL2 context draws every piece: it paints the page
// behind each one into a texture and bends it at the rim, in every browser
// with WebGL2 (Safari included, where the old SVG lens never drew).
//
// Every piece is the kit's clear glass (GlassLayer: no frost, the rim bending the page, colour split, light and
// shadow), the glass of its GlassButton, with a 20% tint instead of its 60%:
// at 60% the glass read as smoked, black on a dark page. A bar holds still under the finger
// (it holds controls of its own); a button swells when pressed. The kit's
// GlassCard (70% tint, 5 px frost, a radial bend) was tried on the bars: so
// frosted that it read as flat paper next to the search button. Until the
// first frame, and for good without WebGL2, the element keeps the CSS glass
// of phone/base.css `.glass`.

import { attachGlass, type GlassOptions } from "./layer";

/** The looks, by what the glass is. */
export const GLASS_LOOKS = {
  /** A bar or a pill holding controls or a title (tab bar, mini player,
   *  reading bar, phone note toolbar and section pill, the title pill at the
   *  top): clear glass that holds still. */
  bar: { tint: 0.2, swell: false, pull: false },
  /** A round button on its own (search, back): the kit's
   *  GlassButton, clear; it swells when pressed. */
  button: { tint: 0.2, pull: false },
  /** A button with a fill of its own (the green "next note"): GlassButton,
   *  tinted (the glass takes the host's background colour). */
  tinted: { material: "tinted", pull: false },
} satisfies Record<string, GlassOptions>;

export type GlassLook = keyof typeof GLASS_LOOKS;

/** Makes `el` liquid glass with one of the site's looks. Returns the cleanup. */
export function liquidGlass(el: HTMLElement | null | undefined, look: GlassLook): () => void {
  if (!el || typeof window === "undefined") return () => {};
  if (matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more)").matches) return () => {};
  return attachGlass(el, GLASS_LOOKS[look]);
}
