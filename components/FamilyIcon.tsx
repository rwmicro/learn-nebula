import type { PathFamily } from "@/lib/path-family";

// One small glyph per reading-path colour family (lib/path-family.ts), shared
// by the home, the tab bar's mini player, Parcours and Notes.

export const glyphStroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** One small glyph per colour family (lib/path-family.ts). */
export function FamilyIcon({ family }: { family: PathFamily | null }) {
  switch (family) {
    case "sciences":
      return (
        <svg viewBox="0 0 24 24" {...glyphStroke}>
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <ellipse cx="12" cy="12" rx="9" ry="3.6" />
          <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" />
          <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" />
        </svg>
      );
    case "informatique":
      return (
        <svg viewBox="0 0 24 24" {...glyphStroke} strokeWidth={2.2}>
          <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />
        </svg>
      );
    case "vivant":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 19C5 10 10 5 20 4c-1 10-6 15-15 15Z" />
        </svg>
      );
    case "pensee":
      return (
        <svg viewBox="0 0 24 24" {...glyphStroke}>
          <path d="M4 20h16M6 20V10M12 20V10M18 20V10M3 10l9-6 9 6" />
        </svg>
      );
    case "societe":
      return (
        <svg viewBox="0 0 24 24" {...glyphStroke}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
        </svg>
      );
    case "arts":
      return (
        <svg viewBox="0 0 24 24" {...glyphStroke}>
          <path d="M14 4l6 6-8 8-6-6z" />
          <path d="M6 12l-3 8 8-3" />
        </svg>
      );
    case "langues":
      return (
        <svg viewBox="0 0 24 24" {...glyphStroke}>
          <path d="M4 5h9M8.5 3v2M6 5c1 4 4 7 7 8M11 5c-1 4-4 7-7 8M13 21l4-9 4 9M14.5 18h5" />
        </svg>
      );
    case "jeux":
      return (
        <svg viewBox="0 0 24 24" {...glyphStroke}>
          <path d="M8 20h8M9 20l1-6-3-2 3-6h4l3 6-3 2 1 6" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" {...glyphStroke}>
          <path d="M12 21v-8" />
          <path d="M12 14C7 14 4.5 11 4.5 6.5 9 6.5 12 9 12 14Z" fill="currentColor" />
          <path d="M12 12c0-4.5 3-7.5 7.5-7.5 0 4.5-3 7.5-7.5 7.5Z" fill="currentColor" opacity=".6" />
        </svg>
      );
  }
}

