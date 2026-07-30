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

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "notes-"));

try {
  console.log(`Cloning notes (${branch}) from ${url} ...`);
  execFileSync(
    "git",
    ["clone", "--depth", "1", "--branch", branch, cloneUrl, tmp],
    { stdio: ["ignore", "inherit", "inherit"] },
  );

  // The vault stores audio clips (.mp3) and Anki decks (.apkg) via git-lfs.
  // A plain clone only fetches LFS *pointer* files unless git-lfs smudges them,
  // which would leave broken audio players and decks on the site. Pull the real
  // objects explicitly: `lfs install --local` registers the filters for this
  // clone, `lfs pull` downloads the objects for the checked-out tip. Requires
  // git-lfs in the build image; failure is warned (text notes still deploy).
  try {
    execFileSync("git", ["-C", tmp, "lfs", "install", "--local"], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    execFileSync("git", ["-C", tmp, "lfs", "pull"], {
      stdio: ["ignore", "inherit", "inherit"],
    });
  } catch (err) {
    console.warn(
      "WARNING: git-lfs pull failed — LFS assets (audio clips, Anki decks) may " +
        "be missing or left as pointer files. Ensure git-lfs is available in " +
        `the build image.\n${err?.message ?? err}`,
    );
  }

  const src = subdir ? path.join(tmp, subdir) : tmp;
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
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
