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
const IGNORE_DIRS = new Set(["sources", ".obsidian", ".trash"]);
const INDEX_NOTE = "Garden of Knowledge";
const CHUNK_CHARS = 900;
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

function toPlainText(md) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\$\$[\s\S]+?\$\$/g, " ")
    .replace(/(?<![\d\\$])\$(?![\s$])(?:[^$\n]|\\\$)+?(?<![\s\\])\$(?!\d)/g, " ")
    .replace(/\\\[[\s\S]*?\\\]/g, " ")
    .replace(/\\\([\s\S]*?\\\)/g, " ")
    .replace(/!\[\[[^\]]*\]\]/g, " ")
    .replace(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>#~]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunk(text) {
  const out = [];
  const paragraphs = text.split(/(?<=[.!?])\s+|\n+/);
  let buf = "";
  for (const p of paragraphs) {
    if (!p) continue;
    if ((buf + " " + p).length > CHUNK_CHARS && buf) {
      out.push(buf.trim());
      buf = p;
    } else {
      buf = buf ? `${buf} ${p}` : p;
    }
  }
  if (buf.trim()) out.push(buf.trim());
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
  chunk(toPlainText(body)).forEach((text, i) =>
    records.push({ id: idFor(slug, i), text, title, url }),
  );
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(records));
console.log(`build-rag-chunks: wrote ${records.length} chunk(s) → ${path.relative(process.cwd(), OUT)}`);
