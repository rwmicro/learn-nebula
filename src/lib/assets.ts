import { BINARY_EXTENSIONS, R2_ASSETS_URL } from "@/utils/constants"

export function isBinaryAsset(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase()
  return ext ? BINARY_EXTENSIONS.has(ext) : false
}

// Retourne l'URL R2 pour un binaire, sinon le chemin local servi par Next.
export function getAssetUrl(filePath: string): string {
  const normalized = filePath.startsWith("/") ? filePath : `/${filePath}`
  if (isBinaryAsset(normalized)) {
    return `${R2_ASSETS_URL}${normalized}`
  }
  return `/articles/pensine${normalized}`
}
