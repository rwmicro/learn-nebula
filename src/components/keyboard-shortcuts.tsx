"use client"

import { useState, useEffect } from "react"
import { useKeyboardShortcut } from "@/hooks/keyPressed"

const shortcuts = [
  { keys: ["Ctrl", "K"], description: "Ouvrir la recherche" },
  { keys: ["Esc"], description: "Fermer la recherche / modal" },
  { keys: ["↑", "↓"], description: "Naviguer dans les résultats" },
  { keys: ["Enter"], description: "Ouvrir le fichier sélectionné" },
  { keys: ["?"], description: "Afficher les raccourcis clavier" },
]

export function KeyboardShortcuts() {
  const [isOpen, setIsOpen] = useState(false)

  // Close on Escape
  useKeyboardShortcut({
    key: "Escape",
    onKeyPressed: () => setIsOpen(false),
  })

  // Open on ?
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if ? is pressed (Shift + /)
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        const activeElement = document.activeElement
        const isInputActive =
          activeElement?.tagName === "INPUT" ||
          activeElement?.tagName === "TEXTAREA"

        if (!isInputActive) {
          e.preventDefault()
          setIsOpen(true)
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 rounded-lg bg-neutral-100 dark:bg-[#121212] border border-neutral-200 dark:border-[#2a2a2a] hover:bg-neutral-200 dark:hover:bg-[#252525] transition-colors text-gray-600 dark:text-[#a0a0a0]"
        aria-label="Keyboard shortcuts"
        title="Raccourcis clavier (?)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M6 8h.001" />
          <path d="M10 8h.001" />
          <path d="M14 8h.001" />
          <path d="M18 8h.001" />
          <path d="M8 12h.001" />
          <path d="M12 12h.001" />
          <path d="M16 12h.001" />
          <path d="M7 16h10" />
        </svg>
      </button>
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/70 z-[60]"
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#121212] rounded-xl shadow-2xl z-[60] w-[90vw] max-w-md p-6"
        role="dialog"
        aria-modal="true"
        aria-label="Raccourcis clavier"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-[#e5e5e5]">
            Raccourcis clavier
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[#252525] text-gray-500 dark:text-[#6b6b6b]"
            aria-label="Fermer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          {shortcuts.map((shortcut, index) => (
            <div
              key={index}
              className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-[#2a2a2a] last:border-0"
            >
              <span className="text-gray-700 dark:text-[#a0a0a0]">
                {shortcut.description}
              </span>
              <div className="flex gap-1">
                {shortcut.keys.map((key, keyIndex) => (
                  <kbd
                    key={keyIndex}
                    className="px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-[#1a1a1a] text-gray-700 dark:text-[#a0a0a0] border border-gray-300 dark:border-[#252525] rounded"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-gray-500 dark:text-[#6b6b6b] text-center">
          Appuyez sur <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 dark:bg-[#1a1a1a] rounded">Esc</kbd> pour fermer
        </p>
      </div>
    </>
  )
}
