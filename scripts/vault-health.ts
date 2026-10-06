// Build-time vault health report for /admin:
//
//   data/vault-health.json — broken note links, near-empty notes, missing
//   frontmatter, broken pronunciation clips, notes mostly in English.
//
// Written to data/ (baked into the image next to rag-chunks.json), NOT to
// out/: it's served only through the admin-gated GET /api/admin/vault-health.
// Run with tsx so it resolves links with the site's own lib/content.ts and
// lib/vault-assets.ts — a link this report calls broken is one the rendered
// page leaves broken. Detection logic lives in lib/vault-health.ts (unit-tested).

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  getPostSlugs,
  getPost,
  getPrereqCycles,
  getUnresolvedPrereqs,
  resolveRelativeNoteLink,
  resolveWikiLink,
} from "../lib/content";
import { resolveVaultAsset, resolveVaultAssetByName } from "../lib/vault-assets";
import {
  NEAR_EMPTY_CHARS,
  PREREQ_MISSING,
  bodyTextLength,
  extractAudioRefs,
  extractNoteLinks,
  isLfsPointer,
  isMostlyEnglish,
  missingFields,
  stopwordScore,
} from "../lib/vault-health";

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, "content", "posts");
const OUT = path.join(ROOT, "data", "vault-health.json");

interface NoteRef {
  slug: string;
  title: string;
}

const report = {
  generatedAt: new Date().toISOString(),
  notes: 0,
  brokenLinks: [] as (NoteRef & { links: { kind: string; target: string; reason: string }[] })[],
  nearEmpty: [] as (NoteRef & { chars: number })[],
  frontmatter: [] as (NoteRef & { missing: string[]; none: boolean })[],
  audio: [] as (NoteRef & { clips: { src: string; problem: "missing" | "empty" | "lfs" }[] })[],
  english: [] as (NoteRef & { en: number; fr: number; es: number; ratio: number })[],
  /** `prerequis` cycles: the notes involved and the relations /parcours/
   *  ignored to put them in a reading order. */
  prereqCycles: [] as { members: NoteRef[]; broken: [NoteRef, NoteRef][] }[],
};

const slugs = getPostSlugs();
const unresolvedPrereqs = getUnresolvedPrereqs();
// rawPath (lowercase) → slug, for note-relative markdown links.

function assetFile(url: string): string {
  return path.join(POSTS_DIR, decodeURIComponent(url.slice("/vault/".length)));
}

for (const slug of slugs) {
  const doc = getPost(slug);
  const ref: NoteRef = { slug, title: doc.frontmatter.title };
  const dir = doc.rawPath.includes("/") ? doc.rawPath.slice(0, doc.rawPath.lastIndexOf("/")) : "";
  report.notes++;

  // --- frontmatter (from the raw file: getPost() backfills a missing title)
  const raw = fs.readFileSync(path.join(POSTS_DIR, `${doc.rawPath}.md`), "utf8");
  const hasFm = /^(---|\+\+\+)\r?\n/.test(raw);
  const data = !hasFm
    ? {}
    : raw.startsWith("+++")
      ? (doc.frontmatter as unknown as Record<string, unknown>)
      : (matter(raw).data as Record<string, unknown>);
  const missing = missingFields(data);
  if (missing.length) report.frontmatter.push({ ...ref, missing, none: !hasFm });

  // --- near-empty
  const chars = bodyTextLength(doc.body);
  if (chars < NEAR_EMPTY_CHARS) report.nearEmpty.push({ ...ref, chars });

  // --- links to notes
  const broken: { kind: string; target: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const link of extractNoteLinks(doc.body)) {
    const key = `${link.kind}:${link.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (link.kind === "wikilink") {
      if (!resolveWikiLink(link.target)) {
        broken.push({ ...link, reason: "note introuvable" });
      }
    } else {
      // The renderer points a relative `.md` href at the note's page, so only
      // one that names no note is broken.
      if (!resolveRelativeNoteLink(dir, link.target)) {
        broken.push({ ...link, reason: "note introuvable" });
      }
    }
  }
  // `prerequis:` entries naming no published note: the "À lire avant" block
  // silently leaves them out, so this is the only place they show up.
  for (const target of unresolvedPrereqs.get(slug) ?? []) {
    broken.push({ kind: "prerequis", target, reason: PREREQ_MISSING });
  }
  if (broken.length) report.brokenLinks.push({ ...ref, links: broken });

  // --- pronunciation clips
  const clips: { src: string; problem: "missing" | "empty" | "lfs" }[] = [];
  for (const src of new Set(extractAudioRefs(doc.body))) {
    // Bare names come from `![[clip.mp3]]`, which Obsidian (and
    // resolveWikiLink) match anywhere in the vault.
    const url =
      resolveVaultAsset(src, dir) ?? (src.includes("/") ? null : resolveVaultAssetByName(src));
    if (!url) {
      clips.push({ src, problem: "missing" });
      continue;
    }
    try {
      const file = assetFile(url);
      const size = fs.statSync(file).size;
      if (size === 0) clips.push({ src, problem: "empty" });
      else if (size < 1024) {
        const head = fs.readFileSync(file, "utf8").slice(0, 64);
        if (isLfsPointer(head)) clips.push({ src, problem: "lfs" });
      }
    } catch {
      clips.push({ src, problem: "missing" });
    }
  }
  if (clips.length) report.audio.push({ ...ref, clips });

  // --- language (a note that declares `lang` is foreign on purpose, and the
  // English course's examples are English by design, around French notes)
  const englishCourse = /(^|\/)Languages - Dialects\/Anglais\//i.test(doc.rawPath);
  if (!doc.frontmatter.lang && !englishCourse && isMostlyEnglish(doc.body)) {
    const s = stopwordScore(doc.body);
    report.english.push({ ...ref, en: s.en, fr: s.fr, es: s.es, ratio: Math.round(s.enRatio * 100) / 100 });
  }
}

const byTitle = (a: NoteRef, b: NoteRef) => a.title.localeCompare(b.title, "fr");
report.brokenLinks.sort(byTitle);
report.nearEmpty.sort((a, b) => a.chars - b.chars || byTitle(a, b));
report.frontmatter.sort(byTitle);
report.audio.sort(byTitle);
report.english.sort((a, b) => b.ratio - a.ratio || byTitle(a, b));

report.prereqCycles = getPrereqCycles();

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report));
console.log(
  `Vault health -> data/vault-health.json (${report.notes} notes: ` +
    `${report.brokenLinks.length} with broken links, ${report.nearEmpty.length} near-empty, ` +
    `${report.frontmatter.length} frontmatter gaps, ${report.audio.length} with bad audio, ` +
    `${report.english.length} mostly English, ${report.prereqCycles.length} prerequisite cycles)`,
);
