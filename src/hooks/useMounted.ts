import { useState, useEffect } from "react"

/**
 * A hook that returns whether the component is mounted
 * Useful for avoiding hydration mismatches with client-only features
 * @returns Whether the component is mounted
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return mounted
}
