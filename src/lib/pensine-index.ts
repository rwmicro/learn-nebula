import type { FileNode } from "@/utils/types"

export interface DirectoryEntry {
  name: string
  path: string
  type: string
  isDirectory: boolean
}

export interface SearchEntry {
  path: string
  title: string
  body: string
}

export interface SearchResult {
  path: string
  title: string
  snippet: string
  matchCount: number
}

let treePromise: Promise<FileNode[]> | null = null
let corpusPromise: Promise<SearchEntry[]> | null = null

export function loadTree(): Promise<FileNode[]> {
  if (!treePromise) {
    treePromise = fetch("/pensine-index.json", { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [] as FileNode[])
  }
  return treePromise
}

export function loadSearchCorpus(): Promise<SearchEntry[]> {
  if (!corpusPromise) {
    corpusPromise = fetch("/pensine-search.json", { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [] as SearchEntry[])
  }
  return corpusPromise
}

function nodeExtension(node: FileNode): string {
  if (node.type === "directory") return "directory"
  const dot = node.name.lastIndexOf(".")
  return dot === -1 ? "" : node.name.slice(dot + 1).toLowerCase()
}

function toEntry(node: FileNode): DirectoryEntry {
  return {
    name: node.name,
    path: node.path,
    type: nodeExtension(node),
    isDirectory: node.type === "directory",
  }
}

function findDirectory(tree: FileNode[], target: string): FileNode[] | null {
  const normalized = target.replace(/^\/+|\/+$/g, "")
  if (!normalized) return tree
  for (const node of tree) {
    if (node.type !== "directory") continue
    if (node.path === normalized) return node.children ?? []
    if (normalized.startsWith(node.path + "/")) {
      const sub = findDirectory(node.children ?? [], normalized)
      if (sub) return sub
    }
  }
  return null
}

export async function listDirectory(dirPath: string): Promise<DirectoryEntry[]> {
  const tree = await loadTree()
  const children = findDirectory(tree, dirPath)
  if (!children) return []
  return children.map(toEntry)
}

const MAX_CORPUS_RESULTS = 15

export async function searchCorpus(query: string): Promise<SearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const corpus = await loadSearchCorpus()
  const lowerQuery = q.toLowerCase()
  const results: SearchResult[] = []

  for (const entry of corpus) {
    const lowerBody = entry.body.toLowerCase()
    const firstIdx = lowerBody.indexOf(lowerQuery)
    if (firstIdx === -1) continue

    let matchCount = 0
    let pos = 0
    while ((pos = lowerBody.indexOf(lowerQuery, pos)) !== -1) {
      matchCount++
      pos += lowerQuery.length
    }

    const start = Math.max(0, firstIdx - 70)
    const end = Math.min(entry.body.length, firstIdx + q.length + 70)
    const snippet =
      (start > 0 ? "…" : "") +
      entry.body.slice(start, end).trim() +
      (end < entry.body.length ? "…" : "")

    results.push({
      path: entry.path,
      title: entry.title,
      snippet,
      matchCount,
    })
  }

  results.sort((a, b) => b.matchCount - a.matchCount)
  return results.slice(0, MAX_CORPUS_RESULTS)
}
