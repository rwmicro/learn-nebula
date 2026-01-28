"use client"
import { useState, useEffect } from "react"
import { logger } from "@/lib/logger"
import DOMPurify from "isomorphic-dompurify"

interface AnkiCard {
  id: number
  deckName: string
  question: string
  answer: string
  tags: string[]
}

interface AnkiDeck {
  deckName: string
  cards: AnkiCard[]
  totalCards: number
}

interface AnkiCardViewerProps {
  filePath: string
  title: string
}

export default function AnkiCardViewer({ filePath }: AnkiCardViewerProps) {
  const [deck, setDeck] = useState<AnkiDeck | null>(null)
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDeck = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/parse-anki?path=${encodeURIComponent(filePath)}`)

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "Failed to load Anki deck")
        }

        const data: AnkiDeck = await response.json()
        setDeck(data)
        setLoading(false)
      } catch (err) {
        logger.error("Failed to load Anki deck", {
          error: err instanceof Error ? err.message : String(err),
          path: filePath,
        })
        setError(err instanceof Error ? err.message : "Failed to load Anki deck")
        setLoading(false)
      }
    }

    fetchDeck()
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
          <p className="text-gray-600 dark:text-[#6b6b6b]">Chargement du deck Anki...</p>
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
      <div className="text-gray-500 dark:text-[#6b6b6b] p-6 bg-gray-50 dark:bg-[#121212] rounded-lg">
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
      <div className="bg-white dark:bg-[#121212] rounded-lg shadow-sm p-4 mb-6">
        <h3 className="text-xl font-medium text-gray-800 dark:text-[#e5e5e5]">{deck.deckName}</h3>
        <p className="text-sm text-gray-600 dark:text-[#6b6b6b] mt-1">
          {deck.totalCards} {deck.totalCards === 1 ? "carte" : "cartes"}
        </p>
      </div>

      {/* Card Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePrevious}
          disabled={currentCardIndex === 0}
          className="px-4 py-2 bg-gray-200 dark:bg-[#1a1a1a] text-gray-700 dark:text-[#a0a0a0] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-[#2a2a2a] transition-colors"
        >
          ← Précédent
        </button>
        <span className="text-sm text-gray-600 dark:text-[#6b6b6b]">
          Carte {currentCardIndex + 1} sur {deck.totalCards}
        </span>
        <button
          onClick={handleNext}
          disabled={currentCardIndex === deck.cards.length - 1}
          className="px-4 py-2 bg-gray-200 dark:bg-[#1a1a1a] text-gray-700 dark:text-[#a0a0a0] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-[#2a2a2a] transition-colors"
        >
          Suivant →
        </button>
      </div>

      {/* Card Display */}
      <div
        className="relative bg-white dark:bg-[#121212] rounded-lg shadow-lg p-8 min-h-[400px] cursor-pointer"
        onClick={handleFlip}
      >
        {/* Front of card (Question) */}
        {!isFlipped && (
          <div className="transition-opacity duration-200">
            <div className="text-center mb-4">
              <span className="inline-block bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-sm font-medium px-3 py-1 rounded-full">
                Question
              </span>
            </div>
            <div
              className="text-lg text-gray-800 dark:text-gray-200 prose dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={renderHTML(currentCard.question)}
            />
            <div className="text-center mt-8 text-sm text-gray-500 dark:text-[#6b6b6b]">
              Cliquez pour voir la réponse
            </div>
          </div>
        )}

        {/* Back of card (Answer) */}
        {isFlipped && (
          <div className="transition-opacity duration-200">
            <div className="text-center mb-4">
              <span className="inline-block bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 text-sm font-medium px-3 py-1 rounded-full">
                Réponse
              </span>
            </div>
            <div
              className="text-lg text-gray-800 dark:text-gray-200 prose dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={renderHTML(currentCard.answer)}
            />
            <div className="text-center mt-8 text-sm text-gray-500 dark:text-[#6b6b6b]">
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
              className="inline-block bg-gray-100 dark:bg-[#1a1a1a] text-gray-700 dark:text-[#a0a0a0] text-xs px-2 py-1 rounded"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Keyboard shortcuts hint */}
      <div className="mt-6 flex justify-center gap-6 text-xs text-gray-400 dark:text-[#525252]">
        <span>
          <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-[#1a1a1a] rounded border border-gray-200 dark:border-[#2a2a2a] font-mono">←</kbd>
          <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-[#1a1a1a] rounded border border-gray-200 dark:border-[#2a2a2a] font-mono ml-1">→</kbd>
          <span className="ml-2">naviguer</span>
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-[#1a1a1a] rounded border border-gray-200 dark:border-[#2a2a2a] font-mono">Espace</kbd>
          <span className="ml-2">retourner</span>
        </span>
      </div>
    </div>
  )
}
