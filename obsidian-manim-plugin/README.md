# Obsidian Manim Renderer

Renders ` ```manim ` fenced code blocks to videos (or GIFs) inline in Obsidian's
Reading view, by shelling out to the system `manim` CLI. Cached outputs land in
`<vault>/_manim/<hash>.<ext>`, keyed by `sha256(code.trim())[:16]`.

The same convention is read by the Pensine static site (`lib/markdown.ts`
`rehypeManim`): when you commit the cache folder alongside your notes, the
published article picks up the exact same rendered file. No build-time Manim
dependency on the deploy machine.

## Requirements

- Obsidian desktop (mobile is unsupported — no shell access).
- Python 3.9+ with [Manim Community Edition](https://docs.manim.community/) on `$PATH`.
- A working LaTeX install if your scenes use `MathTex`/`Tex`.

Quick check:

```bash
manim --version
```

## Install (manual, dev mode)

```bash
cd obsidian-manim-plugin
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into
`<your-vault>/.obsidian/plugins/manim-renderer/`. Then enable the plugin in
Obsidian's Community Plugins settings.

For active development:

```bash
npm run dev   # watches and rebuilds on change
```

## Usage

In any note:

````markdown
```manim
from manim import *

class HelloCircle(Scene):
    def construct(self):
        self.play(Create(Circle()))
        self.wait()
```
````

In Reading view you'll see a collapsible **Source** section and a ▶ **Render
Manim** button. Click it to invoke `manim`; the resulting `.mp4` is cached and
shown in place. Re-opening the note re-uses the cache (no re-render).

While rendering, you see a live tail of `manim`'s stderr (up to the last 12
lines) and a **Cancel** button that sends `SIGTERM` to the child process. If
the render fails, the stderr stays on screen in a persistent collapsible panel
— no more 8-second flash. The same error is also written to the DevTools
console (`Ctrl+Shift+I`).

If you enable **Auto-render in Reading view** in settings, the first preview
triggers the render with no click. Parallel work is capped by the
**Max concurrent renders** setting (default 2) — extra blocks queue FIFO with
a small `🎞 manim N/M` indicator in the status bar.

### Per-block directives

Override the global defaults for a single block by adding a first-line comment
of the form `# manim: key=value …`:

````markdown
```manim
# manim: quality=h format=gif bg=WHITE
from manim import *

class Square(Scene):
    def construct(self):
        self.play(Create(Square()))
```
````

| Key                 | Values                       | Notes                                                                |
| ------------------- | ---------------------------- | -------------------------------------------------------------------- |
| `flavor`            | `ce` / `gl`                  | Use `manimgl` for this block, even if the global default is CE.      |
| `quality` (or `q`)  | `l` / `m` / `h` / `p` / `k`  | 480/720/1080/1440/2160 — see flavor table for the exact mapping.     |
| `format` (or `f`)   | `mp4` / `gif` / `png`        | `png` renders the last frame only (handy for static diagrams).       |
| `bg` (`background`) | colour name or `#hex`        | Forwarded to Manim's `-c`.                                           |
| `frame`             | `last`                       | Synonym for `format=png` — render only the last frame.               |

The directive line is part of `code.trim()`, so editing it produces a fresh
hash → a new render under a new filename. Old files become orphans (run
**Garbage-collect** to remove them).

## Cache layout

```
<vault>/
├── _manim/
│   ├── a1b2c3d4e5f60718.mp4    # cached output for block #1
│   └── f9e8d7c6b5a40391.mp4    # block #2
└── ... your notes ...
```

The hash is `sha256(code.trim())[:16]`. Any whitespace edit at the start/end
keeps the same hash; any change to the body produces a fresh one (and the old
file becomes orphaned — clean periodically).

## Settings

| Setting              | Default  | Notes                                                                                                                                              |
| -------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manim flavor**     | `CE`     | `Community Edition (manim)` for `from manim import *` (default). `3Blue1Brown (manimgl)` for `from manimlib import *`. Remaps every CLI flag.      |
| Manim executable     | `manim`  | Auto-flips to `manimgl` when you switch flavor to GL (and back). Override with an absolute path or `python -m manim` / `python -m manimlib` if needed. |
| Cache folder         | `_manim` | Keep this default to match the Pensine convention.                                                                                                 |
| Default quality      | Low      | CE: l/m/h/p/k → 480/720/1080/1440/2160. GL: l/m/`--hd`/`--hd`/`--uhd` (GL has no 1440p tier).                                                       |
| Default output format | `mp4`    | `gif` = portable but heavier. `png` = render the last frame only (uses Manim's `-s`).                                                              |
| Background color     | empty    | Forwarded as `-c`. Examples: `WHITE`, `#fcfcfc`.                                                                                                   |
| Auto-render          | OFF      | If ON, renders happen automatically on Reading-view switch.                                                                                        |
| Max concurrent renders | `2`    | Hard cap on parallel `manim` processes. Anything beyond queues FIFO. Each render eats ~200 MB + a CPU core; bump only if you have headroom.        |

### ManimCE vs ManimGL

Two incompatible Python packages share the name "Manim":

| | **ManimCE** (Community) | **ManimGL** (3Blue1Brown) |
| --- | --- | --- |
| Import | `from manim import *` | `from manimlib import *` |
| Install | `pip install manim` | `pip install manimgl` |
| CLI | `manim` | `manimgl` |
| Quality flags | `-ql/-qm/-qh/-qp/-qk` | `-l/-m/--hd/--uhd` |
| Output dir flag | `--media_dir` | `--video_dir` |
| Output name flag | `--output_file` | `--file_name` |
| Needs `-w` to write? | No | **Yes** |
| Maturity | Active, full docs | 3b1b's internal tool, breaking changes |

The plugin's "Manim flavor" setting picks which argv layout to emit. Make sure
the import line in your code matches the chosen flavor — `from manim import *`
will not run under `manimgl` and vice-versa. Notable API differences:

- `ShowCreation` (GL) ↔ `Create` (CE — `ShowCreation` is a deprecated alias)
- `.set_backstroke()` (GL only) ↔ `.add_background_rectangle(...)` (CE)
- `add_coordinate_labels()` (GL) ↔ `add_coordinates()` (CE)
- `Tex(...)` in GL is roughly `MathTex(...)` in CE; CE's `Tex` is for plain LaTeX text

## Commands

Open the command palette (`Ctrl/Cmd+P`):

- **Re-render all Manim blocks in the active note** — deletes the cache files
  referenced by the current note. Reopen the preview to trigger fresh renders.
- **Garbage-collect orphaned Manim cache files** — walks every `.md` note in
  the vault, computes the hash of every `manim` block, and deletes any
  `_manim/*.{mp4,gif,png,webm}` whose hash is no longer referenced. Reports
  how many files and how many bytes were freed.
- **Show Manim cache stats** — counts cache files, total size, how many are
  orphans. Run this before garbage-collect to see what would be removed.

## How it pairs with Pensine

Pensine's markdown pipeline (`lib/markdown.ts`) recognises the same fence
language. At build time it:

1. Computes `sha256(code.trim())[:16]`.
2. Looks for `<note-dir>/_manim/<hash>.<ext>` (or a vault-relative fallback)
   among the vault assets copied to `public/vault/`.
3. If found → renders `<figure><video controls loop muted>…</video></figure>`
   in the article, with the source code in a `<details>` block right below.
4. If absent → renders the code block as plain syntax-highlighted Python with
   a small "not rendered" notice.

So the workflow is:

1. Write Manim in Obsidian, hit ▶, see the animation locally.
2. Commit `_manim/` along with your note when you sync the vault.
3. Pensine's build (`copy-vault-images.mjs`) copies the `.mp4`s under
   `public/vault/_manim/`, and `rehypeManim` wires them in.

## Troubleshooting

**"manim: command not found"** — install Manim CE (`pip install manim`) and
ensure your shell `$PATH` is inherited by Obsidian. On macOS, launching
Obsidian from Finder doesn't pick up shell rc files; either set an absolute
path in the settings (`/Users/you/.local/bin/manim`) or use
`python -m manim`.

**LaTeX errors during render** — install `texlive` (Linux) or MacTeX with the
extra LaTeX packages Manim needs:
[docs](https://docs.manim.community/en/stable/installation.html#optional-dependencies).

**Render succeeds but no video shown** — Manim's output path is nested
(`media/videos/<file>/<quality>/<scene>.mp4`). The plugin searches its private
temp `media_dir` for the produced file and renames it. If you see "Render
finished but `<hash>.mp4` not found", the scene class is probably named
oddly — the plugin extracts the class name from the first
`class … (Scene)` line. If your scene inherits from a custom class, hard-code
its name with `--output_file` removed; opening an issue with the snippet helps.

## License

MIT.
