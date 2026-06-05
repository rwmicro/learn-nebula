"use client"
import { useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { setPrefs, type ReadingPrefs as Prefs } from "@/lib/user-prefs"
import { useReadingPrefs } from "@/hooks/usePrefs"

// Applies the persisted preferences to <html> as soon as the app mounts so
// the chosen font / sepia / focus mode survive reloads with no FOUC.
export function ReadingPrefsApplier() {
  const prefs = useReadingPrefs()
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    const root = document.documentElement
    root.dataset.font = prefs.fontSize
    root.dataset.focus = prefs.focusMode ? "on" : "off"
    root.dataset.bionic = prefs.bionic ? "on" : "off"
    root.classList.toggle("sepia", prefs.theme === "sepia")

    if (prefs.theme === "dark" && resolvedTheme !== "dark") setTheme("dark")
    if (prefs.theme === "light" && resolvedTheme !== "light") setTheme("light")
  }, [prefs, resolvedTheme, setTheme])

  return null
}

export function ReadingPrefsButton() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const prefs = useReadingPrefs()

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  const update = (patch: Partial<Prefs>) => setPrefs(patch)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-lg bg-[var(--c-surface)] border border-[var(--c-border)] hover:bg-[var(--c-surface-hover)] transition-colors text-[var(--c-text-2)]"
        aria-label="Préférences de lecture"
        aria-expanded={open}
        title="Préférences de lecture"
        type="button"
      >
        <span className="font-serif text-sm font-medium leading-none">Aa</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1rem)] bg-[var(--c-surface)] border border-[var(--c-border)] rounded-xl shadow-2xl z-[55] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--c-text-3)] mb-3">
            Lecture
          </h3>

          {/* Font size */}
          <div className="mb-4">
            <label className="block text-xs text-[var(--c-text-3)] mb-1.5">Taille du texte</label>
            <div className="flex gap-1 rounded-lg bg-[var(--c-surface-hover)] p-0.5">
              {(["compact", "normal", "large"] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => update({ fontSize: size })}
                  className={`flex-1 px-2 py-1.5 text-xs rounded-md transition-colors ${
                    prefs.fontSize === size
                      ? "bg-[var(--c-bg)] text-[var(--c-text-1)] font-medium"
                      : "text-[var(--c-text-2)] hover:text-[var(--c-text-1)]"
                  }`}
                  type="button"
                >
                  {size === "compact" ? "A−" : size === "large" ? "A+" : "A"}
                </button>
              ))}
            </div>
          </div>

          {/* Theme */}
          <div className="mb-4">
            <label className="block text-xs text-[var(--c-text-3)] mb-1.5">Thème</label>
            <div className="flex gap-1 rounded-lg bg-[var(--c-surface-hover)] p-0.5">
              {(["dark", "light", "sepia"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => update({ theme: t })}
                  className={`flex-1 px-2 py-1.5 text-xs rounded-md transition-colors capitalize ${
                    prefs.theme === t
                      ? "bg-[var(--c-bg)] text-[var(--c-text-1)] font-medium"
                      : "text-[var(--c-text-2)] hover:text-[var(--c-text-1)]"
                  }`}
                  type="button"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Focus mode */}
          <label className="flex items-center justify-between py-2 cursor-pointer">
            <span className="text-sm text-[var(--c-text-2)]">Mode focus</span>
            <input
              type="checkbox"
              checked={prefs.focusMode}
              onChange={(e) => update({ focusMode: e.target.checked })}
              className="w-9 h-5 appearance-none rounded-full bg-[var(--c-surface-hover)] border border-[var(--c-border)] relative cursor-pointer transition-colors checked:bg-[var(--c-text-2)] before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:w-3.5 before:h-3.5 before:bg-[var(--c-bg)] before:rounded-full before:transition-transform checked:before:translate-x-4"
            />
          </label>

          {/* Bionic reading */}
          <label className="flex items-center justify-between py-2 cursor-pointer">
            <span className="text-sm text-[var(--c-text-2)]">Lecture bionique</span>
            <input
              type="checkbox"
              checked={prefs.bionic}
              onChange={(e) => update({ bionic: e.target.checked })}
              className="w-9 h-5 appearance-none rounded-full bg-[var(--c-surface-hover)] border border-[var(--c-border)] relative cursor-pointer transition-colors checked:bg-[var(--c-text-2)] before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:w-3.5 before:h-3.5 before:bg-[var(--c-bg)] before:rounded-full before:transition-transform checked:before:translate-x-4"
            />
          </label>

          <p className="mt-2 pt-2 border-t border-[var(--c-border)] text-[10px] text-[var(--c-text-3)] leading-relaxed">
            La lecture bionique met en gras le début de chaque mot pour faciliter le balayage visuel.
          </p>
        </div>
      )}
    </div>
  )
}
