import { useEffect } from "react"

interface UseKeyboardShortcutArgs {
  key: string
  onKeyPressed: (event: KeyboardEvent) => void
}

export function useKeyboardShortcut({
  key,
  onKeyPressed,
}: UseKeyboardShortcutArgs) {
  useEffect(() => {
    function keyDownHandler(e: KeyboardEvent) {
      const activeElement = document.activeElement
      const isInputActive =
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA"

      // Allow Escape key even if an input is active
      if (isInputActive && e.key !== "Escape") return

      // Case-insensitive single-character matching so registering "k" also
      // catches "K" (shift held / caps lock). Multi-char keys like "Escape"
      // compare exactly.
      const normalizedKey = key.length === 1 ? key.toLowerCase() : key
      const normalizedEvent = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (normalizedEvent === normalizedKey) {
        e.preventDefault()
        onKeyPressed(e)
      }
    }

    document.addEventListener("keydown", keyDownHandler)
    return () => {
      document.removeEventListener("keydown", keyDownHandler)
    }
  }, [key, onKeyPressed])
}
