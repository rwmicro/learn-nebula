"use client"
import { useEffect } from "react"

// Registers the offline-first service worker. No-op in dev (Next dev server
// invalidates service workers anyway, and we don't want to cache HMR chunks).
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {
        // Browser may block SW in private mode; silently degrade.
      })
  }, [])
  return null
}
