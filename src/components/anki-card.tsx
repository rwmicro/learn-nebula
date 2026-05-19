"use client"
import { useState, useEffect } from "react"
import { logger } from "@/lib/logger"
import DOMPurify from "isomorphic-dompurify"
import type { AnkiDeck } from "@/lib/anki-parser"

interface AnkiCardViewerProps {
  filePath: string
}

export default function AnkiCardViewer({ filePath }: AnkiCardViewerProps) {
  const [deck, setDeck] = useState<AnkiDeck | null>(null)
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    import("@/lib/anki-parser")
      .then(({ parseAnkiFile }) => parseAnkiFile(filePath))
      .then((data) => {
        if (cancelled) return
        setDeck(data)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        logger.error("Failed to load Anki deck", {
          error: err instanceof Error ? err.message : String(err),
          path: filePath,
        })
        setError(err instanceof Error ? err.message : "Failed to load Anki deck")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filePath])

  const handleNext = () => {
    if (deck && currentCardIndex < deck.cards.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1)
      setIsFlipped(false)
    }
  }

  const handlePrevious = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1)
      setIsFlipped(false)
    }
  }

  const handleFlip = () => {
    setIsFlipped(!isFlipped)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault()
          handlePrevious()
          break
        case "ArrowRight":
          e.preventDefault()
          handleNext()
          break
        case " ": // Space
        case "Enter":
          e.preventDefault()
          handleFlip()
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [deck, currentCardIndex, isFlipped])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-neutral-600">Chargement du deck Anki...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-500 p-6 bg-red-50 dark:bg-red-900/20 rounded-lg">
        <h3 className="font-semibold text-lg mb-2">Error loading Anki deck</h3>
        <p>{error}</p>
      </div>
    )
  }

  if (!deck || deck.cards.length === 0) {
    return (
      <div className="text-[var(--c-text-3)] p-6 bg-[var(--c-surface)] rounded-lg">
        <h3 className="font-semibold text-lg mb-2">No cards found</h3>
        <p>This Anki deck appears to be empty.</p>
      </div>
    )
  }

  const currentCard = deck.cards[currentCardIndex]

  // Sanitize HTML content (Anki cards can contain HTML)
  // Strict sanitization to prevent XSS attacks
  const renderHTML = (html: string) => {
    const sanitized = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'u', 'br', 'p', 'span', 'div', 'strong', 'em', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'code', 'pre', 'sub', 'sup'],
      // Only allow safe attributes - NO style, NO src (prevents data: URI attacks)
      ALLOWED_ATTR: ['alt', 'width', 'height'],
      // Forbid dangerous URI schemes
      FORBID_ATTR: ['style', 'class', 'onclick', 'onerror', 'onload', 'onmouseover'],
      // Extra protection
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'svg', 'math'],
      // Don't allow data: URIs
      ALLOW_DATA_ATTR: false,
    })
    return { __html: sanitized }
  }

  return (
    <div className="w-full">
      {/* Deck Info Header */}
      <div className="bg-[var(--c-surface)] rounded-lg p-4 mb-6 border border-[var(--c-border)]">
        <h3 className="text-xl font-medium text-[var(--c-text-1)]">{deck.deckName}</h3>
        <p className="text-sm text-[var(--c-text-3)] mt-1">
          {deck.totalCards} {deck.totalCards === 1 ? "carte" : "cartes"}
        </p>
      </div>

      {/* Card Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePrevious}
          disabled={currentCardIndex === 0}
          className="px-4 py-2 bg-[var(--c-surface-hover)] text-[var(--c-text-2)] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--c-border)] transition-colors"
        >
          ← Précédent
        </button>
        <span className="text-sm text-[var(--c-text-3)]">
          Carte {currentCardIndex + 1} sur {deck.totalCards}
        </span>
        <button
          onClick={handleNext}
          disabled={currentCardIndex === deck.cards.length - 1}
          className="px-4 py-2 bg-[var(--c-surface-hover)] text-[var(--c-text-2)] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--c-border)] transition-colors"
        >
          Suivant →
        </button>
      </div>

      {/* Card Display */}
      <div
        className="relative bg-[var(--c-surface)] rounded-lg border border-[var(--c-border)] p-8 min-h-[400px] cursor-pointer"
        onClick={handleFlip}
      >
        {/* Front of card (Question) */}
        {!isFlipped && (
          <div className="transition-opacity duration-200">
            <div className="text-center mb-4">
              <span className="inline-block bg-[var(--c-surface-hover)] text-[var(--c-text-1)] text-sm font-medium px-3 py-1 rounded-full">
                Question
              </span>
            </div>
            <div
              className="text-lg text-[var(--c-text-1)] prose dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={renderHTML(currentCard.question)}
            />
            <div className="text-center mt-8 text-sm text-neutral-600">
              Cliquez pour voir la réponse
            </div>
          </div>
        )}

        {/* Back of card (Answer) */}
        {isFlipped && (
          <div className="transition-opacity duration-200">
            <div className="text-center mb-4">
              <span className="inline-block bg-[var(--c-surface-hover)] text-[var(--c-text-1)] text-sm font-medium px-3 py-1 rounded-full">
                Réponse
              </span>
            </div>
            <div
              className="text-lg text-[var(--c-text-1)] prose dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={renderHTML(currentCard.answer)}
            />
            <div className="text-center mt-8 text-sm text-neutral-600">
              Cliquez pour voir la question
            </div>
          </div>
        )}
      </div>

      {/* Tags */}
      {currentCard.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {currentCard.tags.map((tag, index) => (
            <span
              key={index}
              className="inline-block bg-[var(--c-surface-hover)] text-[var(--c-text-2)] text-xs px-2 py-1 rounded"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Keyboard shortcuts hint */}
      <div className="mt-6 flex justify-center gap-6 text-xs text-[var(--c-text-3)]">
        <span>
          <kbd className="px-1.5 py-0.5 bg-[var(--c-surface-hover)] rounded border border-[var(--c-border)] font-mono">←</kbd>
          <kbd className="px-1.5 py-0.5 bg-neutral-900 rounded border border-neutral-800 font-mono ml-1">→</kbd>
          <span className="ml-2">naviguer</span>
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-[var(--c-surface-hover)] rounded border border-[var(--c-border)] font-mono">Espace</kbd>
          <span className="ml-2">retourner</span>
        </span>
      </div>
    </div>
  )
}
