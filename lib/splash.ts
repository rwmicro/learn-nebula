// The installed app's launch screens on iPhone and iPad.
//
// Android draws its own from the manifest (icon + name on background_color);
// iOS shows a plain white screen unless the page lists one
// <link rel="apple-touch-startup-image"> per screen size, matched by an exact
// media query (CSS size, pixel ratio, orientation) — no match, no image. So
// every current iPhone and iPad is listed below, iPhones in portrait (they
// open in portrait), iPads in both orientations, each in light and dark.
//
// scripts/build-splash.ts draws the files into public/splash/ (git-ignored)
// before `next build`; app/layout.tsx emits the links. Both read this list,
// so a size added here is drawn and linked together.

/** [CSS width, CSS height, device pixel ratio, devices]. Portrait sizes. */
export const SPLASH_SCREENS: ReadonlyArray<
  readonly [number, number, number, string]
> = [
  // iPhone
  [440, 956, 3, "iPhone 16/17 Pro Max"],
  [420, 912, 3, "iPhone Air"],
  [402, 874, 3, "iPhone 16/17 Pro, 17"],
  [430, 932, 3, "iPhone 14 Pro Max, 15 Plus/Pro Max, 16 Plus"],
  [428, 926, 3, "iPhone 12/13 Pro Max, 14 Plus"],
  [393, 852, 3, "iPhone 14 Pro, 15, 15 Pro, 16, 16e"],
  [390, 844, 3, "iPhone 12, 13, 14"],
  [414, 896, 3, "iPhone XS Max, 11 Pro Max"],
  [414, 896, 2, "iPhone XR, 11"],
  [375, 812, 3, "iPhone X, XS, 11 Pro, 12/13 mini"],
  [414, 736, 3, "iPhone 8 Plus"],
  [375, 667, 2, "iPhone 8, SE 2/3"],
  [320, 568, 2, "iPhone SE 1"],
  // iPad
  [1032, 1376, 2, "iPad Pro 13 (M4)"],
  [1024, 1366, 2, "iPad Pro 12.9, iPad Air 13"],
  [834, 1210, 2, "iPad Pro 11 (M4)"],
  [834, 1194, 2, "iPad Pro 11, iPad Air 11"],
  [820, 1180, 2, "iPad Air 10.9, iPad 10/11"],
  [834, 1112, 2, "iPad Air 10.5"],
  [810, 1080, 2, "iPad 10.2"],
  [768, 1024, 2, "iPad mini 5, iPad 9.7"],
  [744, 1133, 2, "iPad mini 6/7"],
];

export type SplashTheme = "light" | "dark";
export type SplashImage = {
  file: string;
  /** Pixel size of the image. */
  width: number;
  height: number;
  /** Device pixel ratio of the screen it is for. */
  dpr: number;
  media: string;
  theme: SplashTheme;
};

/** The two backgrounds: global.css's --paper, as theme-color in layout.tsx. */
export const SPLASH_BG: Record<SplashTheme, string> = {
  light: "#fcfcfc",
  dark: "#1c1b19",
};
export const SPLASH_INK: Record<SplashTheme, string> = {
  light: "#111111",
  dark: "#ebe8e2",
};

/** Every launch image, with its file name and media query. */
export function splashImages(): SplashImage[] {
  const out: SplashImage[] = [];
  for (const [w, h, dpr, name] of SPLASH_SCREENS) {
    const orientations: Array<"portrait" | "landscape"> = name.startsWith(
      "iPad",
    )
      ? ["portrait", "landscape"]
      : ["portrait"];
    for (const o of orientations) {
      for (const theme of ["light", "dark"] as const) {
        const [pw, ph] =
          o === "portrait" ? [w * dpr, h * dpr] : [h * dpr, w * dpr];
        out.push({
          file: `/splash/demarrage-${pw}x${ph}-${theme}.png`,
          width: pw,
          height: ph,
          dpr,
          theme,
          media:
            `(device-width: ${w}px) and (device-height: ${h}px) and ` +
            `(-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${o}) and ` +
            `(prefers-color-scheme: ${theme})`,
        });
      }
    }
  }
  return out;
}
