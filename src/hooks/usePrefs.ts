"use client"
import { useEffect, useState } from "react"
import {
  getBookmarks,
  getPrefs,
  getReadArticles,
  isBookmarked,
  subscribe,
  type ReadingPrefs,
} from "@/lib/user-prefs"

// Reactive hooks. They start with safe defaults during SSR/initial render
// (no hydration mismatch) and rehydrate from localStorage on mount.

export function useBookmarks(): string[] {
  const [bookmarks, setBookmarks] = useState<string[]>([])
  useEffect(() => {
    setBookmarks(getBookmarks())
    return subscribe(() => setBookmarks(getBookmarks()))
  }, [])
  return bookmarks
}

export function useIsBookmarked(path: string): boolean {
  const [marked, setMarked] = useState(false)
  useEffect(() => {
    setMarked(isBookmarked(path))
    return subscribe(() => setMarked(isBookmarked(path)))
  }, [path])
  return marked
}

export function useReadArticles(): Set<string> {
  const [read, setRead] = useState<Set<string>>(new Set())
  useEffect(() => {
    setRead(getReadArticles())
    return subscribe(() => setRead(getReadArticles()))
  }, [])
  return read
}

export function useReadingPrefs(): ReadingPrefs {
  const [prefs, setPrefs] = useState<ReadingPrefs>(() => getPrefs())
  useEffect(() => {
    setPrefs(getPrefs())
    return subscribe(() => setPrefs(getPrefs()))
  }, [])
  return prefs
}
