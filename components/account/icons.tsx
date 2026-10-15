// Line icons of the phone account screens (24 × 24, currentColor), and the
// small pieces they share: the coin, the row chevron, the glass top bar.

import type { ReactNode } from "react";

function Svg({ children, w = 1.8, className }: { children: ReactNode; w?: number; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconBack = () => (
  <Svg w={2.3}>
    <path d="m15 5-7 7 7 7" />
  </Svg>
);
export const IconClose = () => (
  <Svg w={2.2}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const IconArrow = () => (
  <Svg w={2.2}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const IconCheck = () => (
  <Svg w={2.6}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);
export const IconMail = () => (
  <Svg>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m4 7 8 6 8-6" />
  </Svg>
);
export const IconSync = () => (
  <Svg>
    <path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" />
    <path d="M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 14.5 4.5L20 16" />
    <path d="M20 20v-4h-4" />
  </Svg>
);
export const IconGear = () => (
  <Svg w={1.6}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </Svg>
);
export const IconSnow = ({ w = 1.8 }: { w?: number }) => (
  <Svg w={w}>
    <path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7" />
    <path d="m9.5 3.5 2.5 2 2.5-2M9.5 20.5l2.5-2 2.5 2" />
  </Svg>
);
export const IconFlame = () => (
  <svg viewBox="0 0 24 24" className="ap-flame" aria-hidden="true">
    <path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.7 2-4.5 0 2 1 3 2 3 0-4 1-6.5 1-8.5z" />
  </svg>
);
export const IconPencil = () => (
  <Svg w={2.2}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </Svg>
);
export const IconHistory = () => (
  <Svg>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 8v4l3 2" />
  </Svg>
);
export const IconDownload = () => (
  <Svg>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Svg>
);
export const IconLogout = () => (
  <Svg>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 16l-4-4 4-4M6 12h10" />
  </Svg>
);
export const IconTrash = () => (
  <Svg>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
);
export const IconLock = ({ w = 2 }: { w?: number }) => (
  <Svg w={w}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);
export const IconShield = () => (
  <Svg>
    <path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);
export const IconAt = () => (
  <Svg>
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
  </Svg>
);
export const IconTimer = () => (
  <Svg w={2}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2M9 2h6" />
  </Svg>
);
export const IconTheme = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
  </Svg>
);
export const IconLang = () => (
  <Svg>
    <path d="M4 5h8M8 3v2c0 4-2 7-4.5 8.5M6 9c1 2 3 3.5 5 4.5M13 21l4-9 4 9M14.5 18h5" />
  </Svg>
);

export const Chevron = () => (
  <svg className="ap-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 5 7 7-7 7" />
  </svg>
);

/** The gold coin of the shop (CSS, `.ap-coin`). */
export const Coin = ({ big = false }: { big?: boolean }) => (
  <span className={`ap-coin${big ? " ap-coin--big" : ""}`} aria-hidden="true" />
);

/** The fixed glass bar of a pushed screen: a round button on the left, an
 *  optional centred title, an optional element on the right. */
export function TopBar({
  onBack,
  label,
  icon = "back",
  title,
  right,
}: {
  onBack: () => void;
  label: string;
  icon?: "back" | "close";
  title?: string;
  right?: ReactNode;
}) {
  return (
    <div className="ap-top">
      <button type="button" className="ap-gbtn" aria-label={label} onClick={onBack}>
        {icon === "close" ? <IconClose /> : <IconBack />}
      </button>
      <span className="ap-top-title">{title}</span>
      <span className="ap-top-right">{right}</span>
    </div>
  );
}

/** The balance, as a glass pill in a top bar. */
export function CoinPill({ n }: { n?: number }) {
  if (n == null) return null;
  return (
    <span className="ap-coinpill">
      <Coin big />
      {n}
    </span>
  );
}
