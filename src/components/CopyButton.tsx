"use client"
import { useState } from "react"

export function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }
  return (
    <button
      onClick={copy}
      className="px-2 py-0.5 text-[10px] font-mono text-[var(--c-text-2)] hover:text-[var(--c-text-1)] bg-[var(--c-surface)] hover:bg-[var(--c-border)] rounded transition-colors"
      aria-label="Copier le code"
      type="button"
    >
      {copied ? "✓ Copié" : "Copier"}
    </button>
  )
}
