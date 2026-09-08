// Clones the notes vault from an external git repository into content/posts/
// at build time, so the notes live in their own repo (pensine). Runs as part
// of `npm run build`; on Cloudflare this is what populates content/posts.
//
// Defaults to the public pensine repo, so no configuration is required.
// Override via env if needed:
//   NOTES_REPO_URL    clone URL (default: pensine)
//   NOTES_REPO_TOKEN  a GitHub PAT / deploy token (for private repos)
//   NOTES_REPO_BRANCH branch to clone (default: main)
//   NOTES_SUBDIR      sub-path inside the repo to use as content/posts
//                     (default: repo root)
//   NOTES_CACHE_DIR   where to keep the persistent clone (default: .cache/pensine)
//
// The clone is kept (not thrown away) at NOTES_CACHE_DIR and updated in place
// on every run instead of re-cloned from scratch: the vault stores pronunciation
// audio (.mp3, ~10k files / ~220MB) via git-lfs, and a throwaway clone re-pulls
// ALL of it on every single build — local, every CI run, every image build —
// which is what actually exhausts a GitHub account's (shared, finite) LFS
// bandwidth quota. Reusing the clone means git-lfs's own content-addressed
// object store only downloads audio that's new or changed since last time. CI
// persists NOTES_CACHE_DIR across runs via actions/cache (see ci.yml/docker.yml).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const url = process.env.NOTES_REPO_URL || "https://github.com/rwmicro/pensine.git";

const token = process.env.NOTES_REPO_TOKEN;
const branch = process.env.NOTES_REPO_BRANCH || "main";
const subdir = process.env.NOTES_SUBDIR || "";

// Inject the token into the clone URL for private repos, without printing it.
let cloneUrl = url;
if (token && url.startsWith("https://")) {
  cloneUrl = url.replace("https://", `https://x-access-token:${token}@`);
}

const ROOT = process.cwd();
const DEST = path.join(ROOT, "content", "posts");
const cache = process.env.NOTES_CACHE_DIR || path.join(ROOT, ".cache", "pensine");

// A normal checkout (clone, or reset --hard onto a new tree) smudges EVERY
// LFS-tracked file it touches, ignoring the --include scoping below — so
// without this, every run silently re-downloads the vault's ~700MB of Anki
// .apkg decks on top of the audio, even though the build never uses them.
// Skipping smudge here leaves LFS files as pointer stubs; only the explicit,
// scoped `lfs pull --include=*.mp3` further down fetches real content.
const noSmudgeEnv = { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" };

if (fs.existsSync(path.join(cache, ".git"))) {
  console.log(`Updating cached notes clone (${branch}) at ${cache} ...`);
  // Shallow history means a plain `fetch` can fail once the remote has moved
  // far enough ahead; re-fetching depth 1 and resetting onto it always works
  // and still only transfers the (small, non-LFS) commit/tree delta.
  execFileSync("git", ["-C", cache, "fetch", "--depth", "1", cloneUrl, branch], {
    stdio: ["ignore", "inherit", "inherit"],
    env: noSmudgeEnv,
  });
  execFileSync("git", ["-C", cache, "reset", "--hard", "FETCH_HEAD"], {
    stdio: ["ignore", "inherit", "inherit"],
    env: noSmudgeEnv,
  });
} else {
  console.log(`Cloning notes (${branch}) from ${url} ...`);
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  execFileSync(
    "git",
    ["clone", "--depth", "1", "--branch", branch, cloneUrl, cache],
    { stdio: ["ignore", "inherit", "inherit"], env: noSmudgeEnv },
  );
}

// Pronunciation audio (.mp3) is stored in the vault via git-lfs. A plain
// clone/fetch only fetches LFS *pointer* files unless git-lfs smudges them,
// which would leave broken audio players on the site. Pull the real objects
// explicitly, scoped to *.mp3: the vault also keeps large Anki decks (.apkg)
// in LFS that the build doesn't need, so --include avoids downloading them.
// Objects already present locally (from a previous run) are skipped by
// git-lfs itself. Requires git-lfs in the build image; failure is warned
// (text notes still deploy).
try {
  execFileSync("git", ["-C", cache, "lfs", "install", "--local"], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  execFileSync("git", ["-C", cache, "lfs", "pull", "--include=*.mp3"], {
    stdio: ["ignore", "inherit", "inherit"],
  });
} catch (err) {
  console.warn(
    "WARNING: git-lfs pull failed — LFS assets (audio clips, Anki decks) may " +
      "be missing or left as pointer files. Ensure git-lfs is available in " +
      `the build image.\n${err?.message ?? err}`,
  );
}

const src = subdir ? path.join(cache, subdir) : cache;
if (!fs.existsSync(src)) {
  throw new Error(`NOTES_SUBDIR "${subdir}" not found in repo.`);
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(path.dirname(DEST), { recursive: true });
// Copy everything except the cloned .git metadata.
fs.cpSync(src, DEST, {
  recursive: true,
  filter: (s) => path.basename(s) !== ".git",
});
console.log(`Notes -> content/posts/`);
