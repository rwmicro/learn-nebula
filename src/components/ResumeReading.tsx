"use client"
import { useEffect, useState } from "react"
import { clearScrollPosition, getScrollPosition } from "@/lib/user-prefs"

interface ResumeReadingProps {
  path: string
  containerRef: React.RefObject<HTMLDivElement | null>
}

// Banner shown at the top of an article if a previous scroll position
// (saved by MarkdownViewer's throttled scroll listener) is past 5%. Tapping
// "Reprendre" smoothly scrolls back to where the user left off.
export function ResumeReading({ path, containerRef }: ResumeReadingProps) {
  const [percent, setPercent] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const saved = getScrollPosition(path)
    if (saved == null) return
    const scrollable = el.scrollHeight - el.clientHeight
    if (scrollable <= 0) return
    const pct = Math.round((saved / scrollable) * 100)
    if (pct < 5 || pct > 95) return
    setPercent(pct)
  }, [path, containerRef])

  if (percent == null || dismissed) return null

  const resume = () => {
    const el = containerRef.current
    if (!el) return
    const saved = getScrollPosition(path)
    if (saved != null) el.scrollTo({ top: saved, behavior: "smooth" })
    setDismissed(true)
  }

  const startOver = () => {
    clearScrollPosition(path)
    setDismissed(true)
  }

  return (
    <div className="sticky top-0.5 z-10 -mx-10 xl:-mx-20 mb-2">
      <div className="flex items-center justify-between gap-3 px-4 py-1.5 bg-[var(--c-surface-hover)] border-b border-[var(--c-border)] backdrop-blur-sm">
        <span className="text-xs text-[var(--c-text-2)]">
          Tu étais à <span className="font-medium text-[var(--c-text-1)]">{percent}%</span> de cet article.
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={resume}
            type="button"
            className="px-2.5 py-1 text-xs font-medium bg-[var(--c-bg)] text-[var(--c-text-1)] border border-[var(--c-border)] rounded-md hover:bg-[var(--c-surface)] transition-colors"
          >
            Reprendre
          </button>
          <button
            onClick={startOver}
            type="button"
            className="px-2.5 py-1 text-xs text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
          >
            Recommencer
          </button>
        </div>
      </div>
    </div>
  )
}
