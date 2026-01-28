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

      if (e.key === key) {
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
