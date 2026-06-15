"use client"

// Article metadata bubbles (type, domain, created, tags). Shared between the
// desktop TOC (right column on lg+) and the mobile inline header so users on
// narrow viewports don't lose access to tags / frontmatter.

const TAG_COLORS = [
  "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
  "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800",
]

function parseTags(raw: string | string[] | undefined): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean)
  const s = String(raw).trim()
  const inner = s.startsWith("[") && s.endsWith("]") ? s.slice(1, -1) : s
  return inner
    .split(",")
    .map((t) => t.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)
}

interface Props {
  metadata: Record<string, string | string[]>
  /** "stacked" (TOC sidebar) vs "inline" (mobile header) */
  variant?: "stacked" | "inline"
  className?: string
}

export default function ArticleMetadata({ metadata, variant = "stacked", className = "" }: Props) {
  if (!metadata || Object.keys(metadata).length === 0) return null

  const tags = parseTags(metadata["tags"])
  type Scalar = { key: "type" | "domain" | "created"; val: string }
  const scalars = (["type", "domain", "created"] as const)
    .map<Scalar | null>((key) => {
      const raw = metadata[key]
      if (!raw || Array.isArray(raw)) return null
      const val = String(raw).replace(/^["']|["']$/g, "")
      if (!val) return null
      return { key, val }
    })
    .filter((x): x is Scalar => x !== null)

  if (scalars.length === 0 && tags.length === 0) return null

  if (variant === "inline") {
    return (
      <div data-article-metadata className={`flex flex-wrap items-center gap-1.5 ${className}`}>
        {scalars.map(({ key, val }) => (
          <span
            key={key}
            className="px-2 py-0.5 text-[11px] rounded-full bg-[var(--c-surface-hover)] text-[var(--c-text-2)]"
          >
            <span className="opacity-60 mr-1 uppercase tracking-wide text-[10px]">{key}</span>
            {val}
          </span>
        ))}
        {tags.map((tag, i) => (
          <span
            key={tag}
            className={`px-2 py-0.5 text-[11px] rounded border ${TAG_COLORS[i % TAG_COLORS.length]}`}
          >
            {tag}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {scalars.map(({ key, val }) => (
        <div key={key} className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-[var(--c-text-3)] w-14 shrink-0">
            {key}
          </span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--c-surface-hover)] text-[var(--c-text-2)]">
            {val}
          </span>
        </div>
      ))}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {tags.map((tag, i) => (
            <span
              key={tag}
              className={`px-2 py-0.5 text-[11px] rounded border ${TAG_COLORS[i % TAG_COLORS.length]}`}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
