"use client"
import { useEffect, useRef, useState } from "react"

// Reads the current article aloud via the Web Speech API. Pure client-side,
// uses the operating system's voices — no third-party API or bundle weight.
export function AudioNarrator({ getText }: { getText: () => string }) {
  const [supported, setSupported] = useState(false)
  const [playing, setPlaying] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window)
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const stop = () => {
    window.speechSynthesis.cancel()
    setPlaying(false)
  }

  const play = () => {
    const text = getText()
    if (!text.trim()) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = document.documentElement.lang || "fr-FR"
    utt.rate = 1
    utt.onend = () => setPlaying(false)
    utt.onerror = () => setPlaying(false)
    utteranceRef.current = utt
    window.speechSynthesis.speak(utt)
    setPlaying(true)
  }

  if (!supported) return null

  return (
    <button
      onClick={playing ? stop : play}
      className="p-1.5 rounded-md hover:bg-[var(--c-surface-hover)] transition-colors text-[var(--c-text-3)] hover:text-[var(--c-text-1)]"
      aria-label={playing ? "Arrêter la lecture audio" : "Écouter l'article"}
      title={playing ? "Arrêter" : "Écouter l'article"}
      type="button"
    >
      {playing ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
    </button>
  )
}
