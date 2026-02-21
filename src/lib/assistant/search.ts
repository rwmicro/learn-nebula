export interface Chunk {
  path: string
  title: string
  content: string
  embedding: number[]
}

export interface SearchIndex {
  model: string
  created: string
  dims: number
  chunks: Chunk[]
}

export interface SearchResult {
  chunk: Chunk
  score: number
}

let indexPromise: Promise<SearchIndex | null> | null = null

export function loadIndex(): Promise<SearchIndex | null> {
  if (!indexPromise) {
    indexPromise = fetch("/search-index.json")
      .then((r) => {
        if (!r.ok) return null
        return r.json() as Promise<SearchIndex>
      })
      .catch(() => null)
  }
  return indexPromise
}

/** Dot product — embeddings are already L2-normalised so this equals cosine similarity */
function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

export function search(
  queryEmbedding: number[],
  index: SearchIndex,
  topK = 5,
): SearchResult[] {
  return index.chunks
    .map((chunk) => ({ chunk, score: dot(queryEmbedding, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
