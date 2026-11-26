// Media: vault assets (images, clips, pronunciation players), standalone
// figures, the YouTube facade, Manim renders.

import { visit, SKIP } from "unist-util-visit";
import { fromHtml } from "hast-util-from-html";
import type { Root, Element, ElementContent, RootContent } from "hast";
import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { join } from "node:path";
import { resolveVaultAsset, isVideoSrc, isAudioSrc, getVaultImage } from "../vault-assets";
import { t } from "../../i18n";
import { hastText, isBlank } from "./hast";

// Speaker icon shared by every `.pron` player (see rehypeVaultAssets below).
// The two outer arcs carry `.pron-wave` so note/*.css can pulse them while
// `data-state="playing"` without needing a second icon swapped in by JS.
const PRON_ICON_SVG =
  '<svg class="pron-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
  '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 9v6h4l5 4V5L8 9H4z"/>' +
  '<path class="pron-wave" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M15.5 8.5a5 5 0 0 1 0 7"/>' +
  '<path class="pron-wave" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M18.2 5.8a9 9 0 0 1 0 12.4"/>' +
  "</svg>";

function pronIcon(): ElementContent {
  return fromHtml(PRON_ICON_SVG, { fragment: true }).children[0] as Element;
}

/** Build the `.pron` pronunciation-player markup replacing `![word](clip.mp3)`.
 * Hydrated client-side by /js/pronounce.js (idle → loading → playing/error). */
function pronPlayer(src: string, alt: string, id: number): Element {
  const labelId = alt ? `pron-label-${id}` : undefined;
  const button: Element = {
    type: "element",
    tagName: "button",
    properties: {
      type: "button",
      className: ["pron-btn"],
      dataState: "idle",
      dataPronSrc: src,
      ariaLabel: t("pronunciation.playAria"),
      dataI18nAriaLabel: "pronunciation.playAria",
      ...(labelId ? { ariaDescribedby: labelId } : {}),
    },
    children: [pronIcon()],
  };
  const children: ElementContent[] = [button];
  if (alt) {
    children.push({
      type: "element",
      tagName: "span",
      properties: { className: ["pron-label"], id: labelId },
      children: [{ type: "text", value: alt }],
    });
  }
  return {
    type: "element",
    tagName: "span",
    properties: { className: ["pron"] },
    children,
  };
}

/** True when a served path (/vault/…) exists under public/ with 0 bytes.
 *  A missing file is not "empty": tests and LFS-less builds lack many. */
function isEmptyServedFile(src: string): boolean {
  if (!src.startsWith("/")) return false;
  try {
    return statSync(join(process.cwd(), "public", decodeURI(src.split(/[?#]/)[0]))).size === 0;
  } catch {
    return false;
  }
}

/** Point relative note assets (images, PDFs…) at the served copies in
 * public/vault; leave remote/absolute references untouched. Also upgrades
 * `<img>` whose src ends in a video extension to a `<video>` element so
 * `![clip](demo.mp4)` works the way authors expect, and one ending in an
 * audio extension to the `.pron` pronunciation player so `![bonjour](fr.mp3)`
 * plays inline instead of showing a broken image. */
export function rehypeVaultAssets(dir: string) {
  let pronId = 0;
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName === "img") {
        const src = node.properties?.src;
        if (typeof src !== "string") return;
        node.properties = node.properties ?? {};
        node.properties.loading = "lazy";
        node.properties.decoding = "async";
        let finalSrc = src;
        if (!/^(https?:|data:)/i.test(src)) {
          const resolved = resolveVaultAsset(src, dir);
          if (resolved) {
            finalSrc = resolved;
            node.properties.src = resolved;
          }
        }
        if (isAudioSrc(finalSrc) && parent && index != null) {
          const alt =
            typeof node.properties.alt === "string"
              ? node.properties.alt.trim()
              : "";
          // A clip the TTS run left empty (0 bytes, vault-health's "empty"):
          // a player that plays nothing reads as broken, so keep the word
          // only, as plain text.
          if (isEmptyServedFile(finalSrc)) {
            const siblings = parent.children as unknown as Array<RootContent | ElementContent>;
            siblings.splice(index, 1, ...(alt ? [{ type: "text", value: alt } as ElementContent] : []));
            return [SKIP, index];
          }
          const player = pronPlayer(finalSrc, alt, ++pronId);
          const siblings = parent.children as unknown as Array<
            RootContent | ElementContent
          >;
          siblings.splice(index, 1, player);
          return SKIP;
        }
        // Responsive variants, when build-image-variants.mjs made some. The
        // intrinsic width/height matter as much as the srcset: without them
        // the browser cannot reserve the image's box and every picture shifts
        // the page as it lands.
        const meta = getVaultImage(finalSrc);
        if (meta && parent && index != null && !isVideoSrc(finalSrc)) {
          // `![[photo.png|300]]` already set a width the author asked for —
          // keep it and derive the height from the real aspect ratio, so the
          // box is still reserved without overriding their intent.
          const asked = Number(node.properties.width);
          if (Number.isFinite(asked) && asked > 0) {
            node.properties.height = Math.round((asked * meta.h) / meta.w);
          } else {
            node.properties.width = meta.w;
            node.properties.height = meta.h;
          }
          if (meta.avif.length || meta.webp.length) {
            const sources: ElementContent[] = [];
            for (const [type, list] of [
              ["image/avif", meta.avif],
              ["image/webp", meta.webp],
            ] as const) {
              if (!list.length) continue;
              sources.push({
                type: "element",
                tagName: "source",
                properties: {
                  type,
                  srcSet: list.map(([w, url]) => `${url} ${w}w`).join(", "),
                  // Figures are capped at the text column; below that the
                  // image fills the viewport minus the page gutter.
                  sizes: "(max-width: 40rem) 100vw, 40rem",
                },
                children: [],
              });
            }
            const picture: Element = {
              type: "element",
              tagName: "picture",
              properties: {},
              children: [...sources, { ...node }],
            };
            const siblings = parent.children as unknown as Array<
              RootContent | ElementContent
            >;
            siblings.splice(index, 1, picture);
            return SKIP;
          }
        }
        // Promote video files to a real <video> element. The HTML spec doesn't
        // let <img> render mp4/webm, so a literal Markdown image link to a
        // video would otherwise show a broken-image icon.
        if (isVideoSrc(finalSrc)) {
          const alt =
            typeof node.properties.alt === "string" ? node.properties.alt : "";
          node.tagName = "video";
          node.properties = {
            src: finalSrc,
            controls: true,
            loop: true,
            muted: true,
            playsInline: true,
            preload: "metadata",
            ...(alt ? { "aria-label": alt } : {}),
          };
          node.children = [];
        }
      } else if (node.tagName === "a") {
        const href = node.properties?.href;
        if (typeof href !== "string") return;
        // Skip external, absolute (/…, incl. wikilink output), anchors, mailto.
        if (/^(https?:|mailto:|tel:|#|\/)/i.test(href)) return;
        const resolved = resolveVaultAsset(href, dir);
        if (resolved) node.properties.href = resolved;
      }
    });
  };
}

// ---------------------------------------------------------------------------
// Figures — a paragraph whose sole content is an image (or a clip promoted to
// <video> above) becomes a real <figure> with a caption, instead of an <img>
// loose inside a <p> with no visual treatment of its own.
//
// Only *standalone* media is promoted: an image sitting in a sentence stays
// inline, where a block-level figure would break the prose. The class is
// deliberately specific — plain `figcaption` is styled as a Tufte margin note
// (shared with .side), and .manim-figure / .mermaid-diagram / .fullwidth have
// their own treatments; none of them should inherit this one.
// ---------------------------------------------------------------------------

export function rehypeFigures() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "p" || !parent || index == null) return;
      // Never inside a margin note or an existing figure: both already give
      // their content a layout, and nesting <figure> is invalid anyway.
      if (parent.type === "element") {
        const p = parent as Element;
        const cls = (p.properties?.className as string[] | undefined) ?? [];
        if (p.tagName === "figure" || cls.includes("side")) return;
      }
      const content = node.children.filter((c) => !isBlank(c));
      if (content.length !== 1 && content.length !== 2) return;
      const media = content[0];
      if (media.type !== "element") return;
      if (!["img", "video", "picture"].includes(media.tagName)) return;

      // The vault's older, hand-written way of captioning an image: the
      // image line followed with NO blank line by `*a caption*` — markdown
      // reads that as one paragraph (a soft line break), not two, since a
      // blank line is what actually separates paragraphs. Recognise it
      // explicitly instead of requiring every existing note to be rewritten
      // for the figure treatment below. The italic run's own children (not
      // just its text) become the figcaption, so an inline link or bold
      // inside the caption survives; it wins over alt/title unconditionally
      // since it's what the author actually wrote to be read, not a fallback.
      let figcaptionChildren: ElementContent[] | null = null;
      if (content.length === 2) {
        const second = content[1];
        if (second.type !== "element" || second.tagName !== "em") return;
        figcaptionChildren = second.children as ElementContent[];
      }

      // Caption: the author's `title` first (written to be read), falling back
      // to `alt` (written for screen readers, but better than nothing).
      // A <picture> carries nothing itself; its <img> holds alt and title.
      const captioned =
        media.tagName === "picture"
          ? ((media.children.find(
              (c): c is Element => c.type === "element" && c.tagName === "img",
            ) ?? media) as Element)
          : media;
      const props = captioned.properties ?? {};
      const title = typeof props.title === "string" ? props.title.trim() : "";
      const alt = typeof props.alt === "string" ? props.alt.trim() : "";
      // A promoted <video> carries its text as aria-label; rehypeVaultAssets
      // sets the literal hyphenated key, hast's own camelCase form is what a
      // hand-written `<video aria-label>` in a note parses to. Accept both.
      const ariaRaw = props["aria-label"] ?? props.ariaLabel;
      const ariaLabel = typeof ariaRaw === "string" ? ariaRaw.trim() : "";
      // An alt that is only the embedded file's name is not a caption. hast
      // normalises the data-* marker to its camelCase property name, so drop
      // both spellings rather than betting on which one survived.
      const altIsFilename =
        props.dataAltIsFilename !== undefined ||
        props["data-alt-is-filename"] !== undefined;
      delete props.dataAltIsFilename;
      delete props["data-alt-is-filename"];
      if (!figcaptionChildren) {
        const caption = title || (altIsFilename ? "" : alt) || ariaLabel;
        if (caption) figcaptionChildren = [{ type: "text", value: caption }];
      }
      // A title that is also the caption would be shown twice (once as the
      // browser's tooltip); the caption is the visible one.
      if (title) delete props.title;

      const children: ElementContent[] = [media];
      if (figcaptionChildren) {
        children.push({
          type: "element",
          tagName: "figcaption",
          properties: {},
          children: figcaptionChildren,
        });
      }
      const figure: Element = {
        type: "element",
        tagName: "figure",
        properties: { className: ["note-figure"] },
        children,
      };
      (parent.children as ElementContent[]).splice(index, 1, figure);
      return SKIP;
    });
  };
}

// ---------------------------------------------------------------------------
// YouTube — a paragraph whose sole content is a YouTube link becomes a
// privacy-friendly facade (#16): the video thumbnail + a play button styled
// like the rest of the site. public/js/youtube.js swaps in a youtube-nocookie
// iframe only once the reader clicks, so no Google frame (or cookie) loads up
// front; the CSP allows youtube-nocookie.com in frame-src (lib/site.ts).
// ---------------------------------------------------------------------------

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function youtubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  let id = "";
  if (host === "youtu.be") {
    id = u.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v") ?? "";
    else if (u.pathname.startsWith("/embed/"))
      id = u.pathname.slice(7).split("/")[0];
    else if (u.pathname.startsWith("/shorts/"))
      id = u.pathname.slice(8).split("/")[0];
    else if (u.pathname.startsWith("/live/"))
      id = u.pathname.slice(6).split("/")[0];
  }
  return YT_ID.test(id) ? id : null;
}

function youtubeFacadeHtml(id: string): string {
  // id is validated against YT_ID (word chars only), so it is safe to inline.
  const watch = t("youtube.watch");
  const play = t("youtube.play");
  return (
    `<div class="yt-embed" data-yt-id="${id}">` +
    `<button class="yt-embed-btn" type="button" aria-label="${play}" data-i18n-aria-label="youtube.play">` +
    `<img class="yt-embed-thumb" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" width="480" height="360">` +
    `<span class="yt-embed-play" aria-hidden="true">` +
    `<svg viewBox="0 0 68 48" width="68" height="48"><path class="yt-embed-play-bg" d="M66.5 7.5a8 8 0 0 0-5.6-5.7C56 .5 34 .5 34 .5s-22 0-26.9 1.3A8 8 0 0 0 1.5 7.5 83 83 0 0 0 .2 24a83 83 0 0 0 1.3 16.5 8 8 0 0 0 5.6 5.7C12 47.5 34 47.5 34 47.5s22 0 26.9-1.3a8 8 0 0 0 5.6-5.7A83 83 0 0 0 67.8 24a83 83 0 0 0-1.3-16.5z"></path><path d="M27 34l18-10-18-10z" fill="#fff"></path></svg>` +
    `</span></button>` +
    `<a class="yt-embed-link" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer" data-i18n="youtube.watch">${watch}</a>` +
    `</div>`
  );
}

export function rehypeYouTube() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "p" || !parent || index == null) return;
      const kids = node.children.filter(
        (c) => !(c.type === "text" && !c.value.trim()),
      );
      if (kids.length !== 1) return;
      const a = kids[0];
      if (a.type !== "element" || a.tagName !== "a") return;
      const href = a.properties?.href;
      if (typeof href !== "string") return;
      const id = youtubeId(href);
      if (!id) return;
      const frag = fromHtml(youtubeFacadeHtml(id), { fragment: true });
      parent.children.splice(index, 1, ...(frag.children as ElementContent[]));
      return [SKIP, index];
    });
  };
}

// ---------------------------------------------------------------------------
// Manim — convert ```manim``` fenced blocks into <figure> with a cached video
// and a collapsible Python source. The cache file is looked up by SHA-256 of
// the trimmed source (first 16 hex chars), matching the algorithm used by the
// companion `obsidian-manim-renderer` plugin. When no cached render exists
// the block falls back to a plain Python code block with a small notice.
// ---------------------------------------------------------------------------

function manimHash(code: string): string {
  return createHash("sha256")
    .update(code.trim(), "utf-8")
    .digest("hex")
    .slice(0, 16);
}

function findManimCacheUrl(hash: string, dir: string): string | null {
  // Try mp4 first, then gif, then png (single-frame renders from `frame=last`
  // or `format=png`), then webm. We resolve through the same vault-asset
  // pipeline so the URL matches what `copy-vault-images.mjs` emits.
  for (const ext of ["mp4", "gif", "png", "webm"]) {
    const url = resolveVaultAsset(`_manim/${hash}.${ext}`, dir);
    if (url) return url;
  }
  return null;
}

/** True for image-like outputs that should be rendered as <img>, not <video>. */
function isStaticManimUrl(url: string): boolean {
  const u = url.toLowerCase().split(/[?#]/)[0];
  return u.endsWith(".gif") || u.endsWith(".png");
}

export function rehypeManim(dir: string) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, _index, parent) => {
      if (node.tagName !== "pre" || !parent) return;
      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code) return;
      const classes =
        (code.properties?.className as string[] | undefined) ?? [];
      const isManim = classes.some(
        (c) => typeof c === "string" && c === "language-manim",
      );
      if (!isManim) return;

      const source = hastText(code).replace(/\n$/, "");
      const hash = manimHash(source);
      const videoUrl = findManimCacheUrl(hash, dir);

      // Re-mark the inner <code> as Python so rehypeShiki highlights it.
      code.properties = code.properties ?? {};
      code.properties.className = ["language-python"];

      const summaryText = videoUrl
        ? `Source · ${hash}`
        : `Source · ${hash} · (no cached render)`;
      const sourceDetails: Element = {
        type: "element",
        tagName: "details",
        properties: { className: ["manim-source"] },
        children: [
          {
            type: "element",
            tagName: "summary",
            properties: {},
            children: [{ type: "text", value: summaryText }],
          },
          // Keep the original <pre><code> so shiki picks it up later.
          { ...node },
        ],
      };

      const figureChildren: ElementContent[] = [];

      if (videoUrl) {
        const isStatic = isStaticManimUrl(videoUrl);
        figureChildren.push(
          isStatic
            ? {
                type: "element",
                tagName: "img",
                properties: {
                  src: videoUrl,
                  alt: "Manim render",
                  loading: "lazy",
                  decoding: "async",
                  className: ["manim-output"],
                },
                children: [],
              }
            : {
                type: "element",
                tagName: "video",
                properties: {
                  src: videoUrl,
                  controls: true,
                  loop: true,
                  muted: true,
                  playsInline: true,
                  preload: "metadata",
                  className: ["manim-output"],
                },
                children: [],
              },
        );
      } else {
        figureChildren.push({
          type: "element",
          tagName: "p",
          properties: { className: ["manim-missing"] },
          children: [
            {
              type: "text",
              value:
                "No cached render — open this note in Obsidian with the Manim plugin enabled and click ▶ to generate it.",
            },
          ],
        });
      }

      figureChildren.push(sourceDetails);

      const figure: Element = {
        type: "element",
        tagName: "figure",
        properties: {
          className: ["manim-figure"],
          dataManimHash: hash,
        },
        children: figureChildren,
      };

      // Replace the <pre> in its parent with the <figure>. `parent.children`
      // may be RootContent[] or ElementContent[] depending on context; the
      // figure is a valid member of both so the cast is sound.
      const siblings = parent.children as unknown as Array<
        RootContent | ElementContent
      >;
      const i = siblings.indexOf(node as unknown as RootContent);
      if (i !== -1) siblings.splice(i, 1, figure);
      return SKIP;
    });
  };
}
