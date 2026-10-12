// Builds the isometric figures (figures/<name>/figure.mjs) into public/figures/.
//
// A note embeds one with a ```iso:<name>``` block. rehypeIsoFigures
// (lib/markdown.ts) inlines the static plate written here, so the drawing is
// in the HTML from the first paint and readable without JavaScript; the note
// bundle (public/js/iso-figures.js) then imports /figures/<name>.js and calls
// its mount(root) to make it move.
//
// The drawing kit in figures/kit/ is Anatomy's (MIT, see figures/README.md).
// Outputs, all git-ignored:
//   public/figures/<name>.html   the plate (card, SVG, legend, caption)
//   public/figures/<name>.js     ES module: export function mount(root)
//   public/figures/kit.js        the kit, imported by every figure module
//   public/figures/iso.css       the kit's styles, linked once per note
//
// `--preview [name…]` also writes figures/<name>/preview.html and
// preview-light.html, standalone pages for screenshots and the line check.
// A figure that throws is skipped with a warning: the note then shows the
// block's fallback line, and the build carries on.
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const SRC = join(ROOT, "figures");
const OUT = join(ROOT, "public", "figures");
const args = process.argv.slice(2);
const preview = args.includes("--preview");
const only = args.filter((a) => !a.startsWith("--"));

const kitModule = readFileSync(join(SRC, "kit", "iso-kit.mjs"), "utf8");
// The same source inlined into a preview page, where `export` has no place.
const kitSource = kitModule.replace(/^export /gm, "");
const kit = await import(pathToFileURL(join(SRC, "kit", "iso-kit.mjs")).href);
// Every kit export is in scope inside mount(), as it is in Anatomy's
// standalone pages, so a figure's live code reads the same either way.
const names = Object.keys(kit).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
const scope = `const { ${names.join(", ")} } = K;`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "kit.js"), kitModule);
writeFileSync(join(OUT, "iso.css"), readFileSync(join(SRC, "kit", "iso.css"), "utf8"));

const dirs = readdirSync(SRC, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "kit")
  .map((d) => d.name)
  .filter((n) => existsSync(join(SRC, n, "figure.mjs")))
  .filter((n) => !only.length || only.includes(n));

let built = 0;
for (const name of dirs) {
  try {
    const mod = await import(pathToFileURL(join(SRC, name, "figure.mjs")).href);
    const { plate, live } = mod.render();
    writeFileSync(join(OUT, `${name}.html`), plate);
    writeFileSync(
      join(OUT, `${name}.js`),
      `import * as K from "./kit.js";\nexport function mount(root) {\n${scope}\n${live}\n}\n`,
    );
    if (preview) {
      for (const theme of ["dark", "light"]) {
        const page = kit.pageHtml({
          title: mod.title ?? name,
          theme,
          body: `<div class="iso-root">${plate}</div>`,
          script: `${kitSource}\nconst K = { ${names.join(", ")} };\nfunction mount(root) {\n${live}\n}\nmount(document.querySelector(".iso-root"));`,
        }).replace('<html lang="en">', '<html lang="fr">');
        writeFileSync(join(SRC, name, theme === "light" ? "preview-light.html" : "preview.html"), page);
      }
    }
    built++;
  } catch (err) {
    console.warn(`build-figures: ${name} skipped — ${err?.stack ?? err}`);
  }
}
console.log(`build-figures: ${built}/${dirs.length} figure(s) → public/figures/`);
