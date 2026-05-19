import { BINARY_EXTENSIONS, R2_ASSETS_URL } from "@/utils/constants"

export function isBinaryAsset(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase()
  return ext ? BINARY_EXTENSIONS.has(ext) : false
}

// En prod, les binaires sont servis depuis R2 (limite 25 MiB de Cloudflare Pages).
// En dev, les binaires restent sur disque (le strip-binaries ne tourne pas), donc
// on les sert via le dev server sans dépendre d'un R2 synchro.
// Encode chaque segment pour gérer les espaces et caractères non-ASCII.
export function getAssetUrl(filePath: string): string {
  const normalized = filePath.startsWith("/") ? filePath : `/${filePath}`
  const encoded = normalized.split("/").map(encodeURIComponent).join("/")
  if (process.env.NODE_ENV === "production" && isBinaryAsset(normalized)) {
    return `${R2_ASSETS_URL}${encoded}`
  }
  return `/articles/pensine${encoded}`
}
