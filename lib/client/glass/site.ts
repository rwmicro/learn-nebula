// The site's liquid glass: the kit of bilalgursen/liquid-glass (./layer.ts,
// ./engine.ts, ./dom-snapshot.ts, MIT) put on the floating chrome (phone tab
// bar, its search button and mini player, the title pill at the top
// of a phone screen, the note's reading bar and the phone
// note toolbar). One WebGL2 context draws every piece: it paints the page
// behind each one into a texture and bends it at the rim, in every browser
// with WebGL2 (Safari included, where the old SVG lens never drew).
//
// Every piece is the kit's clear glass (GlassLayer: the rim bending the page,
// colour split, light and shadow), as natural as it stays legible: a 15% tint
// (30% for the black tint of dark glass, or white labels wash out over a pale
// card) and a light 1.5 px softening of what it covers, so the page shows
// through, colours included, while the lines of text behind no longer read
// as sharp as the labels. The frosted look (6 px, 40%) read as grey plastic,
// and fully clear glass (no blur) let the text behind fight the labels. The
// rim mirrors half of what lies around it (`mirror: 0.5`): a hint of a card's
// colour, not a blob. A bar holds still under the finger (it holds controls
// of its own); a button swells when pressed. The kit's GlassCard (70% tint,
// 5 px frost, a radial bend) read as flat paper. Until the first frame, and
// for good without WebGL2, the element keeps the CSS glass of
// phone/base.css `.glass`.

import { attachGlass, type GlassOptions } from "./layer";

/** The looks, by what the glass is. */
export const GLASS_LOOKS = {
  /** A bar or a pill (tab bar, mini player, the note's reading bar, the
   *  phone note toolbar and section pill, the title pill at the top):
   *  clear glass that holds still. */
  bar: { tint: 0.15, blur: 1.5, swell: false, pull: false, optics: { mirror: 0.5, dark: { tint: 0.3 } } },
  /** A round button on its own (search, the phone note's buttons): the same
   *  glass; it swells when pressed. */
  button: { tint: 0.15, blur: 1.5, pull: false, optics: { mirror: 0.5, dark: { tint: 0.3 } } },
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
