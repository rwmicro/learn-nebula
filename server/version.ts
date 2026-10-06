// "Is the live site up to date with the vault?" for /admin.
//
// The build records what it was made of (scripts/build-info.mjs →
// data/build-info.json, baked into the image); this compares the vault commit
// it served with pensine's latest commit on GitHub. Unauthenticated GitHub API
// (60 requests/hour/IP), so results are cached for CACHE_MS and only fetched
// when an admin actually asks. Every failure degrades to "unknown" — the admin
// page must still load with GitHub down or the network blocked.

import fs from "node:fs";
import { env } from "./env.ts";

export interface BuildInfo {
  builtAt: string | null;
  site: { sha: string | null };
  pensine: {
    repo: string | null;
    branch: string;
    sha: string | null;
    date: string | null;
    subject: string | null;
  };
}

export interface LatestCommit {
  sha: string;
  date: string | null;
  subject: string | null;
}

export interface VersionStatus {
  build: BuildInfo | null;
  latest: LatestCommit | null;
  /** Commits on the branch since the served one; null when unknown. */
  behind: number | null;
  status: "up-to-date" | "behind" | "unknown";
  checkedAt: number | null;
}

const DEFAULT_REPO = "rwmicro/pensine";
const CACHE_MS = 10 * 60_000;
const TIMEOUT_MS = 5_000;

let buildCache: { mtime: number; info: BuildInfo | null } | null = null;

/** data/build-info.json, re-read only when the file changes. */
export function readBuildInfo(file = env.buildInfo): BuildInfo | null {
  try {
    const mtime = fs.statSync(file).mtimeMs;
    if (buildCache && buildCache.mtime === mtime) return buildCache.info;
    const info = JSON.parse(fs.readFileSync(file, "utf8")) as BuildInfo;
    buildCache = { mtime, info };
    return info;
  } catch {
    return null;
  }
}

async function github<T>(pathname: string): Promise<T> {
  const r = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "learn-nebula-admin",
      "x-github-api-version": "2022-11-28",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`GitHub ${pathname}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

interface GhCommit {
  sha: string;
  commit: { committer?: { date?: string }; author?: { date?: string }; message?: string };
}

// Keyed so a rebuilt image (different served sha) never reuses a stale "behind".
const latestCache = new Map<string, { at: number; value: LatestCommit }>();
const behindCache = new Map<string, { at: number; value: number }>();

async function latestCommit(repo: string, branch: string): Promise<LatestCommit | null> {
  const key = `${repo}@${branch}`;
  const hit = latestCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  try {
    const c = await github<GhCommit>(`/repos/${repo}/commits/${encodeURIComponent(branch)}`);
    const value: LatestCommit = {
      sha: c.sha,
      date: c.commit.committer?.date ?? c.commit.author?.date ?? null,
      subject: c.commit.message?.split("\n")[0] ?? null,
    };
    latestCache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    console.warn("version: latest commit lookup failed —", e instanceof Error ? e.message : e);
    return hit?.value ?? null; // a stale answer beats none
  }
}

async function commitsBehind(repo: string, base: string, head: string): Promise<number | null> {
  const key = `${repo}:${base}...${head}`;
  const hit = behindCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  try {
    const cmp = await github<{ ahead_by?: number }>(`/repos/${repo}/compare/${base}...${head}`);
    if (typeof cmp.ahead_by !== "number") return null;
    behindCache.set(key, { at: Date.now(), value: cmp.ahead_by });
    return cmp.ahead_by;
  } catch (e) {
    console.warn("version: compare failed —", e instanceof Error ? e.message : e);
    return hit?.value ?? null;
  }
}

const SHA_RE = /^[0-9a-f]{7,40}$/;

export async function versionStatus(): Promise<VersionStatus> {
  const build = readBuildInfo();
  const repo = build?.pensine.repo ?? DEFAULT_REPO;
  const branch = build?.pensine.branch || "main";
  const latest = await latestCommit(repo, branch);
  const served = build?.pensine.sha ?? null;

  let behind: number | null = null;
  let status: VersionStatus["status"] = "unknown";
  if (latest && served && SHA_RE.test(served)) {
    if (latest.sha === served) {
      behind = 0;
      status = "up-to-date";
    } else {
      status = "behind";
      behind = await commitsBehind(repo, served, latest.sha);
      // A served commit that is *ahead* (built from an unmerged branch) isn't
      // "behind" — compare reports ahead_by 0 for it.
      if (behind === 0) status = "up-to-date";
    }
  }
  const checked = latestCache.get(`${repo}@${branch}`)?.at ?? null;
  return { build, latest, behind, status, checkedAt: checked };
}
