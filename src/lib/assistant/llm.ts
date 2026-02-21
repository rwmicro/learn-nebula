export interface LLMProgress {
  text: string
  progress: number // 0–1
}

export interface LLMEngine {
  generate: (
    context: string,
    question: string,
    onToken: (token: string) => void,
  ) => Promise<void>
  unload: () => Promise<void>
  backend: "webgpu" | "wasm"
  modelId: string
}

const MODEL_WEBGPU = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC"
const MODEL_WASM   = "HuggingFaceTB/SmolLM2-360M-Instruct"

function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && !!navigator.gpu
}

// ─── WebGPU backend (WebLLM) ──────────────────────────────────────────────────

async function loadWebGPUEngine(onProgress: (p: LLMProgress) => void): Promise<LLMEngine> {
  const { CreateMLCEngine } = await import("@mlc-ai/web-llm")

  const engine = await CreateMLCEngine(MODEL_WEBGPU, {
    initProgressCallback: (p: { text: string; progress: number }) =>
      onProgress({ text: p.text, progress: p.progress }),
  })

  return {
    backend: "webgpu",
    modelId: MODEL_WEBGPU,

    async generate(context, question, onToken) {
      const stream = await engine.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "Tu es un assistant qui répond uniquement à partir des notes fournies. " +
              "Sois concis. Si la réponse n'est pas dans les notes, dis-le.\n\n" +
              "Notes :\n" + context,
          },
          { role: "user", content: question },
        ],
        stream: true,
        temperature: 0.4,
        max_tokens: 512,
      })
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) onToken(delta)
      }
    },

    async unload() {
      await engine.unload()
    },
  }
}

// ─── WASM fallback (Transformers.js) ─────────────────────────────────────────

async function loadWASMEngine(onProgress: (p: LLMProgress) => void): Promise<LLMEngine> {
  const { pipeline, TextStreamer, env } = await import("@huggingface/transformers")
  env.allowRemoteModels = true

  onProgress({ text: "Chargement du modèle (WASM)…", progress: 0 })

  // dtype q4 keeps the model small enough for browser RAM
  const generator = await pipeline("text-generation", MODEL_WASM, {
    dtype: "q4",
    progress_callback: (p: { status: string; progress?: number; file?: string }) => {
      if (p.status === "progress" && p.progress !== undefined) {
        onProgress({
          text: p.file ? `Téléchargement ${p.file}…` : "Chargement…",
          progress: p.progress / 100,
        })
      } else if (p.status === "done") {
        onProgress({ text: "Modèle prêt", progress: 1 })
      }
    },
  })

  return {
    backend: "wasm",
    modelId: MODEL_WASM,

    async generate(context, question, onToken) {
      const messages = [
        {
          role: "system" as const,
          content:
            "Tu es un assistant qui répond uniquement à partir des notes fournies. " +
            "Sois concis. Si la réponse n'est pas dans les notes, dis-le.\n\nNotes :\n" + context,
        },
        { role: "user" as const, content: question },
      ]

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tok = (generator as any).tokenizer
      const streamer = new TextStreamer(tok, {
        skip_prompt: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        callback_function: (text: any) => {
          if (typeof text === "string") onToken(text)
        },
      })

      await (generator as (input: unknown, opts: unknown) => Promise<unknown>)(messages, {
        max_new_tokens: 400,
        do_sample: false,
        streamer,
      })
    },

    async unload() {
      await (generator as { dispose?: () => void }).dispose?.()
    },
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

let enginePromise: Promise<LLMEngine> | null = null

export function loadLLM(onProgress: (p: LLMProgress) => void): Promise<LLMEngine> {
  if (!enginePromise) {
    enginePromise = (hasWebGPU() ? loadWebGPUEngine(onProgress) : loadWASMEngine(onProgress))
      .catch((err) => {
        enginePromise = null
        throw err
      })
  }
  return enginePromise
}

export function getBackendInfo(): { webgpu: boolean; modelId: string } {
  const webgpu = hasWebGPU()
  return { webgpu, modelId: webgpu ? MODEL_WEBGPU : MODEL_WASM }
}
