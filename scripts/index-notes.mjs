// Build-time semantic indexer for the RAG assistant.
//
// Walks content/posts/**, splits each note into chunks, embeds them with
// Cloudflare Workers AI (@cf/baai/bge-m3), and upserts the vectors into a
// Vectorize index. The /api/ask Function then queries that index at runtime.
//
// Needs three env vars (set them in the Cloudflare Pages build settings):
//   CLOUDFLARE_ACCOUNT_ID   your account id
//   CLOUDFLARE_API_TOKEN    token with Workers AI (Run) + Vectorize (Edit)
//   VECTORIZE_INDEX         index name (default: garden-notes)
// If any are missing it logs a warning and exits 0, so local/preview builds
// without credentials still succeed (the assistant just has nothing to retrieve).
//
// The slug/URL logic mirrors lib/content.ts so retrieved sources link correctly.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import matter from "gray-matter";
import * as TOML from "smol-toml";

// `+++ … +++` blocks are TOML (mirror of lib/content.ts); gray-matter has no
// built-in TOML engine, so without this it silently yields empty frontmatter —
// losing the title and, worse, the `draft` flag.
const tomlOptions = {
  delimiters: "+++",
  language: "toml",
  engines: {
    toml: {
      parse: (s) => TOML.parse(s),
      stringify: () => {
        throw new Error("TOML stringify is not supported");
      },
    },
  },
};

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const INDEX = process.env.VECTORIZE_INDEX || "garden-notes";
const INCLUDE_DRAFTS = process.env.INCLUDE_DRAFTS === "true";

if (!ACCOUNT || !TOKEN) {
  console.warn(
    "index-notes: CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN unset — skipping.",
  );
  process.exit(0);
}

const EMBED_MODEL = "@cf/baai/bge-m3";
const POSTS_DIR = path.join(process.cwd(), "content", "posts");
const IGNORE_DIRS = new Set(["sources", ".obsidian", ".trash"]);
const INDEX_NOTE = "Garden of Knowledge"; // rendered on the home page, not /posts/
const CHUNK_CHARS = 900;
const EMBED_BATCH = 50;
const UPSERT_BATCH = 500;

// --- slugging (mirror of lib/content.ts) ------------------------------------
const slugifySegment = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const slugifyPath = (rel) =>
  rel.split("/").map(slugifySegment).filter(Boolean).join("/");

function walkPosts(dir = POSTS_DIR, base = "") {
  const out = [];
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

// slug -> rawPath, with the same -2/-3 disambiguation the site uses.
function buildSlugMap() {
  const map = new Map();
  for (const rel of walkPosts().sort()) {
    const baseSlug = slugifyPath(rel) || "note";
    let slug = baseSlug;
    for (let i = 2; map.has(slug); i++) slug = `${baseSlug}-${i}`;
    map.set(slug, rel);
  }
  return map;
}

// --- text cleanup + chunking ------------------------------------------------
function toPlainText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ") // code fences
    .replace(/`[^`]*`/g, " ") // inline code
    .replace(/\$\$[\s\S]+?\$\$/g, " ") // display math $$…$$
    .replace(/(?<![\d\\$])\$(?![\s$])(?:[^$\n]|\\\$)+?(?<![\s\\])\$(?!\d)/g, " ") // inline $…$ (skip prose prices)
    .replace(/\\\[[\s\S]*?\\\]/g, " ") // display math \[ … \]
    .replace(/\\\([\s\S]*?\\\)/g, " ") // inline math \( … \)
    .replace(/!\[\[[^\]]*\]\]/g, " ") // embeds
    .replace(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g, "$1") // wikilinks -> target
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/^#{1,6}\s+/gm, "") // heading hashes
    .replace(/[*_>#~]/g, " ") // stray markdown punctuation
    .replace(/<[^>]+>/g, " ") // html
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

// --- Cloudflare REST helpers ------------------------------------------------
const CF = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;

async function embed(texts) {
  const res = await fetch(`${CF}/ai/run/${EMBED_MODEL}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ text: texts }),
  });
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(
      `embed failed: ${res.status} ${JSON.stringify(body.errors ?? body)}`,
    );
  }
  return body.result.data; // number[][]
}

async function upsert(ndjson) {
  const res = await fetch(`${CF}/vectorize/v2/indexes/${INDEX}/upsert`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/x-ndjson",
    },
    body: ndjson,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(
      `upsert failed: ${res.status} ${JSON.stringify(body.errors ?? body)}`,
    );
  }
}

async function deleteVectors(ids) {
  const res = await fetch(`${CF}/vectorize/v2/indexes/${INDEX}/delete_by_ids`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ids }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(
      `delete failed: ${res.status} ${JSON.stringify(body.errors ?? body)}`,
    );
  }
}

const idFor = (slug, i) =>
  "c_" +
  crypto.createHash("sha256").update(`${slug}#${i}`).digest("hex").slice(0, 40);

// --- main -------------------------------------------------------------------
if (!fs.existsSync(POSTS_DIR)) {
  console.warn("index-notes: no content/posts — skipping.");
  process.exit(0);
}

const records = []; // { id, text, title, url }
for (const [slug, rawPath] of buildSlugMap()) {
  const raw = fs.readFileSync(path.join(POSTS_DIR, `${rawPath}.md`), "utf8");
  const { data, content } = raw.startsWith("+++")
    ? matter(raw, tomlOptions)
    : matter(raw);
  if (!INCLUDE_DRAFTS && data.draft) continue;

  const title =
    typeof data.title === "string" && data.title.trim()
      ? data.title
      : (rawPath.split("/").pop() ?? rawPath);
  const url = `/posts/${slug}/`;
  const body = content.replace(/^\s*#\s+[^\n]*\n?/, ""); // drop leading H1 like the site
  const chunks = chunk(toPlainText(body));
  chunks.forEach((text, i) =>
    records.push({ id: idFor(slug, i), text, title, url }),
  );
}

if (!records.length) {
  console.log("index-notes: no note chunks to index.");
  process.exit(0);
}

// --- incremental: only (re)embed chunks whose text changed since last run ----
// The manifest (id -> sha256(text)) is persisted between builds; in CI it is
// restored/saved via actions/cache. On a cache miss (empty manifest) everything
// is re-embedded, which is always safe. Set FORCE_REINDEX=true to ignore it
// (e.g. after recreating/wiping the Vectorize index).
const MANIFEST_PATH = path.join(process.cwd(), ".cache", "index-manifest.json");
const FORCE_REINDEX = process.env.FORCE_REINDEX === "true";
const hashText = (t) => crypto.createHash("sha256").update(t).digest("hex");

let oldManifest = {};
if (!FORCE_REINDEX) {
  try {
    oldManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    oldManifest = {}; // missing/invalid manifest -> full reindex
  }
}

const manifest = {};
const toIndex = [];
for (const r of records) {
  const h = hashText(r.text);
  manifest[r.id] = h;
  if (oldManifest[r.id] !== h) toIndex.push(r);
}

// Chunks present last run but gone now (note deleted/renamed, or shortened so a
// trailing chunk id disappeared). Their vectors otherwise linger in Vectorize
// and keep surfacing as sources that 404. Only detectable with a manifest cache
// (an empty oldManifest — cache miss or FORCE_REINDEX — leaves nothing to diff).
const orphanIds = Object.keys(oldManifest).filter((id) => !(id in manifest));

function writeManifest() {
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest));
}

async function purgeOrphans() {
  if (!orphanIds.length) return;
  for (let i = 0; i < orphanIds.length; i += UPSERT_BATCH) {
    await deleteVectors(orphanIds.slice(i, i + UPSERT_BATCH));
  }
  console.log(`index-notes: removed ${orphanIds.length} orphaned vector(s).`);
}

if (!toIndex.length && !orphanIds.length) {
  writeManifest();
  console.log(
    `index-notes: ${records.length} chunk(s) unchanged — nothing to embed.`,
  );
  process.exit(0);
}

if (toIndex.length) {
  const skipped = records.length - toIndex.length;
  console.log(
    `index-notes: embedding ${toIndex.length} new/changed chunk(s)` +
      (skipped ? ` (${skipped} unchanged, skipped)` : "") +
      " from notes…",
  );

  // Embed in batches, then upsert in batches.
  let pending = [];
  const flushUpsert = async () => {
    if (!pending.length) return;
    await upsert(pending.map((v) => JSON.stringify(v)).join("\n"));
    pending = [];
  };

  for (let i = 0; i < toIndex.length; i += EMBED_BATCH) {
    const batch = toIndex.slice(i, i + EMBED_BATCH);
    const vectors = await embed(batch.map((r) => r.text));
    batch.forEach((r, j) => {
      pending.push({
        id: r.id,
        values: vectors[j],
        metadata: { title: r.title, url: r.url, text: r.text },
      });
    });
    if (pending.length >= UPSERT_BATCH) await flushUpsert();
  }
  await flushUpsert();
  console.log(
    `index-notes: upserted ${toIndex.length} vector(s) into "${INDEX}".`,
  );
}

await purgeOrphans();

// Only record success once vectors are actually upserted and orphans purged.
writeManifest();
