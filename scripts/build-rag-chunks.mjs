// Build-time RAG chunk extraction for the self-hosted (Docker) backend.
//
// Walks content/posts/**, cleans + chunks each note, and writes
//   data/rag-chunks.json  — [{ id, text, title, url }]
// with NO embeddings. The Node server (server/rag.ts) embeds these at runtime
// through its OpenAI-compatible endpoint and caches the vectors on its volume —
// so CI needs no embedding service. Mirrors the chunking of the old
// scripts/index-notes.mjs (Cloudflare/Vectorize), which this replaces.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import matter from "gray-matter";
import * as TOML from "smol-toml";

const POSTS_DIR = path.join(process.cwd(), "content", "posts");
const OUT = path.join(process.cwd(), "data", "rag-chunks.json");
const IGNORE_DIRS = new Set(["sources", ".obsidian", ".trash", 'audio']);
const INDEX_NOTE = "Garden of Knowledge";
const CHUNK_CHARS = 1000;
const INCLUDE_DRAFTS = process.env.INCLUDE_DRAFTS === "true";

const tomlOptions = {
  delimiters: "+++",
  language: "toml",
  engines: {
    toml: { parse: (s) => TOML.parse(s), stringify: () => { throw new Error("no"); } },
  },
};

const slugifySegment = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const slugifyPath = (rel) => rel.split("/").map(slugifySegment).filter(Boolean).join("/");

function walkPosts(dir = POSTS_DIR, base = "") {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      out.push(...walkPosts(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith(".md")) {
      const slugless = rel.replace(/\.md$/, "");
      if (slugless !== INDEX_NOTE) out.push(slugless);
    }
  }
  return out;
}

function buildSlugMap() {
  const map = new Map();
  for (const rel of walkPosts().sort()) {
    const base = slugifyPath(rel) || "note";
    let slug = base;
    for (let i = 2; map.has(slug); i++) slug = `${base}-${i}`;
    map.set(slug, rel);
  }
  return map;
}

// ── Markdown → retrieval chunks ─────────────────────────────────────────────
//
// Structure-aware: the note is split at its headings, and every chunk opens with
// a breadcrumb line ("Title › Section › Subsection") so both the embedding and
// the LLM know where an excerpt comes from — a bare "ana · shift · bshūf" row
// means nothing without "Verbes — Arabe Libanais › Conjugaison". Within a
// section, paragraphs, list items and table rows are packed up to CHUNK_CHARS,
// and a chunk that continues the same section repeats the previous one's last
// sentence so a fact straddling the boundary stays retrievable from either side.

const MIN_CHUNK = 300; // a smaller section is packed with the next one
const OVERLAP_MAX = 220; // longest trailing sentence carried into the next chunk

/** Inline Markdown → plain text, keeping what carries meaning for retrieval. */
function inlineText(s) {
  return (
    s
      // Pronunciation clips `![كتب](audio/x.mp3)`: the alt IS the word (often
      // the only native-script form in the note) — keep it.
      .replace(/!\[([^\]]*)\]\([^)]*\.mp3\)/gi, "$1")
      .replace(/!\[\[[^\]]*\]\]/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]|#]+)(?:#[^\]]*)?\]\]/g, (_, t) => t.split("/").pop())
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Inline code and math keep their content (a formula or an identifier is
      // often exactly what a question names); only the delimiters go.
      .replace(/`([^`]*)`/g, "$1")
      .replace(/(?<![\d\\$])\$(?![\s$])((?:[^$\n]|\\\$)+?)(?<![\s\\])\$(?!\d)/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/==|\*\*|__|~~/g, "")
      .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, "$1$2")
      .replace(/\s+/g, " ")
      .trim()
  );
}

const splitRow = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => inlineText(c));

/** Parse a note body into sections of text units (paragraph / item / row). */
function sections(md) {
  const out = [];
  let heads = []; // heading texts by level (index 0 = level 1)
  let cur = { path: [], units: [] };
  let para = [];
  let table = null; // { header: string[] }
  let fence = null;
  let mathBlock = false;

  const flushPara = () => {
    const t = inlineText(para.join(" "));
    if (t) cur.units.push(t);
    para = [];
  };
  const newSection = (level, text) => {
    flushPara();
    if (cur.units.length) out.push(cur);
    heads = heads.slice(0, level - 1);
    heads[level - 1] = text;
    cur = { path: heads.filter(Boolean), units: [] };
  };

  for (const raw of md.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    // Fenced code / widgets and display math: skipped whole (noise for both
    // the embedder and the reader of an excerpt).
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      continue;
    }
    if (f) {
      flushPara();
      fence = f[1];
      continue;
    }
    if (mathBlock) {
      if (/\$\$\s*$/.test(line)) mathBlock = false;
      continue;
    }
    if (/^\s*\$\$/.test(line)) {
      flushPara();
      if (!/^\s*\$\$.*\$\$\s*$/.test(line.trim()) || line.trim() === "$$") mathBlock = true;
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      table = null;
      newSection(h[1].length, inlineText(h[2]));
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara();
      const cells = splitRow(line);
      if (cells.every((c) => /^:?-{2,}:?$/.test(c) || !c)) continue; // |---|---|
      if (!table) {
        table = { header: cells };
        continue;
      }
      // "Header: value" pairs, so a single row still reads on its own.
      const row = cells
        .map((c, i) => (c && table.header[i] ? `${table.header[i]} : ${c}` : c))
        .filter(Boolean)
        .join(" · ");
      if (row) cur.units.push(row);
      continue;
    }
    table = null;

    if (!line.trim()) {
      flushPara();
      continue;
    }
    // Blockquotes / callouts: drop the ">" and the [!type] marker, keep text.
    let text = line.replace(/^\s*(>\s?)+/, "").replace(/^\[![^\]]*\][+-]?\s*/, "");
    const item = text.match(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/);
    if (item) {
      flushPara();
      const t = inlineText(item[1]);
      if (t) cur.units.push(t);
      continue;
    }
    para.push(text);
  }
  flushPara();
  if (cur.units.length) out.push(cur);
  return out;
}

const sentences = (t) => t.split(/(?<=[.!?…])\s+/).filter(Boolean);

/** Pack a note's sections into chunks, each `{ crumb, body }`. */
function chunkNote(md) {
  const out = [];
  let buf = [];
  let len = 0;
  let paths = [];

  const flush = () => {
    if (!buf.length) return;
    out.push({ paths, body: buf.join("\n") });
    buf = [];
    len = 0;
    paths = [];
  };
  const add = (unit, path) => {
    const key = path.join(" › ");
    if (!paths.includes(key)) paths.push(key);
    buf.push(unit);
    len += unit.length + 1;
  };

  for (const sec of sections(md)) {
    // A new section starts a new chunk, unless what's buffered is too small to
    // stand alone (a heading with one line under it).
    if (len >= MIN_CHUNK) flush();
    for (const u of sec.units) {
      // Longer than a chunk on its own (a wall-of-text paragraph): split it.
      const parts = u.length > CHUNK_CHARS ? packSentences(sentences(u)) : [u];
      for (const part of parts) {
        if (len && len + part.length > CHUNK_CHARS) {
          const tail = sentences(buf[buf.length - 1]).pop() ?? "";
          flush();
          if (tail && tail.length <= OVERLAP_MAX && tail !== part) add(tail, sec.path);
        }
        add(part, sec.path);
      }
    }
  }
  flush();
  return out;
}

function packSentences(sents) {
  const out = [];
  let buf = "";
  for (const s of sents) {
    if (buf && buf.length + s.length + 1 > CHUNK_CHARS) {
      out.push(buf);
      buf = s;
    } else buf = buf ? `${buf} ${s}` : s;
  }
  if (buf) out.push(buf);
  return out;
}

const idFor = (slug, i) =>
  "c_" + crypto.createHash("sha256").update(`${slug}#${i}`).digest("hex").slice(0, 40);

if (!fs.existsSync(POSTS_DIR)) {
  console.warn("build-rag-chunks: no content/posts — writing empty index.");
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, "[]");
  process.exit(0);
}

const records = [];
for (const [slug, rawPath] of buildSlugMap()) {
  const raw = fs.readFileSync(path.join(POSTS_DIR, `${rawPath}.md`), "utf8");
  const { data, content } = raw.startsWith("+++") ? matter(raw, tomlOptions) : matter(raw);
  if (!INCLUDE_DRAFTS && data.draft) continue;
  const title =
    typeof data.title === "string" && data.title.trim()
      ? data.title
      : (rawPath.split("/").pop() ?? rawPath);
  const url = `/posts/${slug}/`;
  const body = content.replace(/^\s*#\s+[^\n]*\n?/, "");
  chunkNote(body).forEach(({ paths, body: text }, i) => {
    // A section packed with its own subsection reads as the subsection alone.
    const where = paths
      .filter((p) => p && !paths.some((q) => q !== p && q.startsWith(`${p} › `)))
      .join(" · ");
    const crumb = where ? `${title} › ${where}` : title;
    records.push({ id: idFor(slug, i), text: `${crumb}\n${text}`, title, url });
  });
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(records));
console.log(`build-rag-chunks: wrote ${records.length} chunk(s) → ${path.relative(process.cwd(), OUT)}`);
