import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkSmartypants from "remark-smartypants";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeStringify from "rehype-stringify";
import { visit, SKIP } from "unist-util-visit";
import { fromHtml } from "hast-util-from-html";
import { toString as mdToString } from "mdast-util-to-string";
import katex from "katex";
import type { Root, Element, ElementContent, RootContent } from "hast";
import { createHash } from "node:crypto";
import { rehypeShiki } from "./highlight";
import { resolveWikiLink } from "./content";
import { resolveVaultAsset, isVideoSrc, isAudioSrc } from "./vault-assets";
import { t } from "./i18n";

// ---------------------------------------------------------------------------
// Preprocessing (runs on the raw Markdown, before the unified pipeline so that
// LaTeX backslashes and Hugo shortcodes survive Markdown's own escaping).
// ---------------------------------------------------------------------------

// CommonMark backslash-unescaping, applied inside math so the author's
// goldmark-oriented escaping (\_, \\{, \\}) yields valid KaTeX input.
const PUNCT = /\\([!-/:-@[-`{-~])/g;
const unescapeMath = (s: string) => s.replace(PUNCT, "$1");

interface Placeholders {
  map: Map<string, string>;
  next: () => string;
}

function newPlaceholders(): Placeholders {
  const map = new Map<string, string>();
  let n = 0;
  return { map, next: () => `ph${n++}` };
}

function preprocessMath(raw: string, ph: Placeholders): string {
  const render = (tex: string, displayMode: boolean) =>
    katex.renderToString(unescapeMath(tex), {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  const display = (tex: string) => {
    const id = ph.next();
    ph.map.set(id, render(tex, true));
    return `\n\n<div data-ph="${id}"></div>\n\n`;
  };
  const inline = (tex: string) => {
    const id = ph.next();
    ph.map.set(id, render(tex, false));
    return `<span data-ph="${id}"></span>`;
  };

  // Stash code (fenced + inline) so `$…$` inside it isn't treated as math.
  const code: string[] = [];
  const stash = (m: string) => `@@C${code.push(m) - 1}@@`;
  let out = raw
    .replace(/```[\s\S]*?```/g, stash)
    .replace(/~~~[\s\S]*?~~~/g, stash)
    .replace(/`+[^`]*`+/g, stash);

  // Display first ($$ … $$ and \[ … \]), then inline ($ … $ and \( … \)). The
  // `$ … $` rule avoids currency: the opening `$` can't follow a digit nor lead
  // a space, and the closing `$` can't follow a space nor precede a digit.
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex) => display(tex));
  out = out.replace(/\\\\\[([\s\S]*?)\\\\\]/g, (_m, tex) => display(tex));
  out = out.replace(
    /(?<![\d\\$])\$(?![\s$])((?:[^$\n]|\\\$)+?)(?<![\s\\])\$(?!\d)/g,
    (_m, tex) => inline(tex),
  );
  out = out.replace(/\\\\\(([\s\S]*?)\\\\\)/g, (_m, tex) => inline(tex));

  // Restore code untouched.
  out = out.replace(/@@C(\d+)@@/g, (_m, i) => code[Number(i)]);
  return out;
}

// ---------------------------------------------------------------------------
// rehype plugins
// ---------------------------------------------------------------------------

function hastText(node: any): string {
  if (node.type === "text") return node.value;
  if (Array.isArray(node.children)) return node.children.map(hastText).join("");
  return "";
}

// Script-execution schemes that must never survive in a note-authored link/src.
const UNSAFE_URL = /^\s*(?:javascript|vbscript):/i;

/**
 * Strip the script-execution vectors from note-authored raw HTML — everything
 * that flowed through rehypeRaw. Runs *before* our own trusted fragments (KaTeX,
 * callout icons, manim/video, highlighted code) are injected, so it only touches
 * what the note author wrote. Notes are first-party, but /api/translate re-runs
 * this exact pipeline on the model's output, so this keeps a prompt-injected note
 * from smuggling executable markup back through the translator. `<script>` goes,
 * inline `on*` event handlers go (they still fire under our `unsafe-inline`
 * script-src), and `javascript:`/`vbscript:` URLs are dropped. `data-*` is left
 * intact — the math placeholders (`data-ph`) depend on it.
 */
function rehypeStripUnsafe() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName === "script" && parent && index != null) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      const props = node.properties;
      if (!props) return;
      for (const key of Object.keys(props)) {
        if (/^on/i.test(key)) delete props[key];
      }
      for (const attr of ["href", "src"] as const) {
        const v = props[attr];
        if (typeof v === "string" && UNSAFE_URL.test(v)) delete props[attr];
      }
    });
  };
}

/** Replace <div|span data-ph="…"> placeholders with their stored HTML. */
function rehypePlaceholders(map: Map<string, string>) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      const id = node.properties?.dataPh;
      if (typeof id !== "string" || !parent || index == null) return;
      const html = map.get(id) ?? "";
      const frag = fromHtml(html, { fragment: true });
      parent.children.splice(index, 1, ...(frag.children as RootContent[]));
      return [SKIP, index + frag.children.length];
    });
  };
}

// --- Obsidian callouts ( > [!type] Title ) ---------------------------------
const calloutSvg = (inner: string) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

// Obsidian type aliases -> canonical type.
const CALLOUT_ALIAS: Record<string, string> = {
  note: "note",
  abstract: "abstract",
  summary: "abstract",
  tldr: "abstract",
  info: "info",
  todo: "todo",
  tip: "tip",
  hint: "tip",
  important: "tip",
  success: "success",
  check: "success",
  done: "success",
  question: "question",
  help: "question",
  faq: "question",
  warning: "warning",
  caution: "warning",
  attention: "warning",
  failure: "failure",
  fail: "failure",
  missing: "failure",
  danger: "danger",
  error: "danger",
  bug: "bug",
  example: "example",
  quote: "quote",
  cite: "quote",
};
// Default (French) title when the callout has none.
const CALLOUT_LABEL: Record<string, string> = {
  note: "Note",
  abstract: "Résumé",
  info: "Info",
  todo: "À faire",
  tip: "Astuce",
  success: "Succès",
  question: "Question",
  warning: "Attention",
  failure: "Échec",
  danger: "Danger",
  bug: "Bug",
  example: "Exemple",
  quote: "Citation",
};
const CALLOUT_ICON: Record<string, string> = {
  note: calloutSvg(
    '<path d="M4 20h4L18 8a2 2 0 0 0-3-3L5 16v4z"/><path d="M14 6l3 3"/>',
  ),
  abstract: calloutSvg(
    '<rect x="6" y="4" width="12" height="16" rx="1.5"/><path d="M9 9h6M9 13h6M9 17h4"/>',
  ),
  info: calloutSvg(
    '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  ),
  todo: calloutSvg(
    '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5 5-5.5"/>',
  ),
  tip: calloutSvg(
    '<path d="M12 3c2.5 3 4 4.8 4 8a4 4 0 1 1-8 0c0-1.7.7-3 2-4.2"/>',
  ),
  success: calloutSvg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  question: calloutSvg(
    '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.2a2.7 2.7 0 0 1 4.5 2c0 1.7-2.3 2-2.3 3.3"/><path d="M12 17.5h.01"/>',
  ),
  warning: calloutSvg(
    '<path d="M12 4 2.7 20h18.6L12 4z"/><path d="M12 10v4"/><path d="M12 17.5h.01"/>',
  ),
  failure: calloutSvg(
    '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  ),
  danger: calloutSvg('<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>'),
  bug: calloutSvg(
    '<rect x="8" y="9" width="8" height="9" rx="4"/><path d="M8 13H4M16 13h4M8 17l-3 2M16 17l3 2M9 9 7.5 7M15 9l1.5-2"/>',
  ),
  example: calloutSvg(
    '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  ),
  quote: calloutSvg(
    '<path d="M10 8H6a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2v2H6"/><path d="M20 8h-4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2v2h-2"/>',
  ),
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Split inline children at the first line break (callout title vs. body text).
function splitAtBreak(
  children: ElementContent[],
): [ElementContent[], ElementContent[]] {
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.type === "element" && c.tagName === "br") {
      return [children.slice(0, i), children.slice(i + 1)];
    }
    if (c.type === "text" && c.value.includes("\n")) {
      const nl = c.value.indexOf("\n");
      const head = children.slice(0, i);
      if (c.value.slice(0, nl))
        head.push({ type: "text", value: c.value.slice(0, nl) });
      const tail: ElementContent[] = [];
      if (c.value.slice(nl + 1))
        tail.push({ type: "text", value: c.value.slice(nl + 1) });
      tail.push(...children.slice(i + 1));
      return [head, tail];
    }
  }
  return [children, []];
}

/** Render Obsidian callouts (`> [!type] Title`) as styled `<div class="callout">`. */
function rehypeCallouts() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "blockquote" || !parent || index == null) return;
      const firstP = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "p",
      );
      const firstText = firstP?.children[0];
      if (!firstP || !firstText || firstText.type !== "text") return;
      const m = firstText.value.match(/^\[!([\w-]+)\]([+-]?)[ \t]*/);
      if (!m) return;

      const type = m[1].toLowerCase();
      const fold = m[2];
      const canon = CALLOUT_ALIAS[type] ?? "note";
      firstText.value = firstText.value.slice(m[0].length);

      const [titleNodes, inlineRest] = splitAtBreak(firstP.children);
      const hasTitle = titleNodes.some(
        (n) => !(n.type === "text" && n.value.trim() === ""),
      );

      const iconFrag = fromHtml(CALLOUT_ICON[canon] ?? CALLOUT_ICON.note, {
        fragment: true,
      });
      const icon: Element = {
        type: "element",
        tagName: "span",
        properties: { className: ["callout-icon"] },
        children: iconFrag.children as ElementContent[],
      };
      const titleEl: Element = {
        type: "element",
        tagName: fold ? "summary" : "div",
        properties: { className: ["callout-title"] },
        children: [
          icon,
          {
            type: "element",
            tagName: "span",
            properties: {},
            children: hasTitle
              ? titleNodes
              : [{ type: "text", value: CALLOUT_LABEL[canon] ?? cap(type) }],
          },
        ],
      };

      // Body = the rest of the blockquote; the title line's trailing inline
      // content (no blank line before it) becomes the body's first paragraph.
      const rest = node.children.filter((c) => c !== firstP);
      const bodyChildren: ElementContent[] = inlineRest.length
        ? [
            {
              type: "element",
              tagName: "p",
              properties: {},
              children: inlineRest,
            },
            ...rest,
          ]
        : rest;
      const body: Element = {
        type: "element",
        tagName: "div",
        properties: { className: ["callout-body"] },
        children: bodyChildren,
      };

      const inner: ElementContent[] = fold
        ? [
            {
              type: "element",
              tagName: "details",
              properties: fold === "+" ? { open: true } : {},
              children: [titleEl, body],
            },
          ]
        : [titleEl, body];

      parent.children[index] = {
        type: "element",
        tagName: "div",
        properties: {
          className: ["callout", `callout-${canon}`],
          dataCallout: type,
        },
        children: inner,
      };
      return SKIP;
    });
  };
}

/** Pull explicit `{#id}` ids out of heading text (Hugo/goldmark syntax). */
function rehypeHeadingIds() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (!/^h[1-6]$/.test(node.tagName)) return;
      const last = node.children[node.children.length - 1];
      if (last && last.type === "text") {
        const m = last.value.match(/\s*\{#([^}]+)\}\s*$/);
        if (m) {
          node.properties = node.properties ?? {};
          node.properties.id = m[1];
          last.value = last.value.slice(0, m.index).trimEnd();
        }
      }
    });
  };
}

// Speaker icon shared by every `.pron` player (see rehypeVaultAssets below).
// The two outer arcs carry `.pron-wave` so main.css can pulse them while
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

/** Point relative note assets (images, PDFs…) at the served copies in
 * public/vault; leave remote/absolute references untouched. Also upgrades
 * `<img>` whose src ends in a video extension to a `<video>` element so
 * `![clip](demo.mp4)` works the way authors expect, and one ending in an
 * audio extension to the `.pron` pronunciation player so `![bonjour](fr.mp3)`
 * plays inline instead of showing a broken image. */
function rehypeVaultAssets(dir: string) {
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
            typeof node.properties.alt === "string" ? node.properties.alt.trim() : "";
          const player = pronPlayer(finalSrc, alt, ++pronId);
          const siblings = parent.children as unknown as Array<RootContent | ElementContent>;
          siblings.splice(index, 1, player);
          return SKIP;
        }
        // Promote video files to a real <video> element. The HTML spec doesn't
        // let <img> render mp4/webm, so a literal Markdown image link to a
        // video would otherwise show a broken-image icon.
        if (isVideoSrc(finalSrc)) {
          const alt = typeof node.properties.alt === "string" ? node.properties.alt : "";
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

/** Is this node whitespace-only text (so it doesn't count as "content")? */
function isBlank(node: ElementContent): boolean {
  return node.type === "text" && node.value.trim() === "";
}

function rehypeFigures() {
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
      if (content.length !== 1) return;
      const media = content[0];
      if (media.type !== "element") return;
      if (media.tagName !== "img" && media.tagName !== "video") return;

      // Caption: the author's `title` first (written to be read), falling back
      // to `alt` (written for screen readers, but better than nothing).
      const props = media.properties ?? {};
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
        props.dataAltIsFilename !== undefined || props["data-alt-is-filename"] !== undefined;
      delete props.dataAltIsFilename;
      delete props["data-alt-is-filename"];
      const caption = title || (altIsFilename ? "" : alt) || ariaLabel;
      // A title that is also the caption would be shown twice (once as the
      // browser's tooltip); the caption is the visible one.
      if (title) delete props.title;

      const children: ElementContent[] = [media];
      if (caption) {
        children.push({
          type: "element",
          tagName: "figcaption",
          properties: {},
          children: [{ type: "text", value: caption }],
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
    else if (u.pathname.startsWith("/embed/")) id = u.pathname.slice(7).split("/")[0];
    else if (u.pathname.startsWith("/shorts/")) id = u.pathname.slice(8).split("/")[0];
    else if (u.pathname.startsWith("/live/")) id = u.pathname.slice(6).split("/")[0];
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

function rehypeYouTube() {
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
  return createHash("sha256").update(code.trim(), "utf-8").digest("hex").slice(0, 16);
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

function rehypeManim(dir: string) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, _index, parent) => {
      if (node.tagName !== "pre" || !parent) return;
      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code) return;
      const classes = (code.properties?.className as string[] | undefined) ?? [];
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
      const siblings = parent.children as unknown as Array<RootContent | ElementContent>;
      const i = siblings.indexOf(node as unknown as RootContent);
      if (i !== -1) siblings.splice(i, 1, figure);
      return SKIP;
    });
  };
}

const isBackref = (n: ElementContent) =>
  n.type === "element" && n.properties?.dataFootnoteBackref !== undefined;

function unwrapParagraphs(nodes: ElementContent[]): ElementContent[] {
  const out: ElementContent[] = [];
  for (const n of nodes) {
    if (n.type === "element" && n.tagName === "p") {
      out.push(...n.children.filter((c) => !isBackref(c)));
    } else if (!isBackref(n)) {
      out.push(n);
    }
  }
  return out;
}

/**
 * Convert GFM footnotes into Tufte-style margin notes, mirroring
 * layouts/partials/processed-content.html: each reference becomes
 *   <sup>N</sup><span class="side" data-nosnippet><sup>N</sup>…content…</span>
 * and the footnotes section at the bottom is removed.
 */
function rehypeSidenotes() {
  return (tree: Root) => {
    const defs = new Map<string, ElementContent[]>();

    // 1. Collect and remove the footnotes section.
    visit(tree, "element", (node: Element, index, parent) => {
      const isSection =
        node.tagName === "section" &&
        (node.properties?.dataFootnotes !== undefined ||
          (Array.isArray(node.properties?.className) &&
            (node.properties.className as string[]).includes("footnotes")));
      if (!isSection || !parent || index == null) return;
      visit(node, "element", (li: Element) => {
        const id = li.tagName === "li" ? li.properties?.id : undefined;
        if (typeof id === "string") {
          defs.set(id, unwrapParagraphs(li.children as ElementContent[]));
        }
      });
      parent.children.splice(index, 1);
      return [SKIP, index];
    });

    // 2. Replace each reference with the inline number + margin note.
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "sup" || !parent || index == null) return;
      const a = node.children.find(
        (c): c is Element =>
          c.type === "element" && c.properties?.dataFootnoteRef !== undefined,
      );
      if (!a) return;
      const num = hastText(a);
      const href = String(a.properties?.href ?? "");
      const content = defs.get(href.replace(/^#/, "")) ?? [];

      const numSup: Element = {
        type: "element",
        tagName: "sup",
        properties: {},
        children: [{ type: "text", value: num }],
      };
      const side: Element = {
        type: "element",
        tagName: "span",
        properties: { className: ["side"], dataNosnippet: "" },
        children: [
          {
            type: "element",
            tagName: "sup",
            properties: {},
            children: [{ type: "text", value: num }],
          },
          ...content,
        ],
      };
      parent.children.splice(index, 1, numSup, side);
      return [SKIP, index + 2];
    });
  };
}

/**
 * Convert Obsidian wikilinks to real links, operating on mdast text nodes only
 * so that `[[ … ]]` inside (bash) code blocks is left untouched. Unresolved
 * targets are left as literal text.
 *
 * A leading `!` is Obsidian's embed marker. When the target resolves to a vault
 * asset, `![[photo.png]]` becomes a real image node — it used to emit a link
 * with the bang left behind as literal text, so an embedded image rendered as
 * "!photo.png" in the prose. (lib/seo.ts already treated `![[file.png]]` as an
 * image when picking a note's OG image, so the two halves disagreed.)
 * Note *transclusion* — `![[Some Note]]` pulling in another note's body — is
 * not implemented; that target still becomes a plain link, just without the
 * stray bang.
 */
function splitWikiLinks(value: string): unknown[] | null {
  // The optional `!` is captured so an embed can be told from a plain link.
  const re = /(!?)\[\[([^[\]\n]+?)\]\]/g;
  const out: unknown[] = [];
  let last = 0;
  let found = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    const embed = m[1] === "!";
    const inner = m[2];
    const pipe = inner.indexOf("|");
    const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() : null;
    const beforePipe = pipe >= 0 ? inner.slice(0, pipe) : inner;
    const hash = beforePipe.indexOf("#");
    const target = (hash >= 0 ? beforePipe.slice(0, hash) : beforePipe).trim();
    const url = resolveWikiLink(target);
    if (!url) continue;
    found = true;
    if (m.index > last)
      out.push({ type: "text", value: value.slice(last, m.index) });
    const display = (alias ?? target.split("/").pop() ?? target).trim();
    // Only an asset can be embedded: resolveWikiLink sends notes to /posts/.
    if (embed && url.startsWith("/vault/")) {
      // `![[photo.png|300]]` is Obsidian's width syntax, not a caption.
      const width = alias && /^\d+$/.test(alias) ? alias : null;
      // With no alias (or a numeric one, which is a width) the only text we
      // have is the file name: fine as an alt fallback, not a caption. The
      // marker tells rehypeFigures not to print it; it is stripped there.
      const named = Boolean(alias) && !width;
      out.push({
        type: "image",
        url,
        alt: named ? display : target.split("/").pop(),
        data: {
          hProperties: {
            ...(width ? { width } : {}),
            ...(named ? {} : { "data-alt-is-filename": "" }),
          },
        },
      });
    } else {
      out.push({
        type: "link",
        url,
        children: [{ type: "text", value: display }],
      });
    }
    last = re.lastIndex;
  }
  if (!found) return null;
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function remarkWikiLinks() {
  return (tree: Root) => {
    visit(tree as any, "text", (node: any, index, parent: any) => {
      if (parent == null || index == null || !node.value.includes("[[")) return;
      const replaced = splitWikiLinks(node.value);
      if (!replaced) return;
      parent.children.splice(index, 1, ...replaced);
      return index + replaced.length;
    });
  };
}

// ---------------------------------------------------------------------------
// Processors
// ---------------------------------------------------------------------------

export interface Rendered {
  html: string;
  plain: string;
  /** Whether any math was rendered (so the page can load the KaTeX stylesheet). */
  hasMath: boolean;
}

export async function renderMarkdown(
  raw: string,
  opts: { dir?: string } = {},
): Promise<Rendered> {
  const dir = opts.dir ?? "";
  const ph = newPlaceholders();
  const text = preprocessMath(raw, ph);

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkWikiLinks)
    .use(remarkSmartypants)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStripUnsafe)
    .use(rehypeCallouts)
    .use(rehypeManim, dir)
    .use(rehypeShiki)
    .use(rehypePlaceholders, ph.map)
    .use(rehypeHeadingIds)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      properties: { className: ["anchor"] },
      content: { type: "text", value: "§" },
    })
    .use(rehypeVaultAssets, dir)
    .use(rehypeYouTube)
    .use(rehypeSidenotes)
    // After rehypeVaultAssets (src resolved, clips promoted to <video>) and
    // after rehypeSidenotes, so an image pulled into a margin note is left
    // alone rather than boxed into a figure inside the margin.
    .use(rehypeFigures)
    .use(rehypeStringify, { allowDangerousHtml: true });

  const html = String(await processor.process(text));
  return { html, plain: extractPlain(raw), hasMath: ph.map.size > 0 };
}

/** Plain-text rendering for meta descriptions and list excerpts. */
export function extractPlain(raw: string): string {
  // Strip math/figures/shortcodes before parsing for text.
  const cleaned = raw
    .replace(/\$\$[\s\S]+?\$\$/g, " ")
    .replace(
      /(?<![\d\\$])\$(?![\s$])(?:[^$\n]|\\\$)+?(?<![\s\\])\$(?!\d)/g,
      " ",
    )
    .replace(/\\\\\[[\s\S]*?\\\\\]/g, "")
    .replace(/\\\\\([\s\S]*?\\\\\)/g, "")
    .replace(/\{\{<[\s\S]*?>\}\}/g, "")
    .replace(/<[^>]+>/g, " ");
  const tree = unified().use(remarkParse).use(remarkGfm).parse(cleaned);
  visit(tree as unknown as Root, (node: any, index, parent: any) => {
    if (
      (node.type === "footnoteDefinition" ||
        node.type === "footnoteReference") &&
      parent &&
      typeof index === "number"
    ) {
      parent.children.splice(index, 1);
      return [SKIP, index];
    }
  });
  return mdToString(tree as any)
    .replace(/\s+/g, " ")
    .trim();
}

/** Word-boundary truncation with an ellipsis, like Hugo's `truncate`. */
export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > 0 ? cut.slice(0, sp) : cut) + "…";
}
