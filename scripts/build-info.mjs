// Records what this build is made of, for /admin's "version en ligne" card:
//
//   data/build-info.json — { builtAt, site: { sha }, pensine: { repo, branch, sha, date, subject } }
//
// The server (server/version.ts) compares pensine.sha with the vault's latest
// commit on GitHub, so the owner can tell at a glance whether the running image
// is behind the notes. Runs right after fetch-notes.mjs, whose persistent clone
// (.cache/pensine, or NOTES_CACHE_DIR) is the source of the vault sha. Every
// part is optional: no git, no clone (e.g. a dev build reusing an existing
// content/posts) just leaves that field null — this script never fails a build.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "build-info.json");
const cache = process.env.NOTES_CACHE_DIR || path.join(ROOT, ".cache", "pensine");
const repoUrl = process.env.NOTES_REPO_URL || "https://github.com/rwmicro/pensine.git";
const branch = process.env.NOTES_REPO_BRANCH || "main";

function git(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/** "owner/name" for a github.com clone URL (the only host the server can
 *  query for the latest commit), else null. */
function githubRepo(url) {
  const m = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url);
  return m ? `${m[1]}/${m[2]}` : null;
}

const siteSha = process.env.GITHUB_SHA || git(["rev-parse", "HEAD"], ROOT);

let pensine = { repo: githubRepo(repoUrl), branch, sha: null, date: null, subject: null };
if (fs.existsSync(path.join(cache, ".git"))) {
  const log = git(["log", "-1", "--format=%H%n%cI%n%s"], cache);
  if (log) {
    const [sha, date, ...subject] = log.split("\n");
    pensine = { ...pensine, sha, date, subject: subject.join("\n") || null };
  }
}

const info = {
  builtAt: new Date().toISOString(),
  site: { sha: siteSha || null },
  pensine,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(info, null, 2) + "\n");
console.log(
  `Build info -> data/build-info.json (site ${info.site.sha?.slice(0, 7) ?? "?"}, ` +
    `pensine ${pensine.sha?.slice(0, 7) ?? "unknown — no clone at " + path.relative(ROOT, cache)})`,
);
