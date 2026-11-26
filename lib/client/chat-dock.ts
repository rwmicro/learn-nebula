// « Côte à côte »: the garden chat (components/chat/GardenChat.tsx) beside
// the page instead of over it, with nothing of the page hidden.
//
// The page can't be told "you are 990px wide" — its layout follows the
// viewport (155 media queries, Tailwind breakpoints, scripts reading
// innerWidth). So the site shows the page in a same-origin frame exactly as
// wide as the room left of the chat: every layout rule then behaves as on a
// screen that size (the contents rail folds into the ☰ button, the side cards
// move under the title…), and links navigate the frame while the chat stays.
// The top document stays underneath, hidden (`html.gc-docked`, chat.css), its
// URL and title kept in step with the frame's page.
//
// In the frame, the page's own GardenChat sees `inDockFrame()` and only
// forwards its events (Expliquer, the « Demander » bar…) to this one.
//
// The server allows same-origin framing only (X-Frame-Options SAMEORIGIN,
// frame-ancestors 'self', server/index.ts).

export const DOCK_MIN_WIDTH = 1100;
const FRAME_CLASS = "gc-frame";

let frame: HTMLIFrameElement | null = null;
/** The top document's own URL when docking: undocking elsewhere reloads. */
let topUrl = "";
let themeObs: MutationObserver | null = null;

export const isDocked = () => !!frame;

/** Room for the page beside the chat (and we aren't the frame ourselves). */
export function canDock(): boolean {
  return (
    typeof window !== "undefined" &&
    window === window.top &&
    window.innerWidth >= DOCK_MIN_WIDTH
  );
}

/** Running inside the docked chat's frame: the page's chat stays passive. */
export function inDockFrame(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window !== window.parent &&
      window.parent.location.origin === location.origin &&
      window.parent.document.documentElement.classList.contains("gc-docked")
    );
  } catch {
    return false;
  }
}

function frameWin(): Window | null {
  try {
    const w = frame?.contentWindow;
    return w && w.location.origin === location.origin ? w : null;
  } catch {
    return null;
  }
}

/** The window showing the page the reader reads: the frame when docked. */
export function pageWindow(): Window {
  return frameWin() ?? window;
}
export const pageDoc = (): Document => pageWindow().document;

/** The page's current URL (path + query + hash). */
export function pageUrl(): string {
  const l = pageWindow().location;
  return l.pathname + l.search + l.hash;
}

/** Show `url` in the page: in the frame when docked, else a navigation. */
export function navigatePage(url: string): void {
  const w = frameWin();
  if (w) w.location.assign(url);
  else location.assign(url);
}

/** The id of the heading at the top of the reading view, to scroll a page
 *  laid out at another width back to the same place. */
export function readingAnchor(doc: Document, win: Window): string {
  let id = "";
  for (const h of Array.from(
    doc.querySelectorAll<HTMLElement>("main h2[id], main h3[id]"),
  )) {
    if (h.getBoundingClientRect().top > win.innerHeight * 0.3) break;
    id = h.id;
  }
  return id;
}

function scrollToAnchor(doc: Document, id: string) {
  if (!id) return;
  const el = doc.getElementById(id);
  el?.scrollIntoView({ block: "start" });
}

interface DockHooks {
  /** Every page the frame shows (the first one and each navigation). */
  onPage(win: Window): void;
}

/** Put the page beside the chat. */
export function dock(hooks: DockHooks): void {
  if (frame || !canDock()) return;
  const anchor = readingAnchor(document, window);
  const ratio =
    document.documentElement.scrollHeight > innerHeight
      ? scrollY / (document.documentElement.scrollHeight - innerHeight)
      : 0;
  topUrl = location.href;
  const f = document.createElement("iframe");
  f.className = FRAME_CLASS;
  f.title = document.title;
  f.src = location.href;
  let first = true;
  f.addEventListener("load", () => {
    const w = frameWin();
    if (!w) {
      // Left the site (a link the click guard missed): follow it up here.
      try {
        const href = f.contentWindow?.location.href;
        if (href) location.assign(href);
      } catch {
        undock();
      }
      return;
    }
    const d = w.document;
    if (first) {
      first = false;
      if (anchor) scrollToAnchor(d, anchor);
      else if (ratio > 0)
        w.scrollTo(0, ratio * (d.documentElement.scrollHeight - w.innerHeight));
    }
    // Keep the address bar and the tab's title on the page being read.
    try {
      const u = w.location.pathname + w.location.search + w.location.hash;
      if (u !== location.pathname + location.search + location.hash)
        history.replaceState(history.state, "", u);
      document.title = d.title;
      f.title = d.title;
    } catch {
      /* ignore */
    }
    // Links off the site open up here (other sites refuse to be framed).
    d.addEventListener(
      "click",
      (e) => {
        const a = (e.target as Element | null)?.closest?.(
          "a[href]",
        ) as HTMLAnchorElement | null;
        if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
        if (a.origin !== location.origin) a.target = "_top";
      },
      true,
    );
    // The theme follows the page's toggle.
    themeObs?.disconnect();
    const mirror = () => {
      for (const k of ["data-theme", "data-paper"]) {
        const v = d.documentElement.getAttribute(k);
        if (v === null) document.documentElement.removeAttribute(k);
        else document.documentElement.setAttribute(k, v);
      }
    };
    mirror();
    themeObs = new MutationObserver(mirror);
    themeObs.observe(d.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-paper"],
    });
    hooks.onPage(w);
  });
  document.documentElement.classList.add("gc-docked");
  document.body.appendChild(f);
  frame = f;
}

/** Back to the chat over the page. Returns where the reader is: when that is
 *  another page than the top document, the caller reloads onto it. */
export function undock(): { url: string; moved: boolean } {
  const w = frameWin();
  const url = w ? w.location.href : location.href;
  const anchor = w ? readingAnchor(w.document, w) : "";
  themeObs?.disconnect();
  themeObs = null;
  frame?.remove();
  frame = null;
  document.documentElement.classList.remove("gc-docked");
  const strip = (u: string) => u.replace(/#.*$/, "");
  const moved = !!topUrl && strip(url) !== strip(topUrl);
  if (!moved) {
    if (anchor) scrollToAnchor(document, anchor);
  }
  return { url, moved };
}

// --- reading the page ------------------------------------------------------

const BLOCKS = "p, li, blockquote, td, th, dd, figcaption, h2, h3, h4";

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Scroll to a cited passage and light it up for a moment. `hash` is the
 *  source URL's anchor, `excerpt` the start of the cited text. */
export function flashPassage(
  doc: Document,
  { hash, excerpt }: { hash?: string; excerpt?: string },
): boolean {
  const body =
    doc.querySelector("main .article-body") ?? doc.querySelector("main");
  if (!body) return false;
  let el: Element | null = null;
  const probe = norm((excerpt ?? "").replace(/…$/, "")).slice(0, 60);
  if (probe.length >= 12) {
    for (const b of Array.from(body.querySelectorAll(BLOCKS))) {
      if (norm(b.textContent ?? "").includes(probe)) {
        el = b;
        break;
      }
    }
    // The excerpt can start mid-block, or span two: retry on its first words.
    if (!el) {
      const short = probe.split(" ").slice(0, 5).join(" ");
      if (short.length >= 12)
        el =
          Array.from(body.querySelectorAll(BLOCKS)).find((b) =>
            norm(b.textContent ?? "").includes(short),
          ) ?? null;
    }
  }
  if (!el && hash) {
    try {
      el = doc.getElementById(decodeURIComponent(hash.replace(/^#/, "")));
    } catch {
      el = null;
    }
  }
  if (!el) return false;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.remove("gk-flash");
  void (el as HTMLElement).offsetWidth;
  el.classList.add("gk-flash");
  window.setTimeout(() => el?.classList.remove("gk-flash"), 2600);
  return true;
}

/** The section the reader is looking at: its heading and its text. */
export function visibleSection(
  doc: Document,
  win: Window,
  maxChars = 3000,
): { title: string; text: string } | null {
  const body = doc.querySelector("main .article-body");
  if (!body) return null;
  const heads = Array.from(body.querySelectorAll<HTMLElement>("h2, h3"));
  if (!heads.length) return null;
  let cur = heads[0];
  for (const h of heads) {
    if (h.getBoundingClientRect().top > win.innerHeight * 0.35) break;
    cur = h;
  }
  const level = Number(cur.tagName[1]);
  const parts: string[] = [];
  for (let n = cur.nextElementSibling; n; n = n.nextElementSibling) {
    if (/^H[1-3]$/.test(n.tagName) && Number(n.tagName[1]) <= level) break;
    if (n.matches("script, style, button, .anchor, [aria-hidden='true']"))
      continue;
    const t = (n as HTMLElement).innerText ?? n.textContent ?? "";
    if (t.trim()) parts.push(t.trim());
    if (parts.join("\n").length > maxChars) break;
  }
  const title = headingWords(cur);
  const text = parts.join("\n\n").slice(0, maxChars).trim();
  return title && text ? { title, text } : null;
}

/** A heading's words, without its "#" link or section number. */
export function headingWords(h: Element): string {
  const c = h.cloneNode(true) as Element;
  c.querySelectorAll(".anchor, .sec-num, .sec-n, [aria-hidden='true']").forEach(
    (x) => x.remove(),
  );
  return (c.textContent ?? "")
    .replace(/\s+/g, " ")
    .replace(/^\d+(\.\d+)*[.\s]*/, "")
    .trim();
}

/** The note's readable text, from a page's HTML (« Une autre note… »). */
export function noteTextFromHtml(html: string, maxChars = 3000): string {
  const d = new DOMParser().parseFromString(html, "text/html");
  const body = d.querySelector("main .article-body") ?? d.querySelector("main");
  if (!body) return "";
  body
    .querySelectorAll(
      "script, style, nav, button, .anchor, [aria-hidden='true'], .katex-mathml",
    )
    .forEach((x) => x.remove());
  const parts: string[] = [];
  for (const b of Array.from(
    body.querySelectorAll("h2, h3, p, li, blockquote, td"),
  )) {
    const t = (b.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t) parts.push(b.tagName.startsWith("H") ? `## ${t}` : t);
    if (parts.join("\n").length > maxChars) break;
  }
  return parts.join("\n").slice(0, maxChars).trim();
}
