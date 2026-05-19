// Supprime les fichiers binaires de public/articles/pensine avant le build Next.
// Ces fichiers sont servis depuis R2 (assets.nebula.li), pas depuis Cloudflare Pages,
// pour éviter la limite de 25 MiB par asset Workers.
//
// Important : ce script modifie l'arbo. Sur la machine de build Cloudflare c'est
// éphémère ; en local, ne pas l'exécuter (utiliser `npm run build:local` si besoin).

import { rm, stat } from "node:fs/promises"
import { join, relative } from "node:path"
import { readdir } from "node:fs/promises"

const BINARY_EXTENSIONS = new Set([
  "pdf", "apkg", "zip", "mp4", "mp3", "webm", "mov",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "jpg", "jpeg", "png", "gif", "webp", "svg",
])

const ROOT = process.cwd()
const TARGET = join(ROOT, "public/articles/pensine")

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(full)))
    } else {
      files.push(full)
    }
  }
  return files
}

async function main() {
  try {
    await stat(TARGET)
  } catch {
    console.log(`[strip-binaries] ${TARGET} introuvable, rien à faire`)
    return
  }

  const all = await walk(TARGET)
  let removed = 0
  let bytesFreed = 0

  for (const file of all) {
    const ext = file.split(".").pop()?.toLowerCase()
    if (ext && BINARY_EXTENSIONS.has(ext)) {
      const st = await stat(file)
      bytesFreed += st.size
      await rm(file)
      removed++
    }
  }

  const mb = (bytesFreed / 1024 / 1024).toFixed(1)
  console.log(`[strip-binaries] ${removed} fichiers supprimés (${mb} MB libérés)`)
  console.log(`[strip-binaries] Ces fichiers doivent être synchronisés sur R2 via scripts/sync-r2.sh`)
}

main().catch((err) => {
  console.error("[strip-binaries] erreur:", err)
  process.exit(1)
})
