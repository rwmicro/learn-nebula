import { BODY_COLORS, defaultLook, type Look } from "@/lib/avatar";

/**
 * The account's profile picture: "le petit jardinier", a round sprout with a
 * leaf on its head, drawn in SVG from a Look (lib/avatar.ts). It breathes,
 * blinks and sways its leaf (CSS in global.css, `.avatar*`), and stands still
 * for readers who ask for reduced motion. Pure markup, so it renders on the
 * server and in client components alike.
 */
export function Avatar({
  look,
  size = 40,
  still = false,
  label,
}: {
  look?: Look | null;
  size?: number;
  /** No animation (tiny sizes, lists). */
  still?: boolean;
  /** Accessible name; omitted = decorative. */
  label?: string;
}) {
  const l = look ?? defaultLook();
  const [body, shade, cheek] = BODY_COLORS[l.body] ?? BODY_COLORS["body-leaf"];
  const hatHidesSprout = l.hat === "hat-wizard" || l.hat === "hat-cap";
  return (
    <svg
      className={`avatar${still ? " avatar--still" : ""}`}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* Round crop: CSS (border-radius on .avatar), so no clipPath id to
          collide when several avatars share a page. */}
      <g>
        <Background id={l.background} />
        <g className="avatar-bob">
          {/* shadow */}
          <ellipse cx="50" cy="90" rx="22" ry="4" fill="#000" opacity="0.12" />
          {/* sprout */}
          {!hatHidesSprout && (
            <g className="avatar-sprout">
              <path d="M50 40 C50 32 50 28 51 22" stroke="#4f7f3a" strokeWidth="3" fill="none" strokeLinecap="round" />
              <path d="M51 25 C44 16 34 18 32 22 C38 27 46 28 51 25Z" fill="#6aa84f" />
              <path d="M51 23 C57 13 67 14 70 18 C64 24 56 25 51 23Z" fill="#7fbf5f" />
            </g>
          )}
          {/* body */}
          <ellipse cx="50" cy="64" rx="28" ry="25" fill={body} />
          <path d="M23 70 C28 86 72 86 77 70 C70 82 30 82 23 70Z" fill={shade} opacity="0.55" />
          {/* face */}
          <g className="avatar-eyes">
            <ellipse cx="41" cy="61" rx="3.4" ry="4.4" fill="#2a2a2a" />
            <ellipse cx="59" cy="61" rx="3.4" ry="4.4" fill="#2a2a2a" />
            <circle cx="42.2" cy="59.4" r="1.2" fill="#fff" />
            <circle cx="60.2" cy="59.4" r="1.2" fill="#fff" />
          </g>
          <circle cx="34" cy="69" r="4" fill={cheek} opacity="0.7" />
          <circle cx="66" cy="69" r="4" fill={cheek} opacity="0.7" />
          <path d="M45 70 Q50 75 55 70" stroke="#2a2a2a" strokeWidth="2" fill="none" strokeLinecap="round" />
          <Accessory id={l.accessory} />
          <Hat id={l.hat} />
        </g>
      </g>
    </svg>
  );
}

function Background({ id }: { id: string }) {
  if (id === "bg-garden")
    return (
      <>
        <rect width="100" height="100" fill="#dcefd4" />
        <path d="M0 84 Q25 76 50 84 T100 84 V100 H0Z" fill="#a9d18e" />
        <circle cx="16" cy="78" r="3" fill="#f2c25b" />
        <circle cx="86" cy="80" r="3" fill="#ef8e78" />
      </>
    );
  if (id === "bg-night")
    return (
      <>
        <rect width="100" height="100" fill="#2b3550" />
        <circle cx="18" cy="20" r="1.4" fill="#fff" className="avatar-star" />
        <circle cx="80" cy="14" r="1.1" fill="#fff" className="avatar-star avatar-star--late" />
        <circle cx="88" cy="40" r="1.3" fill="#fff" className="avatar-star" />
        <circle cx="12" cy="46" r="1" fill="#fff" className="avatar-star avatar-star--late" />
        <circle cx="76" cy="26" r="5" fill="#f4e9b8" />
      </>
    );
  return <rect width="100" height="100" fill="#f4efe4" />;
}

function Hat({ id }: { id: string }) {
  switch (id) {
    case "hat-beret":
      return (
        <g>
          <ellipse cx="46" cy="42" rx="20" ry="7" fill="#b3322f" transform="rotate(-10 46 42)" />
          <circle cx="45" cy="35" r="2" fill="#b3322f" />
        </g>
      );
    case "hat-cap":
      return (
        <g>
          <path d="M34 42 L66 42 L64 34 L36 34Z" fill="#26282e" />
          <path d="M50 22 L80 31 L50 40 L20 31Z" fill="#33363d" />
          <path d="M72 33 L74 46" stroke="#f2c25b" strokeWidth="1.6" />
          <circle cx="74" cy="47" r="2" fill="#f2c25b" />
        </g>
      );
    case "hat-wizard":
      return (
        <g>
          <path d="M30 44 L50 4 L70 44Z" fill="#5b4a9e" />
          <ellipse cx="50" cy="44" rx="24" ry="5" fill="#4a3c85" />
          <path d="M47 22 l1.5 3 3 .4 -2.2 2 .6 3 -2.9 -1.5 -2.9 1.5 .6 -3 -2.2 -2 3 -.4z" fill="#f2c25b" />
        </g>
      );
    case "hat-crown":
      return (
        <g>
          <path d="M33 44 L33 30 L41 37 L50 26 L59 37 L67 30 L67 44Z" fill="#f2c25b" stroke="#c99a2e" strokeWidth="1.2" />
          <circle cx="50" cy="38" r="2.2" fill="#b3322f" />
        </g>
      );
    default:
      return null;
  }
}

function Accessory({ id }: { id: string }) {
  switch (id) {
    case "acc-glasses":
      return (
        <g fill="none" stroke="#2a2a2a" strokeWidth="1.8">
          <circle cx="41" cy="61" r="7" />
          <circle cx="59" cy="61" r="7" />
          <path d="M48 61 h4" />
        </g>
      );
    case "acc-scarf":
      return (
        <g>
          <path d="M27 78 C38 84 62 84 73 78 L73 84 C62 90 38 90 27 84Z" fill="#b3322f" />
          <path d="M62 84 L66 96 L58 96 L57 86Z" fill="#9a2a27" />
        </g>
      );
    case "acc-book":
      return (
        <g transform="rotate(-12 78 76)">
          <rect x="68" y="66" width="20" height="16" rx="1.5" fill="#3f6b4a" />
          <rect x="70" y="68" width="16" height="12" fill="#f4efe4" />
          <path d="M78 68 V80" stroke="#3f6b4a" strokeWidth="1" />
        </g>
      );
    default:
      return null;
  }
}
