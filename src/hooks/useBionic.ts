"use client"
import { useEffect } from "react"

// Walks the article DOM and wraps the first half of each word in a
// <b class="bionic"> so it pops to the eye. Skips code blocks and headings
// (already bold). Toggleable: when `enabled` is false, the wrappers are
// unwound. Cheap enough to run on every prefs change — react-markdown's
// output is small per article (~hundreds of nodes).

const SKIP_SELECTOR = "pre, code, h1, h2, h3, h4, h5, h6, .bionic"
const WORD_RE = /(\S+)/g

function bionify(container: Element) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const targets: Text[] = []
  let node: Node | null
  while ((node = walker.nextNode())) {
    const parent = (node as Text).parentElement
    if (!parent) continue
    if (parent.closest(SKIP_SELECTOR)) continue
    if (!(node as Text).textContent?.trim()) continue
    targets.push(node as Text)
  }

  for (const textNode of targets) {
    const text = textNode.textContent ?? ""
    const fragment = document.createDocumentFragment()
    let lastIdx = 0
    for (const match of text.matchAll(WORD_RE)) {
      const word = match[0]
      const start = match.index ?? 0
      if (start > lastIdx) {
        fragment.appendChild(document.createTextNode(text.slice(lastIdx, start)))
      }
      const half = Math.max(1, Math.ceil(word.length / 2))
      const b = document.createElement("b")
      b.className = "bionic"
      b.textContent = word.slice(0, half)
      fragment.appendChild(b)
      if (half < word.length) {
        fragment.appendChild(document.createTextNode(word.slice(half)))
      }
      lastIdx = start + word.length
    }
    if (lastIdx < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIdx)))
    }
    textNode.parentNode?.replaceChild(fragment, textNode)
  }
}

function unbionify(container: Element) {
  container.querySelectorAll("b.bionic").forEach((b) => {
    const parent = b.parentNode
    if (!parent) return
    parent.replaceChild(document.createTextNode(b.textContent ?? ""), b)
    parent.normalize()
  })
}

export function useBionic(
  enabled: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  // Re-run when content changes (article navigation).
  deps: ReadonlyArray<unknown> = [],
) {
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (enabled) {
      bionify(el)
      return () => unbionify(el)
    }
    unbionify(el)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, containerRef, ...deps])
}
