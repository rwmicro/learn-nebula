/**
 * Lazy-loaded embedding pipeline — browser only.
 * Reuses the same pipeline instance across calls.
 */

type EmbedFn = (text: string) => Promise<number[]>

let promise: Promise<EmbedFn> | null = null

export const MODEL_ID = "Xenova/all-MiniLM-L6-v2"

export function getEmbedder(): Promise<EmbedFn> {
  if (!promise) {
    promise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers")
      env.allowRemoteModels = true

      const pipe = await pipeline("feature-extraction", MODEL_ID, { dtype: "fp32" })

      return async (text: string): Promise<number[]> => {
        const out = await pipe(text, { pooling: "mean", normalize: true })
        // out.data is a Float32Array
        return Array.from(out.data as Float32Array)
      }
    })()
  }
  return promise
}
