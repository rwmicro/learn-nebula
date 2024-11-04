"use client"

import { useEffect } from "react";

interface UseKeyboardShortcutArgs {
  key: string;
  onKeyPressed: (event: KeyboardEvent) => void;
}

export function useKeyboardShortcut({ key, onKeyPressed }: UseKeyboardShortcutArgs) {
  useEffect(() => {
    function keyDownHandler(e: KeyboardEvent) {
      if (e.key === key) {
        e.preventDefault();
        onKeyPressed(e);
      }
    }

    document.addEventListener("keydown", keyDownHandler);

    return () => {
      document.removeEventListener("keydown", keyDownHandler);
    };
  }, [key, onKeyPressed]);
}
