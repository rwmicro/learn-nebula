// Authenticated GitHub REST calls for /admin's write actions:
//
//   - "Reconstruire le site": dispatch .github/workflows/docker.yml on
//     GITHUB_REPO and list its latest runs (GITHUB_TOKEN, Actions read/write);
//   - "Accepter" a prerequisite suggestion: commit the frontmatter edit
//     (lib/prereq-frontmatter.ts) to the vault on a new branch and open one PR
//     (PENSINE_TOKEN, Contents + Pull requests write on PENSINE_REPO).
//
// server/version.ts keeps its own unauthenticated read for the version card.
// Every call goes through the global fetch, which the tests stub.

import crypto from "node:crypto";
import { env } from "./env.ts";
import { addPrereqLinks } from "../lib/prereq-frontmatter.ts";

const API = "https://api.github.com";
const TIMEOUT_MS = 10_000;
export const REBUILD_WORKFLOW = "docker.yml";
const BASE_BRANCH = "main";

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function gh<T>(token: string, method: string, pathname: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "learn-nebula-admin",
      "x-github-api-version": "2022-11-28",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) {
    let detail = "";
    try {
      detail = ((await r.json()) as { message?: string }).message ?? "";
    } catch {
      /* no JSON body */
    }
    throw new GitHubError(r.status, `GitHub ${method} ${pathname}: HTTP ${r.status}${detail ? ` — ${detail}` : ""}`);
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

// --- rebuild -----------------------------------------------------------------

export interface BuildRun {
  id: number;
  status: string | null;
  conclusion: string | null;
  event: string | null;
  created_at: string;
  html_url: string;
  title: string | null;
}

/** workflow_dispatch on the image workflow (it declares the trigger). */
export async function dispatchRebuild(): Promise<void> {
  await gh(env.githubToken, "POST", `/repos/${env.githubRepo}/actions/workflows/${REBUILD_WORKFLOW}/dispatches`, {
    ref: BASE_BRANCH,
  });
}

export async function latestBuilds(limit = 5): Promise<BuildRun[]> {
  const res = await gh<{ workflow_runs?: Record<string, unknown>[] }>(
    env.githubToken,
    "GET",
    `/repos/${env.githubRepo}/actions/workflows/${REBUILD_WORKFLOW}/runs?per_page=${limit}`,
  );
  return (res.workflow_runs ?? []).slice(0, limit).map((r) => ({
    id: Number(r.id),
    status: (r.status as string) ?? null,
    conclusion: (r.conclusion as string) ?? null,
    event: (r.event as string) ?? null,
    created_at: String(r.created_at ?? ""),
    html_url: String(r.html_url ?? ""),
    title: (r.display_title as string) ?? null,
  }));
}

// --- prerequisite PR -----------------------------------------------------------

export interface PrereqItem {
  notePath: string;
  link: string;
}

export interface PrereqPrResult {
  url: string | null;
  branch: string | null;
  /** Per note: what was added, and what was already there. */
  notes: { notePath: string; added: string[]; skipped: string[] }[];
}

const MAX_ITEMS = 50;

/** Validated items, or a French error message for the admin. */
export function validatePrereqItems(raw: unknown): PrereqItem[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return "Aucune suggestion à accepter.";
  if (raw.length > MAX_ITEMS) return `Au plus ${MAX_ITEMS} suggestions à la fois.`;
  const out: PrereqItem[] = [];
  for (const it of raw) {
    const notePath = typeof it?.notePath === "string" ? it.notePath.trim() : "";
    const link = typeof it?.link === "string" ? it.link.trim() : "";
    if (
      !notePath ||
      notePath.length > 400 ||
      !/\.md$/i.test(notePath) ||
      notePath.startsWith("/") ||
      notePath.split("/").some((seg: string) => seg === ".." || seg === "." || seg === "") ||
      /[\u0000-\u001f\\]/.test(notePath)
    ) {
      return `Chemin de note invalide : ${notePath.slice(0, 80) || "(vide)"}`;
    }
    if (!link || link.length > 300 || /[\u0000-\u001f]/.test(link) || /[[\]]/.test(link.replace(/^\[\[|\]\]$/g, ""))) {
      return `Lien invalide : ${link.slice(0, 80) || "(vide)"}`;
    }
    out.push({ notePath, link });
  }
  return out;
}

/** `prereq/2026-10-06-ab12cd3`. */
export function prereqBranchName(items: PrereqItem[], now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  const short = crypto
    .createHash("sha1")
    .update(JSON.stringify(items) + now.getTime())
    .digest("hex")
    .slice(0, 7);
  return `prereq/${date}-${short}`;
}

/** Edit every note, commit them all at once on a new branch off main, open
 *  one PR. Returns url null (and touches nothing) when every link was already
 *  listed. */
export async function openPrereqPr(items: PrereqItem[], now = new Date()): Promise<PrereqPrResult> {
  const token = env.pensineToken;
  const repo = env.pensineRepo;
  const byNote = new Map<string, string[]>();
  for (const it of items) byNote.set(it.notePath, [...(byNote.get(it.notePath) ?? []), it.link]);

  const notes: PrereqPrResult["notes"] = [];
  const files: { path: string; text: string }[] = [];
  for (const [notePath, links] of byNote) {
    const file = await gh<{ content?: string; encoding?: string; type?: string }>(
      token,
      "GET",
      `/repos/${repo}/contents/${encodePath(notePath)}?ref=${BASE_BRANCH}`,
    );
    if (file.type && file.type !== "file") throw new GitHubError(422, `${notePath} n'est pas un fichier.`);
    const source = Buffer.from(file.content ?? "", (file.encoding as BufferEncoding) || "base64").toString("utf8");
    const edit = addPrereqLinks(source, links);
    notes.push({ notePath, added: edit.added, skipped: edit.skipped });
    if (edit.added.length) files.push({ path: notePath, text: edit.text });
  }
  if (!files.length) return { url: null, branch: null, notes };

  const ref = await gh<{ object: { sha: string } }>(token, "GET", `/repos/${repo}/git/ref/heads/${BASE_BRANCH}`);
  const baseSha = ref.object.sha;
  const baseCommit = await gh<{ tree: { sha: string } }>(token, "GET", `/repos/${repo}/git/commits/${baseSha}`);

  // Blobs as base64, so the bytes land exactly as edited (CRLF, BOM).
  const tree: { path: string; mode: string; type: string; sha: string }[] = [];
  for (const f of files) {
    const blob = await gh<{ sha: string }>(token, "POST", `/repos/${repo}/git/blobs`, {
      content: Buffer.from(f.text, "utf8").toString("base64"),
      encoding: "base64",
    });
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const newTree = await gh<{ sha: string }>(token, "POST", `/repos/${repo}/git/trees`, {
    base_tree: baseCommit.tree.sha,
    tree,
  });

  const total = notes.reduce((n, x) => n + x.added.length, 0);
  const title =
    files.length === 1
      ? `prerequis: ${notes.find((n) => n.added.length)!.added.join(", ")} → ${noteName(files[0].path)}`
      : `prerequis: ${total} ajouts sur ${files.length} notes`;
  const commit = await gh<{ sha: string }>(token, "POST", `/repos/${repo}/git/commits`, {
    message: `${title}\n\nAcceptées depuis /admin (Prérequis suggérés).`,
    tree: newTree.sha,
    parents: [baseSha],
  });

  const branch = prereqBranchName(items, now);
  await gh(token, "POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });

  const body = [
    "Prérequis acceptés depuis la page /admin du site (« Prérequis suggérés »).",
    "",
    ...notes
      .filter((n) => n.added.length)
      .map((n) => `- \`${n.notePath}\` : ${n.added.map((a) => `\`${a}\``).join(", ")}`),
    ...(notes.some((n) => n.skipped.length)
      ? ["", "Déjà présents (ignorés) :", ...notes.filter((n) => n.skipped.length).map((n) => `- \`${n.notePath}\` : ${n.skipped.join(", ")}`)]
      : []),
  ].join("\n");
  const pr = await gh<{ html_url: string }>(token, "POST", `/repos/${repo}/pulls`, {
    title,
    head: branch,
    base: BASE_BRANCH,
    body,
  });
  return { url: pr.html_url, branch, notes };
}

function noteName(p: string): string {
  return (p.split("/").pop() ?? p).replace(/\.md$/i, "");
}
