// The site's liquid glass: the kit of bilalgursen/liquid-glass (./layer.ts,
// ./engine.ts, ./dom-snapshot.ts, MIT) put on the floating chrome (phone tab
// bar, its search button and mini player, the note's reading bar and the
// phone note toolbar). One WebGL2 context draws every piece: it paints the
// page behind each one into a texture and bends it at the rim, in every
// browser with WebGL2 (Safari included, where the old SVG lens never drew).
//
// The looks are the kit's own defaults, untuned: a bar is the kit's
// GlassCard (a surface that holds content), a round button its GlassButton,
// clear or tinted. Until the first frame, and for good without WebGL2, the
// element keeps the CSS glass of phone/base.css `.glass`.

import { attachGlass, type GlassOptions, type GlassOptics } from "./layer";

// GlassCard (glass-card.tsx), copied: its optics, tint, frost, dark rim line
// and the CSS drop shadow it lays under the glass.
const CARD_OPTICS: GlassOptics = {
  bendMode: "radial",
  borderColor: "#ffffff",
  borderAlpha: 0.6,
  borderWidth: 1.3,
  frostMix: 1,
  frostEdge: 1,
  saturation: 1,
  refraction: 1,
  bendDepth: 1.35,
  bendCurve: 9.75,
  dispersion: 0,
  magnify: 0,
  light: 0,
  cursorLight: false,
  shadow: 0,
};
const CARD_SHADOW = "0 16.5px 36px rgba(0, 0, 0, 0.08), 0 26.4px 55.9px rgba(0, 0, 0, 0.08)";
const CARD: GlassOptions = {
  tint: 0.7,
  blur: 5,
  swell: false,
  optics: { ...CARD_OPTICS, dark: { borderAlpha: 0.25 } },
};

/** The looks, by what the glass is. */
export const GLASS_LOOKS = {
  /** A bar holding controls or a title (tab bar, mini player, reading bar,
   *  phone note toolbar and section pill): the kit's GlassCard. */
  card: CARD,
  /** A round button on its own (search, back): the kit's GlassButton, clear. */
  button: {},
  /** A button with a fill of its own (the green "next note"): GlassButton,
   *  tinted (the glass takes the host's background colour). */
  tinted: { material: "tinted" },
} satisfies Record<string, GlassOptions>;

export type GlassLook = keyof typeof GLASS_LOOKS;

/** Makes `el` liquid glass with one of the site's looks. Returns the cleanup. */
export function liquidGlass(el: HTMLElement | null | undefined, look: GlassLook): () => void {
  if (!el || typeof window === "undefined") return () => {};
  if (matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more)").matches) return () => {};
  const off = attachGlass(el, GLASS_LOOKS[look]);
  if (look !== "card") return off;
  // GlassCard's drop shadow, under the glass: an outer box-shadow never
  // paints inside its own box, and GLASS_CSS clears the host's own.
  const shadow = document.createElement("span");
  shadow.setAttribute("aria-hidden", "true");
  shadow.dataset.glassShadow = "";
  shadow.style.cssText = `position:absolute;inset:0;border-radius:inherit;z-index:-2;pointer-events:none;box-shadow:${CARD_SHADOW}`;
  el.querySelector(":scope > canvas")?.after(shadow);
  return () => {
    shadow.remove();
    off();
  };
}
