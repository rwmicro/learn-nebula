import localFont from "next/font/local";

// Editorial serif of the home's content zone and of the desktop /parcours/,
// exposed as the --gk-serif variable (HomeContent and parcours-desk.css read
// it; the masthead keeps the site's Alegreya).
//
// The files live in the repo rather than coming from next/font/google: Google
// does not always answer the build's download with the same files (a
// per-subset static cut one time, a dynamic kit the next), and the screenshot
// baselines of the home and /parcours/ flipped between two renderings from
// one CI run to the next with no code change. Embedded, every build ships the
// same bytes.
//
// What they are: Newsreader 1.003 (google/fonts, ofl/newsreader, OFL.txt next
// to them), the opsz axis pinned at 16 — the value Google's css2 API pins when
// only wght is asked for, which is what next/font/google asked — wght kept
// variable (200–800), subset to the code points of Google's latin + latin-ext
// cuts merged into one file per style (next/font/local has no unicode-range).
// Recipe with fontTools: varLib.instancer.instantiateVariableFont(font,
// {"opsz": 16}), then subset with layout_features ["*"], flavor woff2.
export const newsreader = localFont({
  src: [
    { path: "../../assets/fonts/newsreader-roman.woff2", weight: "400 600", style: "normal" },
    { path: "../../assets/fonts/newsreader-italic.woff2", weight: "400 600", style: "italic" },
  ],
  display: "swap",
  variable: "--gk-serif",
  fallback: ["Georgia", "serif"],
  // Metric-matched fallback on a serif, as next/font/google did for this font.
  adjustFontFallback: "Times New Roman",
  // The serif lives below the fold; preloading it just triggers "preloaded but
  // not used" console warnings. The swap fallback covers the brief FOUT.
  preload: false,
});
