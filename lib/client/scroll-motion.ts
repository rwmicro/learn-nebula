// How a scroll the site starts should move: smoothly, unless the reader asked
// the system for reduced motion. The page itself (global.css) only scrolls
// smoothly under `prefers-reduced-motion: no-preference`, so a scroll that
// passes `behavior: "smooth"` must ask here first or it would ignore that.

/** "smooth", or "instant" when the reader prefers reduced motion. */
export function scrollMotion(): ScrollBehavior {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "instant"
    : "smooth";
}
