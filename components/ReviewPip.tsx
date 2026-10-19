"use client";

import { useCallback, useEffect, useState } from "react";

// "Réviser en flottant": the review session's card and buttons in a Document
// Picture-in-Picture window (Chrome and Edge on a computer), above the other
// windows, so a reader can review while working elsewhere. ReviewSession.tsx
// portals the same card into it, so the session state stays its own; closing
// the small window brings the card back to the page.

interface PipApi {
  requestWindow(opts?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
}

function pipApi(): PipApi | null {
  if (typeof window === "undefined" || !("documentPictureInPicture" in window))
    return null;
  return (window as Window & { documentPictureInPicture: PipApi })
    .documentPictureInPicture;
}

/** The page's stylesheets (Tailwind, the site's CSS) and theme attributes,
 *  copied into the floating window so the card looks the same there. */
function copyLook(win: Window) {
  const doc = win.document;
  for (const sheet of Array.from(document.styleSheets)) {
    const node = sheet.ownerNode;
    if (node instanceof HTMLLinkElement) {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = node.href;
      if (node.media) link.media = node.media;
      doc.head.appendChild(link);
      continue;
    }
    try {
      const style = doc.createElement("style");
      style.textContent = Array.from(sheet.cssRules, (r) => r.cssText).join(
        "\n",
      );
      doc.head.appendChild(style);
    } catch {
      /* a cross-origin sheet: its rules cannot be read */
    }
  }
  const root = document.documentElement;
  for (const a of ["class", "data-theme", "lang", "dir", "style"]) {
    const v = root.getAttribute(a);
    if (v != null) doc.documentElement.setAttribute(a, v);
  }
  doc.title = document.title;
  doc.body.className = "rs-pip";
}

export function usePipWindow(): {
  supported: boolean;
  win: Window | null;
  open: () => void;
  close: () => void;
} {
  const [supported, setSupported] = useState(false);
  const [win, setWin] = useState<Window | null>(null);
  // Client-only: the static export renders without the button.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setSupported(pipApi() !== null), []);

  const open = useCallback(() => {
    const api = pipApi();
    if (!api || api.window) return;
    api.requestWindow({ width: 400, height: 520 }).then(
      (w) => {
        copyLook(w);
        w.addEventListener("pagehide", () => setWin(null), { once: true });
        setWin(w);
      },
      () => {},
    );
  }, []);
  const close = useCallback(() => setWin(null), []);
  // Dropping the window (close(), the session ending, leaving the page)
  // closes it; closing it by hand lands here through "pagehide".
  useEffect(() => {
    if (!win) return;
    return () => win.close();
  }, [win]);
  return { supported, win, open, close };
}
