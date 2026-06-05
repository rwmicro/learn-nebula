#!/usr/bin/env node
/**
 * Regenerate all icon assets to dimensions that match what's declared
 * in `public/site.webmanifest` and `src/app/layout.tsx`.
 *
 * Sources:
 *   - `public/favicons/web-app-manifest-512x512.png` — square master used for
 *     all square icons (chrome 192/512, apple-touch 180, manifest icons).
 *   - `public/opengraph-image.png` — wider master used for the 1200×630 /
 *     1200×675 social cards (cropped with `cover` so the painting fills
 *     without distortion).
 *
 * Override either with FAVICON_MASTER / SOCIAL_MASTER env vars.
 *
 * Run: `node scripts/regen-icons.mjs`
 */
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import toIco from "to-ico"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const PUB = join(ROOT, "public")

const SQUARE_MASTER =
  process.env.FAVICON_MASTER ||
  join(PUB, "favicons", "web-app-manifest-512x512.png")
const SOCIAL_MASTER =
  process.env.SOCIAL_MASTER || join(PUB, "opengraph-image.png")

if (!existsSync(SQUARE_MASTER)) {
  console.error(`Square master not found: ${SQUARE_MASTER}`)
  process.exit(1)
}
if (!existsSync(SOCIAL_MASTER)) {
  console.error(`Social master not found: ${SOCIAL_MASTER}`)
  process.exit(1)
}

const PNG_OPTS = { compressionLevel: 9, palette: true }

// Each target: { out, size:[w,h], src, fit }
const TARGETS = [
  // Favicons (square)
  { out: "favicon-16x16.png", size: [16, 16], src: SQUARE_MASTER, fit: "cover" },
  { out: "favicon-32x32.png", size: [32, 32], src: SQUARE_MASTER, fit: "cover" },
  { out: "favicon.png", size: [96, 96], src: SQUARE_MASTER, fit: "cover" },
  // Apple touch icon — must be exactly 180×180 per Apple HIG
  { out: "apple-touch-icon.png", size: [180, 180], src: SQUARE_MASTER, fit: "cover" },
  // Android Chrome — must be square per Web App Manifest spec
  { out: "android-chrome-192x192.png", size: [192, 192], src: SQUARE_MASTER, fit: "cover" },
  { out: "android-chrome-512x512.png", size: [512, 512], src: SQUARE_MASTER, fit: "cover" },
  // Web App Manifest icons (some duplicates so the manifest references stay valid)
  { out: "favicons/web-app-manifest-192x192.png", size: [192, 192], src: SQUARE_MASTER, fit: "cover" },
  // MS Tile — 150×150 square per browserconfig.xml
  { out: "mstile-150x150.png", size: [150, 150], src: SQUARE_MASTER, fit: "cover" },
  // Social cards
  // Open Graph — 1200×630, ratio 1.91:1 (Facebook, LinkedIn, Discord)
  { out: "opengraph-image.png", size: [1200, 630], src: SOCIAL_MASTER, fit: "cover" },
  // Twitter — 1200×675, ratio 16:9 (summary_large_image)
  { out: "twitter-image.png", size: [1200, 675], src: SOCIAL_MASTER, fit: "cover" },
]

// Cache source buffers so when output == source path, we still have the
// original bytes (sharp refuses to read/write the same file in one pipeline).
const srcCache = new Map()
async function getSrc(path) {
  if (!srcCache.has(path)) srcCache.set(path, await readFile(path))
  return srcCache.get(path)
}

async function regen({ out, size: [w, h], src, fit }) {
  const dest = join(PUB, out)
  await mkdir(dirname(dest), { recursive: true })
  const buf = await getSrc(src)
  await sharp(buf)
    .resize(w, h, { fit, position: "attention" })
    .png(PNG_OPTS)
    .toFile(dest)
  console.log(`  ✓ ${out} (${w}×${h})`)
}

console.log(`Regenerating icons from:`)
console.log(`  square master: ${SQUARE_MASTER.replace(ROOT + "/", "")}`)
console.log(`  social master: ${SOCIAL_MASTER.replace(ROOT + "/", "")}`)
console.log()

for (const t of TARGETS) await regen(t)

// favicon.ico — multi-resolution ICO embedding the 16×16 and 32×32 PNGs.
// to-ico uses PNG-embedded ICO format (vs. uncompressed BMP) so the file
// stays under ~10 KB instead of hundreds of KB.
const icoBuf = await toIco([
  await readFile(join(PUB, "favicon-16x16.png")),
  await readFile(join(PUB, "favicon-32x32.png")),
])
await writeFile(join(PUB, "favicon.ico"), icoBuf)
console.log(`  ✓ favicon.ico (${icoBuf.length} bytes)`)

console.log()
console.log(`Done.`)
