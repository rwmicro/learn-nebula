// Draws the iPhone/iPad launch screens listed in lib/splash.ts into
// public/splash/ (git-ignored): the app icon centred on the theme's paper,
// the site's name under it in Alegreya SC, as Android composes its own from
// the manifest. Runs before `next build`; existing files are kept, so only a
// new size is drawn. Never fails the build: a missing image only means iOS
// falls back to its white screen.

import fs from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { SITE_TITLE } from "../lib/site";
import {
  splashImages,
  SPLASH_BG,
  SPLASH_INK,
  type SplashTheme,
} from "../lib/splash";

const OUT = path.join(process.cwd(), "public", "splash");
const ICON = path.join(process.cwd(), "public", "icon-512.png");
const FONT = fs.readFileSync(
  path.join(process.cwd(), "assets", "og", "alegreya-sc-700-latin.ttf"),
);

/** The name, drawn once per theme at 4× its largest use, then scaled down. */
async function nameImage(theme: SplashTheme): Promise<Buffer> {
  const res = new ImageResponse(
    h(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Alegreya SC",
          fontWeight: 700,
          fontSize: 96,
          letterSpacing: "0.02em",
          color: SPLASH_INK[theme],
        },
      },
      SITE_TITLE,
    ),
    {
      width: 1400,
      height: 160,
      fonts: [
        { name: "Alegreya SC", data: FONT, weight: 700, style: "normal" },
      ],
    },
  );
  // Trim the transparent margin so the scale below is the text's own width.
  return sharp(Buffer.from(await res.arrayBuffer()))
    .trim()
    .png()
    .toBuffer();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const todo = splashImages().filter(
    (s) => !fs.existsSync(path.join(OUT, path.basename(s.file))),
  );
  if (!todo.length) {
    console.log("splash: up to date");
    return;
  }
  const names = {
    light: await nameImage("light"),
    dark: await nameImage("dark"),
  };
  for (const s of todo) {
    const dpr = s.dpr;
    const short = Math.min(s.width, s.height) / dpr;
    // Icon: about a third of the short side, 112..176 CSS px.
    const icon = Math.round(Math.max(112, Math.min(176, short * 0.32)) * dpr);
    const nameW = Math.round(Math.min(icon * 1.9, short * 0.78 * dpr));
    const nameBuf = await sharp(names[s.theme])
      .resize({ width: nameW })
      .png()
      .toBuffer();
    const nameH = (await sharp(nameBuf).metadata()).height ?? 0;
    const gap = Math.round(22 * dpr);
    const top = Math.round((s.height - icon) / 2 - (gap + nameH) / 3);
    const iconBuf = await sharp(ICON).resize(icon, icon).png().toBuffer();
    await sharp({
      create: {
        width: s.width,
        height: s.height,
        channels: 3,
        background: SPLASH_BG[s.theme],
      },
    })
      .composite([
        { input: iconBuf, left: Math.round((s.width - icon) / 2), top },
        {
          input: nameBuf,
          left: Math.round((s.width - nameW) / 2),
          top: top + icon + gap,
        },
      ])
      .png({ palette: true, compressionLevel: 9 })
      .toFile(path.join(OUT, path.basename(s.file)));
  }
  console.log(
    `splash: ${todo.length} launch screen(s) drawn in public/splash/`,
  );
}

main().catch((e) => {
  console.warn("splash: skipped,", e instanceof Error ? e.message : e);
});
