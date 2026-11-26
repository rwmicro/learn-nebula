// The site's liquid glass: the kit of bilalgursen/liquid-glass (./layer.ts,
// ./engine.ts, ./dom-snapshot.ts, MIT) put on the floating chrome (phone tab
// bar, its search button and mini player, the title pill at the top
// of a phone screen, the note's reading bar and the phone
// note toolbar). One WebGL2 context draws every piece: it paints the page
// behind each one into a texture and bends it at the rim, in every browser
// with WebGL2 (Safari included, where the old SVG lens never drew).
//
// Every piece is the kit's glass (GlassLayer: the rim bending the page,
// colour split, light and shadow) frosted like iOS: what it covers is
// blurred (6 px) under a 40% tint. Clear glass (no blur, 20% tint) was tried:
// over a note the lines behind mixed with the labels, and elsewhere the
// colourful cards under the tab bar bled through as pink, cyan and purple
// blobs. The rim mirrors nothing of the page either (`mirror: 0`), so it
// stays white or dark instead of taking a card's colour. A bar holds still
// under the finger (it holds controls of its own); a button swells when
// pressed. The kit's GlassCard (70% tint, 5 px frost, a radial bend) read as
// flat paper. Until the first frame, and for good without WebGL2, the
// element keeps the CSS glass of phone/base.css `.glass`.

import { attachGlass, type GlassOptions } from "./layer";

/** The looks, by what the glass is. */
export const GLASS_LOOKS = {
  /** A bar or a pill (tab bar, mini player, the note's reading bar, the
   *  phone note toolbar and section pill, the title pill at the top):
   *  frosted glass that holds still. */
  bar: { tint: 0.4, blur: 6, swell: false, pull: false, optics: { mirror: 0 } },
  /** A round button on its own (search, the phone note's buttons): the same
   *  glass; it swells when pressed. */
  button: { tint: 0.4, blur: 6, pull: false, optics: { mirror: 0 } },
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
