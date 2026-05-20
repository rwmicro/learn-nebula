"use client"
import { useIsBookmarked } from "@/hooks/usePrefs"
import { toggleBookmark } from "@/lib/user-prefs"

export function BookmarkButton({ path }: { path: string }) {
  const marked = useIsBookmarked(path)
  return (
    <button
      onClick={() => toggleBookmark(path)}
      className="p-1.5 rounded-md hover:bg-[var(--c-surface-hover)] transition-colors text-[var(--c-text-3)] hover:text-[var(--c-text-1)]"
      aria-label={marked ? "Retirer des favoris" : "Ajouter aux favoris"}
      aria-pressed={marked}
      title={marked ? "Retirer des favoris" : "Ajouter aux favoris"}
      type="button"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={marked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={marked ? "text-amber-500" : ""}
      >
        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
      </svg>
    </button>
  )
}
