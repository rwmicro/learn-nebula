"use client"
import { useEffect, useId, useState } from "react"
import { useTheme } from "next-themes"

export default function MermaidDiagram({ chart }: { chart: string }) {
  const rawId = useId()
  const id = `mermaid-${rawId.replace(/:/g, "")}`
  const [svg, setSvg] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    setSvg("")
    setError(null)
    let cancelled = false

    import("mermaid").then(({ default: mermaid }) => {
      if (cancelled) return
      mermaid.initialize({
        startOnLoad: false,
        theme: resolvedTheme === "dark" ? "dark" : "default",
      })
      mermaid
        .render(id, chart)
        .then(({ svg: rendered }) => {
          if (!cancelled) setSvg(rendered)
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err))
        })
    })

    return () => {
      cancelled = true
    }
  }, [chart, id, resolvedTheme])

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-lg my-4 text-sm font-mono">
        Mermaid error: {error}
      </div>
    )
  }

  if (!svg) {
    return <div className="my-4 h-32 bg-gray-100 dark:bg-[#1a1a1a] rounded-lg animate-pulse" />
  }

  return (
    <div
      className="flex justify-center my-6 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
