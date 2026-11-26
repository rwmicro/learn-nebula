// The chat's line icons (24×24, stroke = currentColor), shared by GardenChat
// and its pieces. Decorative: every one carries aria-hidden.

const st = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
export const Ic = {
  sprout: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M12 21v-7" />
      <path d="M12 14C7 14 4.5 11 4.5 6.5 9 6.5 12 9 12 14Z" />
      <path d="M12 12c0-4.5 3-7.5 7.5-7.5 0 4.5-3 7.5-7.5 7.5Z" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.2} aria-hidden="true">
      <path d="m15 5-7 7 7 7" />
    </svg>
  ),
  edit: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M12 20h8M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  down: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.6} aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  doc: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  ),
  mic: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  ),
  up: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.4} aria-hidden="true">
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </svg>
  ),
  thumb: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M7 11v9H4v-9h3Zm0 0 4-7c1.5 0 2.5 1 2.2 2.6L12.7 10H19a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7" />
    </svg>
  ),
  speak: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4ZM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  ),
  redo: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />
    </svg>
  ),
  cards: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <rect x="3" y="7" width="14" height="13" rx="2" />
      <path d="M7 4h12a2 2 0 0 1 2 2v11" />
    </svg>
  ),
  chev: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.4} aria-hidden="true">
      <path d="m9 5 7 7-7 7" />
    </svg>
  ),
  chip: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </svg>
  ),
  dl: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  ),
  wifi: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.7 15.8a5 5 0 0 1 6.6 0" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  ),
  disk: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15h.01M11 15h6" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.4} aria-hidden="true">
      <path d="m5 12 5 5 9-10" />
    </svg>
  ),
  q: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  side: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  ),
  dock: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M14 4v16M6.5 9h4M6.5 12.5h4" />
    </svg>
  ),
  expand: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
    </svg>
  ),
  shrink: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M20 4l-6 6M14 5v5h5M4 20l6-6M5 14h5v5" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.6} aria-hidden="true">
      <circle cx="5" cy="12" r="0.8" />
      <circle cx="12" cy="12" r="0.8" />
      <circle cx="19" cy="12" r="0.8" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.2} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M9 4h6l-1 6 4 3H6l4-3-1-6ZM12 13v7" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  ),
  kbd: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.2} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  sel: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M8 12h8" />
    </svg>
  ),
  sec: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M4 6h16M4 12h10M4 18h7" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.2} aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  ),
};
