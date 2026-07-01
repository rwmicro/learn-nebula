/**
 * Obsidian Manim Renderer
 *
 * Renders ```manim``` fenced code blocks to videos / GIFs / single frames,
 * caching outputs at <vault>/<cacheDir>/<hash>.<ext> where
 * `hash = sha256(code.trim()).slice(0, 16)`.
 *
 * Pensine's `lib/markdown.ts` uses the same hash so the static-site build
 * picks up the same cache files at deploy time — no Manim on the build box.
 *
 * Per-block options can be embedded as a `# manim: key=value …` first-line
 * comment; the directive is part of `code.trim()`, so changing it produces a
 * fresh hash automatically.
 */

import {
  App,
  MarkdownPostProcessorContext,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath,
} from "obsidian";
import { createHash } from "node:crypto";
import { ChildProcess, spawn } from "node:child_process";
import type { Dirent } from "node:fs";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ManimFlavor = "ce" | "gl";
type Quality = "l" | "m" | "h" | "p" | "k";
type OutputFormat = "mp4" | "gif" | "png";

interface ManimSettings {
  flavor: ManimFlavor;
  /** ManimCE executable. Used when a block's effective flavor is CE — either
   *  via the global default or via a `# manim: flavor=ce` directive. */
  manimPathCe: string;
  /** ManimGL executable. Used when a block's effective flavor is GL. */
  manimPathGl: string;
  /** Legacy single-path setting, kept for backward compat. Migrated on load
   *  into the matching `manimPathCe` / `manimPathGl` slot. */
  manimPath?: string;
  cacheDir: string;
  defaultQuality: Quality;
  outputFormat: OutputFormat;
  background: string;
  autoRender: boolean;
  /** Max simultaneous manim processes — extra requests wait in a FIFO queue. */
  maxConcurrent: number;
}

const DEFAULT_SETTINGS: ManimSettings = {
  flavor: "ce",
  manimPathCe: "manim",
  manimPathGl: "manimgl",
  cacheDir: "_manim",
  defaultQuality: "l",
  outputFormat: "mp4",
  background: "",
  autoRender: false,
  maxConcurrent: 2,
};

/** Effective options for one block: defaults from settings, then overrides
 *  parsed from the first-line `# manim:` directive. */
interface BlockOptions {
  flavor: ManimFlavor;
  quality: Quality;
  format: OutputFormat;
  background: string;
  /** When set, render a single frame instead of a full animation. "last"
   *  uses Manim's `-s` (save last frame as image). */
  frame: "last" | null;
}

// ---------------------------------------------------------------------------
// Pure utilities
// ---------------------------------------------------------------------------

/** SHA-256 of the trimmed code, first 16 lowercase hex chars. Must match
 *  Pensine's `lib/markdown.ts` `manimHash`. Because the per-block directive
 *  (`# manim: …`) sits at the top of the code, changing it perturbs the hash
 *  → a fresh render is keyed under a new filename. */
function hashCode(code: string): string {
  return createHash("sha256")
    .update(code.trim(), "utf-8")
    .digest("hex")
    .slice(0, 16);
}

/** Scene-class extraction. Accepts single or multiple inheritance — picks the
 *  first class whose base list mentions a `*Scene`. */
function detectSceneName(code: string): string | null {
  // class Foo(MovingCameraScene): / class Foo(Bar, Scene): / class Foo(manimlib.Scene):
  const re = /class\s+(\w+)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (/\b(?:[\w.]*\.)?(\w*Scene)\b/.test(m[2])) return m[1];
  }
  return null;
}

const DIRECTIVE_RE = /^\s*#\s*manim\s*:\s*(.+?)\s*$/;

/** Parse the optional first-line `# manim: key=value …` directive. Unknown
 *  keys are ignored; bad values fall back to the default. After parsing we
 *  reconcile semantic conflicts (e.g. `frame=last` writes a PNG, so we force
 *  `format=png` even if the user kept `format=mp4`). */
function parseBlockOptions(code: string, defaults: BlockOptions): BlockOptions {
  const opts: BlockOptions = { ...defaults };
  // Scan up to the first non-blank line. Stop at the first non-comment.
  for (const line of code.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const m = line.match(DIRECTIVE_RE);
    if (!m) return reconcile(opts); // first non-blank line isn't a directive → done.
    for (const pair of m[1].split(/\s+/)) {
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const k = pair.slice(0, eq);
      const v = pair.slice(eq + 1);
      switch (k) {
        case "flavor":
          if (v === "ce" || v === "gl") opts.flavor = v;
          break;
        case "quality":
        case "q":
          if (["l", "m", "h", "p", "k"].includes(v)) opts.quality = v as Quality;
          break;
        case "format":
        case "f":
          if (["mp4", "gif", "png"].includes(v)) opts.format = v as OutputFormat;
          break;
        case "bg":
        case "background":
          opts.background = v;
          break;
        case "frame":
          if (v === "last") opts.frame = "last";
          break;
      }
    }
    return reconcile(opts);
  }
  return reconcile(opts);
}

/** Resolve directive combinations that don't make sense together. */
function reconcile(opts: BlockOptions): BlockOptions {
  // `-s` / `-o` writes a PNG — promote format to match so the cache lookup
  // (which keys on `<hash>.<format>`) finds the produced file.
  if (opts.frame === "last") opts.format = "png";
  // `format=png` implies the user wants a single-frame render even without
  // explicit `frame=last`.
  if (opts.format === "png" && opts.frame === null) opts.frame = "last";
  return opts;
}

interface ArgContext {
  tmpScript: string;
  tmpMedia: string;
  hash: string;
  opts: BlockOptions;
}

/** Build the argv for `manim` (CE). PNG output uses `-s` (save last frame as
 *  image) which writes a `.png` instead of a `.mp4`. */
function buildCeArgs(base: string[], scene: string | null, ctx: ArgContext): string[] {
  const args = [...base, ctx.tmpScript];
  if (scene) args.push(scene);
  args.push(`-q${ctx.opts.quality}`);
  args.push("--media_dir", ctx.tmpMedia);
  args.push("--output_file", ctx.hash);
  args.push("--disable_caching");
  if (ctx.opts.format === "gif") args.push("--format", "gif");
  if (ctx.opts.frame === "last" || ctx.opts.format === "png") args.push("-s");
  if (ctx.opts.background) args.push("-c", ctx.opts.background);
  return args;
}

/** Build the argv for `manimgl` (3Blue1Brown). ManimGL's CLI is smaller than
 *  ManimCE's — notably:
 *    • Progress bars are off by default (no `--hide_animation_progress`).
 *    • No `--format` flag — GIF output isn't supported natively.
 *    • `-w` writes an animation, `-o` writes a single frame; mutually exclusive. */
function buildGlArgs(base: string[], scene: string | null, ctx: ArgContext): string[] {
  const args = [...base, ctx.tmpScript];
  if (scene) args.push(scene);
  if (ctx.opts.frame === "last" || ctx.opts.format === "png") args.push("-o");
  else args.push("-w");
  switch (ctx.opts.quality) {
    case "l": args.push("-l"); break;
    case "m": args.push("-m"); break;
    case "h":
    case "p":
      args.push("--hd"); break;
    case "k": args.push("--uhd"); break;
  }
  args.push("--video_dir", ctx.tmpMedia);
  args.push("--file_name", ctx.hash);
  if (ctx.opts.background) args.push("-c", ctx.opts.background);
  return args;
}

/** rename() falls back to copy+unlink when source and destination live on
 *  different filesystems (Linux returns EXDEV). Happens when /tmp is tmpfs
 *  and the vault lives on the home partition. */
function moveAcrossDevices(src: string, dest: string): void {
  try {
    renameSync(src, dest);
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "EXDEV") {
      copyFileSync(src, dest);
      try { unlinkSync(src); } catch { /* best effort */ }
      return;
    }
    throw e;
  }
}

/** Recursively find a file by exact name under `dir`. */
function findFile(dir: string, name: string): string | null {
  if (!existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: Dirent[];
    try {
      entries = readdirSync(cur, { withFileTypes: true }) as unknown as Dirent[];
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(cur, String(entry.name));
      if (entry.isDirectory()) stack.push(full);
      else if (String(entry.name) === name) return full;
    }
  }
  return null;
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

// ---------------------------------------------------------------------------
// Concurrency limiter — N parallel acquirers max, FIFO waitlist.
// ---------------------------------------------------------------------------

type Release = () => void;

class RenderQueue {
  private running = 0;
  private waiting: Array<(release: Release) => void> = [];
  private listeners = new Set<() => void>();
  constructor(private max: number) {}
  setMax(n: number) {
    this.max = Math.max(1, n);
    this.drain();
  }
  /** Resolves when a slot opens. Caller must invoke the returned release fn. */
  acquire(): Promise<Release> {
    return new Promise<Release>((resolve) => {
      const grant = () => {
        this.running++;
        this.emit();
        resolve(() => {
          this.running--;
          this.emit();
          this.drain();
        });
      };
      if (this.running < this.max) grant();
      else this.waiting.push(grant);
    });
  }
  private drain() {
    while (this.running < this.max && this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      next(() => undefined);
    }
  }
  stats() {
    return { running: this.running, waiting: this.waiting.length };
  }
  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const fn of this.listeners) fn();
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

interface RenderHandle {
  promise: Promise<void>;
  /** Latest stderr line received from manim. Updated live. */
  liveLog: { text: string };
  /** Set once the child has actually spawned, so cancel() can kill it. */
  child: { current: ChildProcess | null };
  /** Cancellation request. Honoured at two points: by the queued runner
   *  (before spawn) and by SIGTERMing the child (after spawn). */
  cancel: () => void;
  cancelled: { value: boolean };
}

export default class ManimPlugin extends Plugin {
  settings!: ManimSettings;
  private queue!: RenderQueue;
  /** In-flight handles keyed by hash — dedups concurrent calls for the same
   *  block and lets the UI subscribe to the live stderr / cancel the child. */
  private inflight = new Map<string, RenderHandle>();
  /** Last failure stderr per hash, kept across reading-view re-renders so the
   *  user can read the full error without it auto-dismissing. */
  private lastErrors = new Map<string, string>();
  private statusBarEl: HTMLElement | null = null;

  async onload() {
    await this.loadSettings();
    this.queue = new RenderQueue(this.settings.maxConcurrent);

    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass("manim-statusbar");
    this.statusBarEl.style.display = "none";
    this.queue.onChange(() => this.updateStatusBar());
    this.updateStatusBar();

    this.registerMarkdownCodeBlockProcessor("manim", this.processBlock.bind(this));
    this.addSettingTab(new ManimSettingTab(this.app, this));

    this.addCommand({
      id: "manim-rerender-active",
      name: "Re-render all Manim blocks in the active note",
      callback: () => this.rerenderActive(),
    });
    this.addCommand({
      id: "manim-garbage-collect",
      name: "Garbage-collect orphaned Manim cache files",
      callback: () => this.garbageCollect(),
    });
    this.addCommand({
      id: "manim-cache-stats",
      name: "Show Manim cache stats",
      callback: () => this.showCacheStats(),
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // Migrate legacy single-path setting → matching flavor slot.
    if (this.settings.manimPath) {
      if (this.settings.flavor === "gl") {
        this.settings.manimPathGl = this.settings.manimPath;
      } else {
        this.settings.manimPathCe = this.settings.manimPath;
      }
      delete this.settings.manimPath;
      await this.saveData(this.settings);
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.queue?.setMax(this.settings.maxConcurrent);
  }

  // ── Path helpers ──────────────────────────────────────────────────────────

  private vaultRoot(): string {
    const adapter = this.app.vault.adapter as unknown as { basePath?: string };
    if (!adapter.basePath) throw new Error("Vault root unavailable (mobile?)");
    return adapter.basePath;
  }
  private cacheDirAbs(): string {
    return join(this.vaultRoot(), normalizePath(this.settings.cacheDir));
  }
  private outputPath(hash: string, format: OutputFormat): string {
    return join(this.cacheDirAbs(), `${hash}.${format}`);
  }
  private resourceUrlFor(hash: string, format: OutputFormat): string {
    const rel = `${normalizePath(this.settings.cacheDir)}/${hash}.${format}`;
    return this.app.vault.adapter.getResourcePath(rel);
  }

  private defaultOptions(): BlockOptions {
    return {
      flavor: this.settings.flavor,
      quality: this.settings.defaultQuality,
      format: this.settings.outputFormat,
      background: this.settings.background,
      frame: null,
    };
  }

  // ── Block processor (UI) ──────────────────────────────────────────────────

  private async processBlock(
    source: string,
    el: HTMLElement,
    _ctx: MarkdownPostProcessorContext,
  ) {
    const opts = parseBlockOptions(source, this.defaultOptions());
    const hash = hashCode(source);
    const outputAbs = this.outputPath(hash, opts.format);

    const container = el.createDiv({ cls: "manim-block" });

    // Source preview (collapsible) — always rendered first so it stays visible
    // even when the video is on screen.
    const details = container.createEl("details", { cls: "manim-source" });
    details.createEl("summary", { text: `Source · ${hash}` });
    const pre = details.createEl("pre");
    pre.createEl("code", { cls: "language-python", text: source });

    const renderArea = container.createDiv({ cls: "manim-render" });

    // ── UI state transitions ────────────────────────────────────────────────
    const showOutput = () => {
      renderArea.empty();
      const url = this.resourceUrlFor(hash, opts.format);
      if (opts.format === "gif" || opts.format === "png") {
        const img = renderArea.createEl("img", {
          attr: { src: url, alt: "Manim render" },
        });
        img.addClass("manim-output");
      } else {
        const video = renderArea.createEl("video", {
          attr: {
            src: url,
            controls: "",
            loop: "",
            muted: "",
            playsinline: "",
            preload: "metadata",
          },
        });
        video.addClass("manim-output");
      }
    };

    const showRenderUI = (initialError?: string) => {
      renderArea.empty();
      const controls = renderArea.createDiv({ cls: "manim-controls" });
      const btn = controls.createEl("button", {
        text: "▶ Render Manim",
        cls: "manim-render-btn",
      });
      // Persistent error panel from the previous attempt, if any.
      const err = this.lastErrors.get(hash) ?? initialError;
      if (err) attachErrorPanel(renderArea, err);

      btn.addEventListener("click", () => {
        this.startRender(renderArea, source, hash, opts).then(() => {
          this.lastErrors.delete(hash);
          showOutput();
        }).catch((e) => {
          // Error panel is already rendered live; nothing extra to do.
          void e;
        });
      });
    };

    if (existsSync(outputAbs)) {
      showOutput();
    } else if (this.settings.autoRender) {
      this.startRender(renderArea, source, hash, opts).then(() => {
        this.lastErrors.delete(hash);
        showOutput();
      }).catch(() => showRenderUI());
    } else {
      showRenderUI();
    }
  }

  /** Drives the live render UI: progress log, cancel button, error panel.
   *  Returns the same promise as the underlying render so the caller can chain
   *  on success / failure. */
  private startRender(
    renderArea: HTMLElement,
    source: string,
    hash: string,
    opts: BlockOptions,
  ): Promise<void> {
    renderArea.empty();
    const status = renderArea.createDiv({ cls: "manim-status" });
    const queueInfo = this.queue.stats();
    const queueText =
      queueInfo.running >= this.settings.maxConcurrent
        ? ` (queued — ${queueInfo.waiting + 1} ahead)`
        : "";
    status.createSpan({ text: `Rendering${queueText}…`, cls: "manim-spinner" });

    const cancelBtn = renderArea.createEl("button", {
      text: "Cancel",
      cls: "manim-cancel-btn",
    });

    const log = renderArea.createEl("pre", { cls: "manim-live-log" });
    log.textContent = "";

    const handle = this.render(source, hash, opts);

    // Subscribe to log updates. We poll the shared handle's liveLog because
    // multiple block instances on the same hash share one render. The
    // interval self-cancels if the user closes the note (the <pre> leaves
    // the DOM) so we don't leak timers across navigation.
    let lastShown = "";
    const tick = window.setInterval(() => {
      if (!document.contains(log)) {
        window.clearInterval(tick);
        return;
      }
      if (handle.liveLog.text !== lastShown) {
        lastShown = handle.liveLog.text;
        log.textContent = lastShown.split("\n").slice(-12).join("\n");
        log.scrollTop = log.scrollHeight;
      }
    }, 250);

    cancelBtn.addEventListener("click", () => {
      cancelBtn.setAttr("disabled", "true");
      cancelBtn.setText("Cancelling…");
      handle.cancel();
    });

    return handle.promise
      .then(() => {
        window.clearInterval(tick);
      })
      .catch((err) => {
        window.clearInterval(tick);
        const msg = err instanceof Error ? err.message : String(err);
        this.lastErrors.set(hash, msg);
        console.error("[manim] render failed", { hash, error: msg });
        renderArea.empty();
        renderArea.createEl("button", {
          text: "▶ Retry Manim",
          cls: "manim-render-btn",
        }).addEventListener("click", () => {
          this.startRender(renderArea, source, hash, opts).then(() => {
            this.lastErrors.delete(hash);
            // Caller's outer .then would normally swap to showOutput; but
            // since the retry path is local to startRender, redraw inline.
            renderArea.empty();
            const url = this.resourceUrlFor(hash, opts.format);
            const tag = opts.format === "mp4" ? "video" : "img";
            const node = renderArea.createEl(tag as keyof HTMLElementTagNameMap, {
              attr:
                tag === "video"
                  ? { src: url, controls: "", loop: "", muted: "", playsinline: "" }
                  : { src: url, alt: "Manim render" },
            });
            node.addClass("manim-output");
          }).catch(() => undefined);
        });
        attachErrorPanel(renderArea, msg);
        throw err;
      });
  }

  // ── Render orchestration ──────────────────────────────────────────────────

  /** Returns a deduplicated render handle for `hash`. Multiple callers see
   *  the same promise + the same live log + can cancel the same child. */
  private render(code: string, hash: string, opts: BlockOptions): RenderHandle {
    const existing = this.inflight.get(hash);
    if (existing) return existing;
    const liveLog = { text: "" };
    const child = { current: null as ChildProcess | null };
    const cancelled = { value: false };
    const cancel = () => {
      cancelled.value = true;
      if (child.current && child.current.exitCode === null) {
        try {
          child.current.kill("SIGTERM");
        } catch (e) {
          console.error("[manim] SIGTERM failed", e);
        }
      }
    };
    const promise = (async () => {
      const release = await this.queue.acquire();
      try {
        // If the user cancelled while we were queued, skip the spawn entirely.
        if (cancelled.value) throw new Error("Render cancelled");
        await this.runManim(code, hash, opts, liveLog, child);
      } finally {
        release();
        this.inflight.delete(hash);
      }
    })();
    const handle: RenderHandle = { promise, liveLog, child, cancel, cancelled };
    this.inflight.set(hash, handle);
    return handle;
  }

  /** Spawn manim and stream stderr into `liveLog.text`. */
  private runManim(
    code: string,
    hash: string,
    opts: BlockOptions,
    liveLog: { text: string },
    childRef: { current: ChildProcess | null },
  ): Promise<void> {
    // ManimGL can't emit GIFs natively — fail fast with a useful message
    // instead of letting the CLI explode mid-pipeline.
    if (opts.flavor === "gl" && opts.format === "gif") {
      return Promise.reject(
        new Error(
          "format=gif isn't supported by ManimGL. Either render as mp4/png, " +
            "or switch the block's flavor to ce (`# manim: flavor=ce format=gif`).",
        ),
      );
    }
    const cacheDir = this.cacheDirAbs();
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
    const finalPath = this.outputPath(hash, opts.format);

    // Use an OS tempdir for the script + intermediate media so an aborted
    // render never leaves stray .py files in the vault sidebar.
    const tmpRoot = join(tmpdir(), `manim-${hash}-${Date.now()}`);
    mkdirSync(tmpRoot, { recursive: true });
    const tmpScript = join(tmpRoot, "scene.py");
    const tmpMedia = join(tmpRoot, "media");
    writeFileSync(tmpScript, code, "utf-8");

    return new Promise<void>((resolve, reject) => {
      const scene = detectSceneName(code);
      // Resolve the executable from the block's effective flavor, NOT the
      // global Flavor setting — so a `# manim: flavor=ce` directive routes
      // to `manimPathCe` even if the global default is GL.
      const path = (opts.flavor === "gl"
        ? this.settings.manimPathGl
        : this.settings.manimPathCe).trim();
      const parts = path.split(/\s+/);
      const cmd = parts[0];
      const baseArgs = parts.slice(1);
      const ctx: ArgContext = { tmpScript, tmpMedia, hash, opts };
      const args = opts.flavor === "gl"
        ? buildGlArgs(baseArgs, scene, ctx)
        : buildCeArgs(baseArgs, scene, ctx);

      console.debug("[manim] spawn", cmd, args);
      let child: ChildProcess;
      try {
        child = spawn(cmd, args, { cwd: tmpRoot });
      } catch (e) {
        cleanup();
        return reject(e);
      }
      childRef.current = child;

      child.stderr?.on("data", (d: Buffer) => {
        liveLog.text += d.toString();
      });
      child.stdout?.on("data", (d: Buffer) => {
        // manim writes some progress to stdout too on certain versions.
        liveLog.text += d.toString();
      });
      child.on("error", (e) => {
        cleanup();
        reject(e);
      });
      child.on("close", (codeExit, signal) => {
        try {
          if (signal === "SIGTERM" || signal === "SIGINT") {
            throw new Error("Render cancelled");
          }
          if (codeExit !== 0) {
            throw new Error(liveLog.text.trim() || `manim exited with code ${codeExit}`);
          }
          // Output discovery: format dictates the extension.
          const ext = opts.format;
          const found = findFile(tmpMedia, `${hash}.${ext}`);
          if (!found) {
            throw new Error(
              `Render finished but ${hash}.${ext} not found under ${tmpMedia}`,
            );
          }
          moveAcrossDevices(found, finalPath);
          resolve();
        } catch (e) {
          reject(e);
        } finally {
          cleanup();
        }
      });

      function cleanup() {
        try {
          rmSync(tmpRoot, { recursive: true, force: true });
        } catch {
          /* best effort */
        }
      }
    });
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  /** Clear cache files referenced by blocks in the active note. */
  private async rerenderActive() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("No active file.");
      return;
    }
    const raw = await this.app.vault.read(file);
    const blocks = extractManimBlocks(raw);
    if (blocks.length === 0) {
      new Notice("No ```manim``` blocks in the active note.");
      return;
    }
    const cacheDir = this.cacheDirAbs();
    let cleared = 0;
    for (const code of blocks) {
      const opts = parseBlockOptions(code, this.defaultOptions());
      const hash = hashCode(code);
      // Try all known extensions — the block may have been cached under any of them.
      for (const ext of ["mp4", "gif", "png", "webm"]) {
        const candidate = join(cacheDir, `${hash}.${ext}`);
        if (existsSync(candidate)) {
          try {
            unlinkSync(candidate);
            cleared++;
          } catch { /* ignore */ }
        }
      }
      this.lastErrors.delete(hash);
      void opts;
    }
    new Notice(`Cleared ${cleared} cached Manim file(s). Re-open the preview to re-render.`);
  }

  /** Walk every .md note → collect referenced hashes → delete cache files
   *  whose hash isn't referenced anywhere. */
  private async garbageCollect() {
    const used = new Set<string>();
    const files = this.app.vault.getMarkdownFiles();
    for (const f of files) {
      try {
        const raw = await this.app.vault.read(f);
        for (const code of extractManimBlocks(raw)) used.add(hashCode(code));
      } catch (e) {
        console.warn("[manim] could not read", f.path, e);
      }
    }
    const cacheDir = this.cacheDirAbs();
    if (!existsSync(cacheDir)) {
      new Notice("Cache folder doesn't exist yet — nothing to collect.");
      return;
    }
    let removed = 0;
    let freed = 0;
    for (const entry of readdirSync(cacheDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const name = String(entry.name);
      // Match hash files: <16 hex>.<ext>
      const m = name.match(/^([0-9a-f]{16})\.(mp4|gif|png|webm)$/i);
      if (!m) continue;
      if (used.has(m[1])) continue;
      const full = join(cacheDir, name);
      try {
        const size = statSync(full).size;
        unlinkSync(full);
        removed++;
        freed += size;
      } catch (e) {
        console.warn("[manim] could not remove", full, e);
      }
    }
    new Notice(
      `Garbage-collect: removed ${removed} orphan file(s), freed ${humanBytes(freed)}.`,
      6000,
    );
  }

  /** Show cache stats in a long Notice. */
  private async showCacheStats() {
    const cacheDir = this.cacheDirAbs();
    if (!existsSync(cacheDir)) {
      new Notice("Cache folder doesn't exist yet.");
      return;
    }
    const used = new Set<string>();
    for (const f of this.app.vault.getMarkdownFiles()) {
      try {
        const raw = await this.app.vault.read(f);
        for (const code of extractManimBlocks(raw)) used.add(hashCode(code));
      } catch { /* ignore */ }
    }
    let total = 0;
    let totalSize = 0;
    let orphans = 0;
    let orphanSize = 0;
    for (const entry of readdirSync(cacheDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const name = String(entry.name);
      const m = name.match(/^([0-9a-f]{16})\.(mp4|gif|png|webm)$/i);
      if (!m) continue;
      const size = statSync(join(cacheDir, name)).size;
      total++;
      totalSize += size;
      if (!used.has(m[1])) {
        orphans++;
        orphanSize += size;
      }
    }
    new Notice(
      `Manim cache: ${total} file(s), ${humanBytes(totalSize)}.\n` +
        `Referenced by notes: ${total - orphans}.\n` +
        `Orphans: ${orphans} (${humanBytes(orphanSize)}) — run "Garbage-collect" to remove.`,
      10000,
    );
  }

  // ── Status bar ────────────────────────────────────────────────────────────

  private updateStatusBar() {
    if (!this.statusBarEl) return;
    const { running, waiting } = this.queue.stats();
    if (running === 0 && waiting === 0) {
      this.statusBarEl.style.display = "none";
      this.statusBarEl.setText("");
    } else {
      this.statusBarEl.style.display = "";
      const total = running + waiting;
      this.statusBarEl.setText(`🎞 manim ${running}/${total}`);
      this.statusBarEl.title = `${running} running, ${waiting} queued`;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers shared between commands
// ---------------------------------------------------------------------------

/** Extract the source of every ```manim``` block in a note. Supports CRLF. */
function extractManimBlocks(md: string): string[] {
  const re = /```manim[^\n]*\r?\n([\s\S]*?)\r?\n```/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) out.push(m[1]);
  return out;
}

/** Append a persistent stderr panel under the render area. */
function attachErrorPanel(parent: HTMLElement, stderr: string) {
  const errBox = parent.createEl("details", { cls: "manim-error" });
  errBox.setAttr("open", "true");
  errBox.createEl("summary", { text: "Render failed — show error" });
  errBox.createEl("pre", { text: stderr });
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

class ManimSettingTab extends PluginSettingTab {
  plugin: ManimPlugin;
  constructor(app: App, plugin: ManimPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h3", { text: "Manim distribution" });

    new Setting(containerEl)
      .setName("Default flavor")
      .setDesc(
        "Default when a block has no `# manim: flavor=…` directive. Per-block directives can still override this, and routing to the right executable is handled automatically.",
      )
      .addDropdown((d) =>
        d
          .addOption("ce", "Community Edition (manim)")
          .addOption("gl", "3Blue1Brown (manimgl)")
          .setValue(this.plugin.settings.flavor)
          .onChange(async (v) => {
            this.plugin.settings.flavor = v as ManimFlavor;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("ManimCE executable")
      .setDesc(
        "Command or absolute path for ManimCE. Used whenever a block resolves to CE flavor. Examples: `manim`, `/usr/local/bin/manim`, `python -m manim`.",
      )
      .addText((text) =>
        text
          .setPlaceholder("manim")
          .setValue(this.plugin.settings.manimPathCe)
          .onChange(async (v) => {
            this.plugin.settings.manimPathCe = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("ManimGL executable")
      .setDesc(
        "Command or absolute path for ManimGL (3Blue1Brown). Used whenever a block resolves to GL flavor. Examples: `manimgl`, `python -m manimlib`.",
      )
      .addText((text) =>
        text
          .setPlaceholder("manimgl")
          .setValue(this.plugin.settings.manimPathGl)
          .onChange(async (v) => {
            this.plugin.settings.manimPathGl = v;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl("h3", { text: "Defaults" });
    containerEl.createEl("p", {
      text: "Each block can override these with a first-line directive, e.g. `# manim: quality=h format=gif bg=WHITE`. The directive is part of the hash, so changing it produces a fresh render keyed under a new filename.",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Cache folder")
      .setDesc("Relative to the vault root. Keep `_manim` to match Pensine's convention.")
      .addText((text) =>
        text
          .setPlaceholder("_manim")
          .setValue(this.plugin.settings.cacheDir)
          .onChange(async (v) => {
            this.plugin.settings.cacheDir = v || "_manim";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Default quality")
      .setDesc(
        this.plugin.settings.flavor === "gl"
          ? "GL: l=480p, m=720p, h/p=--hd (1080p), k=--uhd (2160p)."
          : "CE: l=480p15, m=720p30, h=1080p60, p=1440p60, k=2160p60.",
      )
      .addDropdown((d) =>
        d
          .addOption("l", "Low (480p)")
          .addOption("m", "Medium (720p)")
          .addOption("h", "High (1080p)")
          .addOption("p", this.plugin.settings.flavor === "gl" ? "Production (1080p — same as High)" : "Production (1440p60)")
          .addOption("k", "4K (2160p)")
          .setValue(this.plugin.settings.defaultQuality)
          .onChange(async (v) => {
            this.plugin.settings.defaultQuality = v as Quality;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Default output format")
      .setDesc("mp4 = animation, gif = portable, png = single frame (uses Manim's -s).")
      .addDropdown((d) =>
        d
          .addOption("mp4", "mp4")
          .addOption("gif", "gif")
          .addOption("png", "png (last frame)")
          .setValue(this.plugin.settings.outputFormat)
          .onChange(async (v) => {
            this.plugin.settings.outputFormat = v as OutputFormat;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Background color")
      .setDesc("Forwarded as `-c`. Empty = Manim's default (black). Examples: `WHITE`, `#fcfcfc`.")
      .addText((text) =>
        text
          .setPlaceholder("(default)")
          .setValue(this.plugin.settings.background)
          .onChange(async (v) => {
            this.plugin.settings.background = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl("h3", { text: "Execution" });

    new Setting(containerEl)
      .setName("Auto-render in Reading view")
      .setDesc(
        "When ON, opening a note's preview triggers any uncached block automatically. With many blocks per note, prefer OFF + click ▶ to keep the queue shallow.",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoRender).onChange(async (v) => {
          this.plugin.settings.autoRender = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Max concurrent renders")
      .setDesc("Hard ceiling on parallel `manim` processes. Extra requests queue FIFO. Each render eats ~200 MB + one CPU core, so 2 is a sane default on a laptop.")
      .addSlider((s) =>
        s
          .setLimits(1, 8, 1)
          .setValue(this.plugin.settings.maxConcurrent)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.maxConcurrent = v;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl("h3", { text: "Per-block directive cheat sheet" });
    const ul = containerEl.createEl("ul");
    ul.style.fontSize = "0.9em";
    ul.createEl("li", { text: "# manim: quality=h               — override quality (l/m/h/p/k)" });
    ul.createEl("li", { text: "# manim: format=gif              — override format (mp4/gif/png)" });
    ul.createEl("li", { text: "# manim: flavor=gl               — call manimgl instead of manim for this block" });
    ul.createEl("li", { text: "# manim: bg=WHITE                — set background colour" });
    ul.createEl("li", { text: "# manim: frame=last              — render the last frame only" });
    ul.createEl("li", { text: "# manim: quality=h format=gif    — combine keys, space-separated" });

    void TFile; // keep the import alive (it's referenced in type positions only)
  }
}
