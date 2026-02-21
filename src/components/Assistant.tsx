"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { getEmbedder } from "@/lib/assistant/embedder"
import { loadIndex, search, type SearchResult, type SearchIndex } from "@/lib/assistant/search"
import { loadLLM, getBackendInfo, type LLMProgress, type LLMEngine } from "@/lib/assistant/llm"
import { buildNavigationPath } from "@/lib/tools"

type EmbedderStatus = "idle" | "loading" | "ready"
type LLMStatus = "off" | "loading" | "ready" | "error"

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconSparkle = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
  </svg>
)

const IconX = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
  </svg>
)

const IconSend = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
    <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
  </svg>
)

const IconChevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3 h-3 opacity-40">
    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
  </svg>
)

const Spinner = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
    <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

// ─── Source card ──────────────────────────────────────────────────────────────

function SourceCard({ result, index, onClick }: { result: SearchResult; index: number; onClick: () => void }) {
  const preview = result.chunk.content.replace(/^#{1,3}\s.*\n?/, "").slice(0, 100).trim()
  const scorePercent = Math.round(result.score * 100)
  const pathParts = result.chunk.path.replace(/^\//, "").split("/")
  const folder = pathParts.length > 1 ? pathParts[pathParts.length - 2] : null

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left rounded-xl border border-gray-100 dark:border-white/[0.06]
        bg-white/60 dark:bg-white/[0.03]
        hover:bg-white/90 dark:hover:bg-white/[0.06]
        hover:border-gray-200 dark:hover:border-white/10
        hover:-translate-y-0.5
        transition-all duration-150 overflow-hidden"
      style={{ transitionProperty: "transform, background, border-color" }}
    >
      {/* Score bar */}
      <div className="h-[2px] bg-gradient-to-r from-blue-400/60 to-transparent" style={{ width: `${scorePercent}%` }} />
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            {folder && (
              <span className="text-[10px] text-gray-400 dark:text-white/20 uppercase tracking-wide truncate">
                {folder}
              </span>
            )}
            <span className="text-[13px] font-medium text-gray-800 dark:text-white/75 group-hover:text-gray-900 dark:group-hover:text-white/90 transition-colors leading-snug truncate">
              {result.chunk.title}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            <span className="text-[10px] text-gray-300 dark:text-white/15 tabular-nums">{scorePercent}%</span>
            <IconChevron />
          </div>
        </div>
        {preview && (
          <p className="mt-1 text-[11px] text-gray-400 dark:text-white/25 line-clamp-2 leading-relaxed">
            {preview}
          </p>
        )}
      </div>
    </button>
  )
}

// ─── LLM toggle ──────────────────────────────────────────────────────────────

function LLMToggle({
  status,
  progress,
  onEnable,
  onDisable,
}: {
  status: LLMStatus
  progress: LLMProgress | null
  onEnable: () => void
  onDisable: () => void
}) {
  if (status === "error") {
    return (
      <span className="text-[11px] text-red-400/80">Erreur de chargement</span>
    )
  }

  const isOn = status === "ready"
  const isLoading = status === "loading"

  return (
    <button
      type="button"
      onClick={isOn ? onDisable : isLoading ? undefined : onEnable}
      disabled={isLoading}
      className="flex items-center gap-2 group"
      title={isOn ? "Désactiver la réponse IA" : "Activer la réponse IA"}
    >
      {/* Track */}
      <span
        className={`relative inline-flex w-8 h-4 rounded-full transition-colors duration-300 ${
          isOn ? "bg-blue-500" : "bg-gray-200 dark:bg-white/10"
        }`}
      >
        {/* Thumb */}
        <span
          className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform duration-300 ${
            isOn ? "translate-x-4" : "translate-x-0"
          }`}
        />
        {isLoading && (
          <span className="absolute inset-0 rounded-full animate-pulse bg-blue-400/40" />
        )}
      </span>
      <span className={`text-[11px] transition-colors ${isOn ? "text-blue-500 dark:text-blue-400" : "text-gray-400 dark:text-white/25"}`}>
        Réponse IA
      </span>
    </button>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Assistant() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")

  const [embedderStatus, setEmbedderStatus] = useState<EmbedderStatus>("idle")
  const indexRef = useRef<SearchIndex | null>(null)

  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const [llmStatus, setLlmStatus] = useState<LLMStatus>("off")
  const [llmProgress, setLlmProgress] = useState<LLMProgress | null>(null)
  const [llmResponse, setLlmResponse] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const llmRef = useRef<LLMEngine | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 80)
  }, [isOpen])

  useEffect(() => {
    if (llmResponse) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [llmResponse])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  // Preload index silently when panel opens
  useEffect(() => {
    if (isOpen && !indexRef.current) {
      loadIndex().then((idx) => { indexRef.current = idx })
    }
  }, [isOpen])

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return

    setIsSearching(true)
    setHasSearched(true)
    setResults([])
    setLlmResponse("")

    try {
      if (embedderStatus !== "ready") setEmbedderStatus("loading")
      const embed = await getEmbedder()
      setEmbedderStatus("ready")

      if (!indexRef.current) indexRef.current = await loadIndex()
      if (!indexRef.current) { setIsSearching(false); return }

      const qv = await embed(query)
      const top = search(qv, indexRef.current, 5)
      setResults(top)
      setIsSearching(false)

      if (llmStatus === "ready" && llmRef.current) {
        const ctx = top.map((r) => `[${r.chunk.title}]\n${r.chunk.content}`).join("\n\n---\n\n")
        setIsGenerating(true)
        await llmRef.current.generate(ctx, query, (t) => setLlmResponse((p) => p + t))
        setIsGenerating(false)
      }
    } catch {
      setIsSearching(false)
      setIsGenerating(false)
    }
  }, [query, embedderStatus, llmStatus])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSearch() }
  }

  const handleEnableLLM = async () => {
    setLlmStatus("loading")
    setLlmProgress(null)
    try {
      llmRef.current = await loadLLM((p) => setLlmProgress(p))
      setLlmStatus("ready")
    } catch {
      setLlmStatus("error")
    }
  }

  const handleDisableLLM = async () => {
    if (llmRef.current) { await llmRef.current.unload(); llmRef.current = null }
    setLlmStatus("off")
    setLlmResponse("")
  }

  return (
    <>
      {/* ── Floating button ── */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Assistant"
        className={`fixed bottom-5 right-5 z-50 w-10 h-10 rounded-full flex items-center justify-center
          shadow-lg shadow-black/10 dark:shadow-black/40
          transition-all duration-200 ease-out
          ${isOpen
            ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 scale-95"
            : "bg-white dark:bg-[#111] text-gray-500 dark:text-white/40 border border-gray-200 dark:border-white/10 hover:text-gray-800 dark:hover:text-white/80 hover:border-gray-300 dark:hover:border-white/20 hover:scale-105"
          }`}
      >
        <span className={`transition-all duration-200 ${isOpen ? "rotate-0 scale-100" : "rotate-0 scale-100"}`}>
          {isOpen ? <IconX /> : <IconSparkle />}
        </span>
      </button>

      {/* ── Panel ── */}
      <div
        className={`fixed bottom-[4.5rem] right-5 z-50 w-[440px] h-[85vh] max-h-[700px] flex flex-col rounded-2xl overflow-hidden
          border border-gray-200/80 dark:border-white/[0.07]
          bg-white/80 dark:bg-[#0c0c0c]/90
          backdrop-blur-xl
          shadow-2xl shadow-black/10 dark:shadow-black/60
          transition-all duration-200 ease-out origin-bottom-right
          ${isOpen ? "opacity-100 scale-100 translate-y-0 pointer-events-auto" : "opacity-0 scale-95 translate-y-2 pointer-events-none"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 dark:border-white/[0.05] shrink-0">
          <div className="flex items-center gap-2 text-gray-700 dark:text-white/60">
            <IconSparkle className="w-3.5 h-3.5" />
            <span className="text-[13px] font-medium tracking-tight">Assistant</span>
          </div>
          <LLMToggle status={llmStatus} progress={llmProgress} onEnable={handleEnableLLM} onDisable={handleDisableLLM} />
        </div>

        {/* LLM download progress */}
        {llmStatus === "loading" && (
          <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.04] bg-blue-50/50 dark:bg-blue-500/[0.04] shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-blue-500 dark:text-blue-400 font-medium truncate pr-4">
                {llmProgress?.text ?? "Initialisation…"}
              </span>
              <span className="text-[10px] text-blue-400/60 tabular-nums shrink-0">
                {Math.round((llmProgress?.progress ?? 0) * 100)}%
              </span>
            </div>
            <div className="h-[3px] bg-blue-100 dark:bg-blue-500/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-500"
                style={{ width: `${Math.round((llmProgress?.progress ?? 0) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-[10px] text-gray-400 dark:text-white/20">
              {llmProgress?.text?.includes("WASM") || !getBackendInfo().webgpu
                ? `${getBackendInfo().modelId} · WASM · ~200 MB`
                : `${getBackendInfo().modelId} · WebGPU · ~1.5 GB`
              } · mis en cache ensuite
            </p>
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain">

          {/* Empty state */}
          {!hasSearched && !isSearching && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
              <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-white/[0.05] flex items-center justify-center text-gray-400 dark:text-white/20">
                <IconSparkle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[13px] text-gray-500 dark:text-white/30 font-medium">
                  Pose une question sur tes notes
                </p>
                <p className="mt-0.5 text-[11px] text-gray-400 dark:text-white/15">
                  Recherche sémantique locale
                </p>
              </div>
            </div>
          )}

          {/* Searching state */}
          {isSearching && (
            <div className="flex items-center justify-center gap-2.5 py-10">
              <Spinner className="w-4 h-4 text-blue-400" />
              <span className="text-[12px] text-gray-400 dark:text-white/25">
                {embedderStatus === "loading" ? "Chargement du modèle…" : "Recherche…"}
              </span>
            </div>
          )}

          {/* Results */}
          {!isSearching && results.length > 0 && (
            <div className="px-3 pt-3 pb-1 flex flex-col gap-1.5">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-white/20 px-1 mb-0.5">
                Sources · {results.length}
              </p>
              {results.map((r, i) => (
                <SourceCard
                  key={i}
                  result={r}
                  index={i}
                  onClick={() => { router.push(buildNavigationPath(r.chunk.path)); setIsOpen(false) }}
                />
              ))}
            </div>
          )}

          {/* No results */}
          {!isSearching && hasSearched && results.length === 0 && (
            <div className="flex items-center justify-center py-10">
              <p className="text-[13px] text-gray-400 dark:text-white/25">Aucun résultat trouvé</p>
            </div>
          )}

          {/* LLM response */}
          {(llmResponse || isGenerating) && (
            <div className="mx-3 mt-2 mb-3 rounded-xl border border-blue-100 dark:border-blue-500/10 bg-blue-50/40 dark:bg-blue-500/[0.04] overflow-hidden">
              <div className="px-3 py-2 border-b border-blue-100 dark:border-blue-500/10">
                <span className="text-[10px] uppercase tracking-widest text-blue-400/70 dark:text-blue-400/40 font-medium">
                  Réponse IA
                </span>
              </div>
              <div className="px-3 py-3">
                <p className="text-[13px] text-gray-700 dark:text-white/60 leading-relaxed whitespace-pre-wrap">
                  {llmResponse}
                  {isGenerating && (
                    <span className="inline-block w-[3px] h-3.5 bg-blue-400 ml-0.5 rounded-sm animate-pulse" />
                  )}
                </p>
              </div>
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 px-3 pb-3 pt-2 border-t border-gray-100 dark:border-white/[0.05]">
          <div className="flex items-center gap-2 pl-3 pr-2 py-2 rounded-xl
            bg-white dark:bg-white/[0.04]
            border border-gray-200 dark:border-white/[0.07]
            focus-within:border-blue-300 dark:focus-within:border-blue-500/30
            focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-500/10
            transition-all duration-150">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pose ta question…"
              className="flex-1 text-[13px] bg-transparent outline-none
                text-gray-800 dark:text-white/70
                placeholder:text-gray-400 dark:placeholder:text-white/20"
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={!query.trim() || isSearching}
              className={`flex items-center justify-center w-6 h-6 rounded-lg transition-all duration-150 shrink-0
                ${query.trim() && !isSearching
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:scale-105"
                  : "bg-gray-100 dark:bg-white/[0.05] text-gray-300 dark:text-white/15 cursor-not-allowed"
                }`}
              aria-label="Rechercher"
            >
              {isSearching ? <Spinner className="w-3 h-3" /> : <IconSend />}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
