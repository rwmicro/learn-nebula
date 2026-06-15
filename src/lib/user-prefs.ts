// Client-side persistent user state via localStorage. All keys live under the
// "pensine:*" namespace so they're easy to spot/clear in devtools.
//
// Reactive consumers should subscribe via subscribe() — every write dispatches
// a CustomEvent so components in the same tab re-render in sync.

const NAMESPACE = "pensine"
const EVENT = "pensine:prefs-change"

type ScrollPositions = Record<string, { y: number; t: number }>

export interface ReadingPrefs {
  fontSize: "compact" | "normal" | "large"
  theme: "system" | "dark" | "light" | "sepia" | "editorial"
  focusMode: boolean
  bionic: boolean
}

const DEFAULT_PREFS: ReadingPrefs = {
  fontSize: "normal",
  theme: "system",
  focusMode: false,
  bionic: false,
}

function key(name: string): string {
  return `${NAMESPACE}:${name}`
}

function safeGet<T>(name: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(key(name))
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function safeSet(name: string, value: unknown): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(key(name), JSON.stringify(value))
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { name } }))
  } catch {
    // Quota exceeded or storage disabled — silently degrade.
  }
}

// ── Bookmarks ────────────────────────────────────────────────────────────────
export function getBookmarks(): string[] {
  return safeGet<string[]>("bookmarks", [])
}

export function isBookmarked(path: string): boolean {
  return getBookmarks().includes(path)
}

export function toggleBookmark(path: string): boolean {
  const list = getBookmarks()
  const idx = list.indexOf(path)
  if (idx === -1) {
    list.push(path)
  } else {
    list.splice(idx, 1)
  }
  safeSet("bookmarks", list)
  return idx === -1
}

// ── Read articles ────────────────────────────────────────────────────────────
export function getReadArticles(): Set<string> {
  return new Set(safeGet<string[]>("read", []))
}

export function markAsRead(path: string): void {
  const set = getReadArticles()
  if (set.has(path)) return
  set.add(path)
  safeSet("read", Array.from(set))
}

// ── Scroll positions (resume reading) ───────────────────────────────────────
const SCROLL_KEY = "scroll-positions"
const SCROLL_MAX_ENTRIES = 200 // cap to avoid unbounded growth

export function getScrollPosition(path: string): number | null {
  const positions = safeGet<ScrollPositions>(SCROLL_KEY, {})
  return positions[path]?.y ?? null
}

export function saveScrollPosition(path: string, y: number): void {
  const positions = safeGet<ScrollPositions>(SCROLL_KEY, {})
  positions[path] = { y, t: Date.now() }

  // LRU eviction once we exceed the cap, by timestamp.
  const entries = Object.entries(positions)
  if (entries.length > SCROLL_MAX_ENTRIES) {
    entries.sort((a, b) => a[1].t - b[1].t)
    for (let i = 0; i < entries.length - SCROLL_MAX_ENTRIES; i++) {
      delete positions[entries[i][0]]
    }
  }
  safeSet(SCROLL_KEY, positions)
}

export function clearScrollPosition(path: string): void {
  const positions = safeGet<ScrollPositions>(SCROLL_KEY, {})
  delete positions[path]
  safeSet(SCROLL_KEY, positions)
}

// ── Reading preferences ──────────────────────────────────────────────────────
export function getPrefs(): ReadingPrefs {
  return { ...DEFAULT_PREFS, ...safeGet<Partial<ReadingPrefs>>("prefs", {}) }
}

export function setPrefs(prefs: Partial<ReadingPrefs>): void {
  safeSet("prefs", { ...getPrefs(), ...prefs })
}

// ── Reactive subscription ────────────────────────────────────────────────────
export function subscribe(handler: () => void): () => void {
  const wrapper = () => handler()
  window.addEventListener(EVENT, wrapper)
  window.addEventListener("storage", wrapper)
  return () => {
    window.removeEventListener(EVENT, wrapper)
    window.removeEventListener("storage", wrapper)
  }
}
