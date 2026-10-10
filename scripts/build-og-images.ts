// Draws a share card (1200×630 PNG) for every note into public/og/, used as
// its Open Graph / Twitter image when the note has no image of its own
// (lib/seo.ts). Same faces and colours as the site: Alegreya on the paper
// tone, the garden green for the sprout and the rule. Run with tsx, after
// fetch-notes and before `next build` (the pages check the files exist).
//
// Files are named by a hash of what they show (lib/og.ts), so a rebuild only
// draws new or renamed notes; stale files are removed.

import fs from "node:fs";
import path from "node:path";
import { createElement as h, type ReactElement } from "react";
import { ImageResponse } from "next/og";
import { getAllPosts, INDEX_NOTE } from "../lib/content";
import { folderKey, t } from "../lib/i18n";
import { OG_DIR, ogCardFor, ogFileName, type OgCard } from "../lib/og";
import { SITE_TITLE, SITE_URL } from "../lib/site";

const FONT_DIR = path.join(process.cwd(), "assets", "og");
const font = (f: string) => fs.readFileSync(path.join(FONT_DIR, f));
const fonts = [
  { name: "Alegreya", data: font("alegreya-500-latin.ttf"), weight: 500 as const, style: "normal" as const },
  { name: "Alegreya", data: font("alegreya-500-latin-ext.ttf"), weight: 500 as const, style: "normal" as const },
  { name: "Alegreya SC", data: font("alegreya-sc-700-latin.ttf"), weight: 700 as const, style: "normal" as const },
  { name: "Alegreya Sans", data: font("alegreya-sans-500-latin.ttf"), weight: 500 as const, style: "normal" as const },
];

const PAPER = "#fcfcfc";
const INK = "#111111";
const MUTED = "#6f6f6f";
const GARDEN = "#3f6b4a";
const WASH = "#eef3ec";

const host = (() => {
  try {
    return new URL(SITE_URL).host;
  } catch {
    return "";
  }
})();

function titleSize(title: string): number {
  const n = title.length;
  if (n <= 28) return 88;
  if (n <= 48) return 74;
  if (n <= 80) return 60;
  return 50;
}

function card(c: OgCard): ReactElement {
  const k = folderKey(c.discipline);
  const discipline = k ? t(k) : c.discipline;
  const title = c.title.length > 120 ? `${c.title.slice(0, 117)}…` : c.title;
  return h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: PAPER,
        padding: "64px 80px 56px",
        borderLeft: `18px solid ${GARDEN}`,
        fontFamily: "Alegreya",
        color: INK,
      },
    },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 18 } },
      h(
        "svg",
        { width: 44, height: 44, viewBox: "0 0 24 24" },
        h("path", {
          d: "M12 22V11m0 0C12 6 8 4 4 4c0 4 3 7 8 7Zm0 0c0-4 3-7 8-7 0 4-3 7-8 7Z",
          fill: GARDEN,
          stroke: GARDEN,
          strokeWidth: 2,
          strokeLinejoin: "round",
        }),
      ),
      h("div", { style: { fontFamily: "Alegreya SC", fontWeight: 700, fontSize: 36, letterSpacing: 1 } }, SITE_TITLE),
    ),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 22 } },
      discipline
        ? h(
            "div",
            {
              style: {
                display: "flex",
                alignSelf: "flex-start",
                fontFamily: "Alegreya SC",
                fontWeight: 700,
                fontSize: 30,
                letterSpacing: 2,
                color: GARDEN,
                background: WASH,
                padding: "6px 18px",
                borderRadius: 999,
              },
            },
            discipline.toLowerCase(),
          )
        : null,
      h(
        "div",
        { style: { fontSize: titleSize(title), lineHeight: 1.08, fontWeight: 500, letterSpacing: -1 } },
        title,
      ),
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          borderTop: `2px solid ${INK}`,
          paddingTop: 18,
          fontFamily: "Alegreya Sans",
          fontSize: 26,
          color: MUTED,
        },
      },
      h("div", {}, host),
    ),
  );
}

async function main() {
  fs.mkdirSync(OG_DIR, { recursive: true });
  const cards = getAllPosts()
    .filter((d) => d.rawPath !== INDEX_NOTE)
    .map(ogCardFor);
  const wanted = new Set(cards.map(ogFileName));
  let removed = 0;
  for (const f of fs.readdirSync(OG_DIR)) {
    if (f.endsWith(".png") && !wanted.has(f)) {
      fs.rmSync(path.join(OG_DIR, f));
      removed++;
    }
  }
  const todo = cards.filter((c) => !fs.existsSync(path.join(OG_DIR, ogFileName(c))));
  const started = Date.now();
  let drawn = 0;
  let failed = 0;
  // A few at a time: resvg is synchronous wasm, satori is not.
  const CONCURRENCY = 4;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    await Promise.all(
      todo.slice(i, i + CONCURRENCY).map(async (c) => {
        try {
          const res = new ImageResponse(card(c), { width: 1200, height: 630, fonts });
          const buf = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(path.join(OG_DIR, ogFileName(c)), buf);
          drawn++;
        } catch (e) {
          failed++;
          console.warn(`og: ${c.slug}: ${(e as Error).message}`);
        }
      }),
    );
  }
  console.log(
    `og: ${drawn} drawn, ${cards.length - todo.length} kept, ${removed} removed` +
      (failed ? `, ${failed} failed` : "") +
      ` (${((Date.now() - started) / 1000).toFixed(1)} s)`,
  );
}

main().catch((e) => {
  // Share images are a nicety: never fail the build over them.
  console.warn("og: skipped:", e);
});
