// Small flat drawings along a path's road (components/PathRoad.tsx): one
// beside each note, on the side away from its disc, and a strip of them over
// each level's heading. Three tones of the path's family colour (--f0 to
// --f3, set on .road in app.css), so they follow light and dark. Static
// strings, written here: nothing from the vault goes into them.

import type { PathFamily } from "@/lib/path-family";

export const ART = {
  pyramid:
    '<svg viewBox="0 0 100 80"><circle cx="78" cy="18" r="9" fill="var(--f3)"/><path d="M8 72h84" stroke="var(--ground)" stroke-width="4" stroke-linecap="round"/><path d="M14 70 44 22 74 70z" fill="var(--f2)"/><path d="M44 22 74 70H52z" fill="var(--f1)"/><path d="M60 70 76 44 92 70z" fill="var(--f3)"/><path d="M76 44 92 70H82z" fill="var(--f2)"/></svg>',
  temple:
    '<svg viewBox="0 0 100 80"><path d="M10 30 50 10 90 30z" fill="var(--f1)"/><rect x="12" y="30" width="76" height="6" rx="1" fill="var(--f0)"/><g fill="var(--f2)"><rect x="18" y="38" width="9" height="28" rx="1"/><rect x="36" y="38" width="9" height="28" rx="1"/><rect x="55" y="38" width="9" height="28" rx="1"/><rect x="73" y="38" width="9" height="28" rx="1"/></g><rect x="10" y="66" width="80" height="6" rx="1" fill="var(--f1)"/><path d="M4 76h92" stroke="var(--ground)" stroke-width="4" stroke-linecap="round"/></svg>',
  amphora:
    '<svg viewBox="0 0 60 80"><path d="M23 6h14v8c10 4 16 14 16 26 0 14-9 26-23 34C16 66 7 54 7 40c0-12 6-22 16-26z" fill="var(--f2)"/><path d="M8 34h44" stroke="var(--f1)" stroke-width="5"/><path d="M10 46h40" stroke="var(--f1)" stroke-width="2.5" stroke-dasharray="4 4"/><path d="M23 14c-8 0-12 4-12 10M37 14c8 0 12 4 12 10" fill="none" stroke="var(--f0)" stroke-width="3" stroke-linecap="round"/><rect x="20" y="3" width="20" height="5" rx="2" fill="var(--f1)"/></svg>',
  palm:
    '<svg viewBox="0 0 60 80"><path d="M30 74c0-18 2-30 6-44" fill="none" stroke="var(--f0)" stroke-width="5" stroke-linecap="round"/><g fill="var(--f1)"><path d="M36 28C28 16 14 16 6 24c10-2 20 0 30 4z"/><path d="M36 28c6-12 18-16 26-10-10 0-18 4-26 10z"/><path d="M36 28c-4-12 0-22 8-26-2 10-4 18-8 26z"/></g><path d="M36 28c-10 2-18 10-20 20 6-8 12-14 20-20zM36 28c10 2 16 10 18 18-6-8-10-14-18-18z" fill="var(--f2)"/><path d="M10 76h40" stroke="var(--ground)" stroke-width="4" stroke-linecap="round"/></svg>',
  windmill:
    '<svg viewBox="0 0 70 90"><path d="M24 84 28 36h14l4 48z" fill="var(--f2)"/><path d="M28 36h14l-7-10z" fill="var(--f1)"/><rect x="31" y="66" width="8" height="18" rx="4" fill="var(--f0)"/><g transform="rotate(20 35 32)" fill="var(--f1)"><rect x="32" y="2" width="6" height="30" rx="2"/><rect x="32" y="32" width="6" height="30" rx="2"/><rect x="5" y="29" width="30" height="6" rx="2"/><rect x="35" y="29" width="30" height="6" rx="2"/></g><circle cx="35" cy="32" r="4" fill="var(--f0)"/><path d="M4 86h62" stroke="var(--ground)" stroke-width="4" stroke-linecap="round"/></svg>',
  factory:
    '<svg viewBox="0 0 100 80"><circle cx="78" cy="10" r="6" fill="var(--f3)"/><circle cx="88" cy="4" r="4" fill="var(--f3)"/><rect x="70" y="16" width="12" height="54" rx="1" fill="var(--f0)"/><path d="M8 70V38l18 12V38l18 12V38l18 12v20z" fill="var(--f2)"/><g fill="var(--f1)"><rect x="14" y="56" width="8" height="8" rx="1"/><rect x="32" y="56" width="8" height="8" rx="1"/><rect x="50" y="56" width="8" height="8" rx="1"/></g><path d="M4 74h92" stroke="var(--ground)" stroke-width="4" stroke-linecap="round"/></svg>',
  train:
    '<svg viewBox="0 0 110 70"><circle cx="18" cy="12" r="7" fill="var(--f3)"/><circle cx="8" cy="6" r="5" fill="var(--f3)"/><rect x="20" y="16" width="9" height="16" rx="2" fill="var(--f0)"/><rect x="12" y="30" width="56" height="20" rx="6" fill="var(--f2)"/><rect x="62" y="18" width="30" height="32" rx="3" fill="var(--f1)"/><rect x="69" y="24" width="16" height="11" rx="2" fill="var(--f3)"/><g fill="var(--f0)"><circle cx="26" cy="54" r="8"/><circle cx="48" cy="54" r="8"/><circle cx="78" cy="54" r="9"/></g><g fill="var(--f3)"><circle cx="26" cy="54" r="3"/><circle cx="48" cy="54" r="3"/><circle cx="78" cy="54" r="3"/></g><path d="M2 64h106" stroke="var(--ground)" stroke-width="4" stroke-linecap="round"/></svg>',
  scroll:
    '<svg viewBox="0 0 70 70"><rect x="12" y="14" width="46" height="44" rx="3" fill="var(--f3)"/><rect x="6" y="8" width="58" height="10" rx="5" fill="var(--f1)"/><rect x="6" y="54" width="58" height="10" rx="5" fill="var(--f1)"/><path d="M20 28h30M20 36h30M20 44h20" stroke="var(--f2)" stroke-width="3" stroke-linecap="round"/></svg>',
  volcano:
    '<svg viewBox="0 0 100 80"><circle cx="58" cy="10" r="7" fill="var(--f3)"/><circle cx="70" cy="6" r="5" fill="var(--f3)"/><path d="M6 72 40 22h18l36 50z" fill="var(--f2)"/><path d="M49 22h9l36 50H66z" fill="var(--f1)"/><path d="M40 22h18l-4 8-5-3-5 4z" fill="var(--f0)"/><path d="M2 74h96" stroke="var(--ground)" stroke-width="4" stroke-linecap="round"/></svg>',
  terraces:
    '<svg viewBox="0 0 100 70"><path d="M4 64c20-6 72-6 92 0v4H4z" fill="var(--f1)"/><path d="M10 52c18-6 62-6 80 0l2 10c-22-5-62-5-84 0z" fill="var(--f2)"/><path d="M18 40c14-5 50-5 64 0l3 10c-18-5-52-5-70 0z" fill="var(--f1)"/><path d="M28 28c10-4 34-4 44 0l3 10c-14-4-36-4-50 0z" fill="var(--f2)"/><g stroke="var(--f0)" stroke-width="2" stroke-linecap="round"><path d="M40 22v-6M46 22v-8M52 22v-6M58 22v-7"/></g></svg>',
  boat:
    '<svg viewBox="0 0 100 70"><path d="M48 6v40" stroke="var(--f0)" stroke-width="3"/><path d="M50 8c14 8 22 22 22 36H50z" fill="var(--f2)"/><path d="M46 14C36 22 30 32 30 42h16z" fill="var(--f3)"/><path d="M8 46h84c-6 10-16 14-30 14H34C20 60 12 56 8 46z" fill="var(--f1)"/><path d="M4 62c8-4 14 4 22 0s14 4 22 0 14 4 22 0 14 4 22 0" fill="none" stroke="var(--f2)" stroke-width="3" stroke-linecap="round"/></svg>',
  flower:
    '<svg viewBox="0 0 60 60"><g fill="var(--f2)" transform="translate(30 30)"><ellipse rx="9" ry="16" transform="rotate(0) translate(0 -13)"/><ellipse rx="9" ry="16" transform="rotate(72) translate(0 -13)"/><ellipse rx="9" ry="16" transform="rotate(144) translate(0 -13)"/><ellipse rx="9" ry="16" transform="rotate(216) translate(0 -13)"/><ellipse rx="9" ry="16" transform="rotate(288) translate(0 -13)"/></g><circle cx="30" cy="30" r="7" fill="var(--f1)"/></svg>',
  roof:
    '<svg viewBox="0 0 100 80"><path d="M6 40C20 34 30 18 34 6c4 14 10 22 16 24 6-2 12-10 16-24 4 12 14 28 28 34z" fill="var(--f1)"/><rect x="18" y="40" width="64" height="30" rx="2" fill="var(--f2)"/><rect x="44" y="50" width="12" height="20" rx="2" fill="var(--f0)"/><g fill="var(--f3)"><rect x="26" y="48" width="10" height="8" rx="1"/><rect x="64" y="48" width="10" height="8" rx="1"/></g><path d="M4 74h92" stroke="var(--ground)" stroke-width="4" stroke-linecap="round"/></svg>',
  compass:
    '<svg viewBox="0 0 80 80"><circle cx="40" cy="44" r="28" fill="none" stroke="var(--f3)" stroke-width="3" stroke-dasharray="5 5"/><path d="M40 10 22 66M40 10l18 56" stroke="var(--f1)" stroke-width="5" stroke-linecap="round"/><circle cx="40" cy="10" r="6" fill="var(--f0)"/><path d="M58 66l3 8" stroke="var(--f0)" stroke-width="3" stroke-linecap="round"/></svg>',
  triangle:
    '<svg viewBox="0 0 80 80"><path d="M10 70h60V14z" fill="var(--f2)"/><path d="M58 70V58h12" fill="none" stroke="var(--f0)" stroke-width="2.5"/><path d="M10 70 70 14" stroke="var(--f1)" stroke-width="4"/><text x="28" y="48" font-family="Alegreya" font-style="italic" font-size="14" fill="var(--f0)">c</text></svg>',
  cube:
    '<svg viewBox="0 0 80 80"><path d="M40 8 70 24v32L40 72 10 56V24z" fill="var(--f2)"/><path d="M40 40 70 24v32L40 72z" fill="var(--f1)"/><path d="M40 8 70 24 40 40 10 24z" fill="var(--f3)"/></svg>',
  wave:
    '<svg viewBox="0 0 100 60"><path d="M4 50h92M8 8v46" stroke="var(--f3)" stroke-width="3" stroke-linecap="round"/><path d="M8 30c8-22 16-22 24 0s16 22 24 0 16-22 24 0 10 14 14 10" fill="none" stroke="var(--f1)" stroke-width="4" stroke-linecap="round"/></svg>',
  flask:
    '<svg viewBox="0 0 70 80"><path d="M26 6h18v22l20 40a6 6 0 0 1-5 9H11a6 6 0 0 1-5-9l20-40z" fill="var(--f3)"/><path d="M14 52h42l8 16a6 6 0 0 1-5 9H11a6 6 0 0 1-5-9z" fill="var(--f1)"/><rect x="22" y="2" width="26" height="7" rx="3" fill="var(--f0)"/><circle cx="30" cy="62" r="4" fill="var(--f2)"/><circle cx="42" cy="68" r="3" fill="var(--f2)"/></svg>',
  atom:
    '<svg viewBox="0 0 80 80"><g fill="none" stroke="var(--f2)" stroke-width="4"><ellipse cx="40" cy="40" rx="34" ry="13"/><ellipse cx="40" cy="40" rx="34" ry="13" transform="rotate(60 40 40)"/><ellipse cx="40" cy="40" rx="34" ry="13" transform="rotate(120 40 40)"/></g><circle cx="40" cy="40" r="8" fill="var(--f1)"/><circle cx="74" cy="40" r="4" fill="var(--f0)"/></svg>',
  screen:
    '<svg viewBox="0 0 90 80"><rect x="6" y="6" width="78" height="52" rx="6" fill="var(--f1)"/><rect x="12" y="12" width="66" height="40" rx="3" fill="var(--f3)"/><path d="M30 24l-8 8 8 8M60 24l8 8-8 8M50 22l-10 20" fill="none" stroke="var(--f0)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M38 58l-4 12h22l-4-12z" fill="var(--f2)"/><path d="M24 72h42" stroke="var(--ground)" stroke-width="4" stroke-linecap="round"/></svg>',
  chip:
    '<svg viewBox="0 0 80 80"><g stroke="var(--f2)" stroke-width="4" stroke-linecap="round"><path d="M26 6v12M40 6v12M54 6v12M26 62v12M40 62v12M54 62v12M6 26h12M6 40h12M6 54h12M62 26h12M62 40h12M62 54h12"/></g><rect x="16" y="16" width="48" height="48" rx="7" fill="var(--f1)"/><rect x="28" y="28" width="24" height="24" rx="3" fill="var(--f3)"/></svg>',
  graph:
    '<svg viewBox="0 0 90 80"><g stroke="var(--f2)" stroke-width="4"><path d="M45 14 22 40M45 14l23 26M22 40 12 66M22 40l18 26M68 40l10 26"/></g><circle cx="45" cy="14" r="9" fill="var(--f1)"/><circle cx="22" cy="40" r="8" fill="var(--f1)"/><circle cx="68" cy="40" r="8" fill="var(--f1)"/><g fill="var(--f0)"><circle cx="12" cy="66" r="6"/><circle cx="40" cy="66" r="6"/><circle cx="78" cy="66" r="6"/></g></svg>',
  leaf:
    '<svg viewBox="0 0 80 80"><path d="M12 70C10 34 30 10 72 8c2 40-20 62-60 62z" fill="var(--f2)"/><path d="M12 70C24 52 40 34 64 16" fill="none" stroke="var(--f0)" stroke-width="3.5" stroke-linecap="round"/><path d="M30 50l-2-14M42 38l-2-14M30 50l14 0M42 38l14 0" stroke="var(--f1)" stroke-width="2.5" stroke-linecap="round"/></svg>',
  tree:
    '<svg viewBox="0 0 80 90"><rect x="35" y="50" width="10" height="34" rx="3" fill="var(--f0)"/><circle cx="40" cy="34" r="26" fill="var(--f1)"/><circle cx="24" cy="44" r="16" fill="var(--f2)"/><circle cx="56" cy="44" r="16" fill="var(--f2)"/><path d="M6 86h68" stroke="var(--ground)" stroke-width="4" stroke-linecap="round"/></svg>',
  butterfly:
    '<svg viewBox="0 0 80 70"><path d="M40 34C30 10 8 6 6 20s14 22 34 14z" fill="var(--f1)"/><path d="M40 34C50 10 72 6 74 20S60 42 40 34z" fill="var(--f1)"/><path d="M40 36C28 40 14 52 22 62s16-6 18-26zM40 36c12 4 26 16 18 26S42 56 40 36z" fill="var(--f2)"/><rect x="37" y="20" width="6" height="34" rx="3" fill="var(--f0)"/><path d="M38 20c-2-6-6-10-10-12M42 20c2-6 6-10 10-12" fill="none" stroke="var(--f0)" stroke-width="2.5" stroke-linecap="round"/></svg>',
  mushroom:
    '<svg viewBox="0 0 70 80"><path d="M6 38C6 18 20 6 35 6s29 12 29 32z" fill="var(--f1)"/><g fill="var(--f3)"><circle cx="22" cy="22" r="5"/><circle cx="42" cy="16" r="4"/><circle cx="50" cy="30" r="4"/></g><path d="M24 38h22l4 34H20z" fill="var(--f2)"/><path d="M4 74h62" stroke="var(--ground)" stroke-width="4" stroke-linecap="round"/></svg>',
  lamp:
    '<svg viewBox="0 0 90 70"><path d="M44 20c-4 6-2 10 2 12 4-2 6-6 2-12-1-3-3-5-4-8-1 3 1 5 0 8z" fill="var(--f2)"/><path d="M10 40c10-6 40-8 60-4l14-6c-4 10-10 16-20 20H28C18 50 12 46 10 40z" fill="var(--f1)"/><path d="M30 50h30l4 10H26z" fill="var(--f0)"/><path d="M8 64h74" stroke="var(--ground)" stroke-width="4" stroke-linecap="round"/></svg>',
  house:
    '<svg viewBox="0 0 90 80"><path d="M8 38 45 8l37 30z" fill="var(--f1)"/><rect x="16" y="36" width="58" height="36" rx="2" fill="var(--f2)"/><rect x="38" y="48" width="14" height="24" rx="2" fill="var(--f0)"/><g fill="var(--f3)"><rect x="22" y="44" width="10" height="10" rx="1"/><rect x="58" y="44" width="10" height="10" rx="1"/></g><path d="M4 74h82" stroke="var(--ground)" stroke-width="4" stroke-linecap="round"/></svg>',
  scales:
    '<svg viewBox="0 0 90 80"><rect x="42" y="10" width="6" height="58" rx="2" fill="var(--f0)"/><path d="M14 20h62" stroke="var(--f1)" stroke-width="5" stroke-linecap="round"/><path d="M20 22 10 46h20zM70 22 60 46h20z" fill="none" stroke="var(--f2)" stroke-width="2"/><path d="M8 46h24a12 8 0 0 1-24 0zM58 46h24a12 8 0 0 1-24 0z" fill="var(--f1)"/><circle cx="45" cy="10" r="6" fill="var(--f1)"/><path d="M28 72h34" stroke="var(--f1)" stroke-width="6" stroke-linecap="round"/></svg>',
  globe:
    '<svg viewBox="0 0 80 80"><circle cx="40" cy="36" r="28" fill="var(--f3)"/><path d="M22 18c8 4 6 12 14 14s6 12 0 16-10 4-12 12C14 54 10 42 14 30zM50 12c-2 8 6 10 12 10 4 6 4 14 0 20-6 0-10-6-14-4s-4-10 2-12-4-8 0-14z" fill="var(--f1)"/><path d="M40 64v8M26 76h28" stroke="var(--f0)" stroke-width="4" stroke-linecap="round"/></svg>',
  bridge:
    '<svg viewBox="0 0 110 70"><path d="M4 30h102" stroke="var(--f0)" stroke-width="6"/><path d="M10 30c14 0 20 16 20 30h12c0-14 6-30 13-30s13 16 13 30h12c0-14 6-30 20-30" fill="none" stroke="var(--f1)" stroke-width="6"/><g fill="var(--f2)"><rect x="24" y="30" width="6" height="32"/><rect x="80" y="30" width="6" height="32"/></g><path d="M2 64c10-4 16 4 26 0s16 4 26 0 16 4 26 0 16 4 26 0" fill="none" stroke="var(--f3)" stroke-width="3" stroke-linecap="round"/></svg>',
  palette:
    '<svg viewBox="0 0 90 80"><path d="M44 8C20 8 6 24 6 40c0 18 16 30 34 30 8 0 8-8 4-12s0-10 8-10h12c14 0 20-8 20-18C84 18 66 8 44 8z" fill="var(--f2)"/><g fill="var(--f1)"><circle cx="26" cy="30" r="6"/><circle cx="44" cy="22" r="6"/><circle cx="62" cy="26" r="6"/></g><circle cx="24" cy="50" r="6" fill="var(--f0)"/></svg>',
  note:
    '<svg viewBox="0 0 70 80"><path d="M26 58V14l36-8v44" fill="none" stroke="var(--f0)" stroke-width="5" stroke-linejoin="round"/><path d="M26 14l36-8v12l-36 8z" fill="var(--f1)"/><ellipse cx="17" cy="60" rx="11" ry="8" fill="var(--f1)"/><ellipse cx="53" cy="52" rx="11" ry="8" fill="var(--f1)"/></svg>',
  frame:
    '<svg viewBox="0 0 80 90"><rect x="6" y="6" width="68" height="78" rx="3" fill="var(--f1)"/><rect x="14" y="14" width="52" height="62" fill="var(--f3)"/><circle cx="50" cy="30" r="7" fill="var(--f2)"/><path d="M14 76 32 46l12 16 8-10 14 24z" fill="var(--f2)"/></svg>',
  brush:
    '<svg viewBox="0 0 80 80"><path d="M66 6 38 44l8 8L74 14z" fill="var(--f1)"/><path d="M34 48l8 8-6 6-8-8z" fill="var(--f0)"/><path d="M28 54c-8-2-16 4-16 12 0 4-4 8-8 8 12 4 26 0 28-12z" fill="var(--f2)"/></svg>',
  bubbles:
    '<svg viewBox="0 0 90 80"><path d="M8 12h46a6 6 0 0 1 6 6v22a6 6 0 0 1-6 6H26l-12 10V46H8a6 6 0 0 1-6-6V18a6 6 0 0 1 6-6z" fill="var(--f1)"/><path d="M40 34h42a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6h-4v10L66 66H40a6 6 0 0 1-6-6V40a6 6 0 0 1 6-6z" fill="var(--f2)"/><path d="M14 24h32M14 32h22" stroke="var(--f3)" stroke-width="3.5" stroke-linecap="round"/><path d="M46 46h30M46 54h18" stroke="var(--f1)" stroke-width="3.5" stroke-linecap="round"/></svg>',
  book:
    '<svg viewBox="0 0 90 70"><path d="M45 14C34 6 18 6 6 10v50c12-4 28-4 39 4z" fill="var(--f2)"/><path d="M45 14c11-8 27-8 39-4v50c-12-4-28-4-39 4z" fill="var(--f1)"/><path d="M14 22c8-2 16-2 24 2M14 32c8-2 16-2 24 2M14 42c8-2 16-2 24 2" stroke="var(--f3)" stroke-width="3" stroke-linecap="round"/></svg>',
  knight:
    '<svg viewBox="0 0 70 90"><path d="M18 74c0-16 6-24 12-30-8 2-14 0-16-6 6-10 14-18 16-30 14 2 26 14 28 36 2 14-2 24-2 30z" fill="var(--f1)"/><circle cx="34" cy="26" r="3.5" fill="var(--f3)"/><rect x="12" y="72" width="50" height="10" rx="3" fill="var(--f0)"/><path d="M6 86h58" stroke="var(--ground)" stroke-width="4" stroke-linecap="round"/></svg>',
  rook:
    '<svg viewBox="0 0 70 90"><path d="M14 8h10v8h7V8h8v8h7V8h10v18l-6 6v30h6v10H14V62h6V32l-6-6z" fill="var(--f1)"/><path d="M20 32h30" stroke="var(--f0)" stroke-width="3"/><rect x="10" y="72" width="50" height="10" rx="3" fill="var(--f0)"/><path d="M4 86h62" stroke="var(--ground)" stroke-width="4" stroke-linecap="round"/></svg>',
  pawn:
    '<svg viewBox="0 0 60 80"><circle cx="30" cy="18" r="11" fill="var(--f1)"/><path d="M22 30h16l-2 6c8 6 10 18 10 28H14c0-10 2-22 10-28z" fill="var(--f2)"/><rect x="8" y="62" width="44" height="9" rx="3" fill="var(--f0)"/><path d="M4 76h52" stroke="var(--ground)" stroke-width="4" stroke-linecap="round"/></svg>',
  die:
    '<svg viewBox="0 0 80 80"><path d="M40 6 72 22v36L40 74 8 58V22z" fill="var(--f2)"/><path d="M40 38 72 22v36L40 74z" fill="var(--f1)"/><path d="M40 6 72 22 40 38 8 22z" fill="var(--f3)"/><g fill="var(--f0)"><circle cx="40" cy="22" r="4"/><circle cx="22" cy="40" r="3.5"/><circle cx="30" cy="54" r="3.5"/><circle cx="54" cy="46" r="3.5"/><circle cx="62" cy="38" r="3.5"/><circle cx="58" cy="58" r="3.5"/></g></svg>',
} as const;

export type ArtKey = keyof typeof ART;

/** Drawings for each colour family (lib/path-family.ts), in the order they
 *  come along the road. */
export const FAMILY_ART: Record<PathFamily, readonly ArtKey[]> = {
  sciences: ["triangle", "compass", "flask", "cube", "atom", "wave"],
  informatique: ["screen", "chip", "graph", "cube", "wave"],
  vivant: ["leaf", "tree", "butterfly", "mushroom", "flower"],
  pensee: ["temple", "scroll", "lamp", "amphora", "palm"],
  societe: ["house", "scales", "globe", "bridge"],
  arts: ["palette", "note", "frame", "brush"],
  langues: ["bubbles", "book", "boat", "flower"],
  jeux: ["knight", "die", "rook", "pawn"],
};

/** Eras a level can be named after (its folders, lib/path-levels.ts): they
 *  theme that level only, since a path's name often spans several. */
const LEVEL_THEMES: [RegExp, readonly ArtKey[]][] = [
  [/(^|[^\p{L}])(antiq|[ée]gypt|gr[eè]c|rom(e|ain))/iu, ["pyramid", "temple", "amphora", "palm", "scroll"]],
  [/industri/i, ["windmill", "factory", "train", "scroll"]],
  [/xxe|xixe|contemporain|modern/i, ["train", "globe", "bridge", "house"]],
];
/** Subjects a whole path is about. */
const PATH_THEMES: [RegExp, readonly ArtKey[]][] = [
  [/indon[ée]si/i, ["flower", "boat", "volcano", "terraces", "roof"]],
  [/[ée]checs|chess/i, ["knight", "rook", "pawn", "die"]],
];

/** The drawings for one level of a path: its era when its name says one,
 *  else the path's subject, else its family's set (or the default one). */
export function levelArt(pathName: string, levelName: string, family: PathFamily | null): readonly ArtKey[] {
  for (const [re, keys] of LEVEL_THEMES) if (re.test(levelName)) return keys;
  for (const [re, keys] of PATH_THEMES) if (re.test(pathName)) return keys;
  return family ? FAMILY_ART[family] : FAMILY_ART.vivant;
}

/** A level divider's strip: up to four drawings on a strip of ground, as
 *  one SVG (each drawing nested at its place). */
export function artStrip(keys: readonly ArtKey[]): string {
  const picks = keys.slice(0, 4);
  const slot = 390 / picks.length;
  const parts = picks.map((k, i) => {
    const [, , w, h] = (ART[k].match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 100 80").split(" ").map(Number);
    const height = 76;
    const width = (w / h) * height;
    const x = i * slot + (slot - width) / 2;
    return ART[k].replace("<svg ", `<svg x="${x.toFixed(1)}" y="${(96 - height).toFixed(1)}" width="${width.toFixed(1)}" height="${height}" `);
  });
  return `<svg viewBox="0 0 390 110" aria-hidden="true"><path d="M0 94c70-12 140-12 200-4s130 8 190-2v22H0z" fill="var(--ground)"/>${parts.join("")}</svg>`;
}
