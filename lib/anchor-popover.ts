// The link-preview and glossary cards (public/js/popover.js, glossary.js)
// placed by the browser instead of by script, where it can: the card is a
// popover in the top layer, tied to its link by CSS anchor positioning
// (assets/css/main.css, `.note-popover[popover]`), so it follows the link on
// scroll and turns over by itself near the edges (position-try-fallbacks).
// popover="hint" where supported (it never closes an open menu or dialog),
// "manual" otherwise. Browsers without anchor positioning keep the scripts'
// own getBoundingClientRect placement.

export type AnchorMode = "hint" | "manual";

/** The popover type to use, or null when the card must be placed by script. */
export function anchoredPopoverMode(
  prefer: AnchorMode = "hint",
): AnchorMode | null {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function")
    return null;
  if (
    !CSS.supports("anchor-name: --a") ||
    !CSS.supports("position-area: block-end")
  )
    return null;
  if (
    typeof HTMLElement === "undefined" ||
    !("popover" in HTMLElement.prototype)
  )
    return null;
  if (prefer === "manual") return "manual";
  // An unknown value reflects as "manual" (the attribute's invalid default).
  const probe = document.createElement("div");
  probe.setAttribute("popover", "hint");
  return probe.popover === "hint" ? "hint" : "manual";
}

export interface AnchoredCard {
  /** Opens the card on `trigger` (or moves it there when already open). */
  show(trigger: HTMLElement): void;
  hide(): void;
  isOpen(): boolean;
}

/**
 * Makes `card` an anchored popover. `onClosed` runs whenever it closes,
 * including on the browser's own dismissal (Escape, a click elsewhere for a
 * "hint"), so the script's state stays in step.
 */
export function anchoredCard(
  card: HTMLElement,
  name: string,
  mode: AnchorMode,
  onClosed: () => void,
): AnchoredCard {
  card.setAttribute("popover", mode);
  card.hidden = false;
  card.style.setProperty("position-anchor", name);
  let trigger: HTMLElement | null = null;
  const isOpen = () => card.matches(":popover-open");
  const detach = () => {
    trigger?.style.removeProperty("anchor-name");
    trigger = null;
  };
  // "beforetoggle" fires synchronously, so a card hidden then shown on
  // another link within one task never loses its new anchor.
  card.addEventListener("beforetoggle", (e) => {
    if ((e as ToggleEvent).newState !== "closed") return;
    detach();
    onClosed();
  });
  return {
    show(el) {
      if (trigger !== el) {
        detach();
        el.style.setProperty("anchor-name", name);
        trigger = el;
      }
      if (!isOpen()) {
        try {
          card.showPopover();
        } catch {
          /* disconnected, or already shown by another path */
        }
      }
    },
    hide() {
      if (!isOpen()) return detach();
      try {
        card.hidePopover();
      } catch {
        detach();
      }
    },
    isOpen,
  };
}
