// Helpers shared by the account page's two layouts: the desktop page
// (components/Account.tsx) and the phone screens (components/account/*).

import { ITEMS, STREAK_FREEZE, STREAK_MILESTONES, type Look } from "@/lib/avatar";
import type { Me } from "@/lib/account-client";

export type Tr = (k: string, v?: Record<string, string | number>) => string;

export interface Ledger {
  day: string;
  kind: string;
  ref: string;
  amount: number;
}
export interface AccountData {
  coins: number;
  ledger: Ledger[];
  owned: string[];
  look: Look;
  streak: Me["streak"];
  /** Coins earned per day (positive only), the last year: the active days. */
  activity?: Record<string, number>;
  stats?: { notesRead?: number; reviews?: number; activeDays?: number };
}
export interface FreezeInfo {
  price: number;
  held: number;
  max: number;
}
export type LedgerRow = Ledger & { n: number };
export interface LedgerDay {
  day: string;
  total: number;
  rows: LedgerRow[];
}

/** One row per day for the small, repeated earnings (a review is 1 coin, so a
 *  session would otherwise fill the list with "+1" rows). */
export function groupLedger(ledger: Ledger[]): LedgerRow[] {
  const out: LedgerRow[] = [];
  for (const e of ledger) {
    const last = out[out.length - 1];
    if (last && e.kind === "review" && last.kind === "review" && last.day === e.day) {
      last.amount += e.amount;
      last.n += 1;
    } else out.push({ ...e, n: 1 });
  }
  return out;
}

/** The grouped history, one block per day with its net total. */
export function ledgerDays(rows: LedgerRow[]): LedgerDay[] {
  const out: LedgerDay[] = [];
  for (const e of rows) {
    const last = out[out.length - 1];
    if (last && last.day === e.day) {
      last.rows.push(e);
      last.total += e.amount;
    } else out.push({ day: e.day, total: e.amount, rows: [e] });
  }
  return out;
}

export function dayLabel(day: string, locale: string): string {
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? day : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d);
}

/** "Aujourd’hui", "Hier", else "14 oct." (capitalised, for the start of a
 *  line). */
export function relativeDay(day: string, locale: string): string {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  let s: string;
  if (diff === 0 || diff === -1) {
    try {
      s = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(diff, "day");
    } catch {
      s = dayLabel(day, locale);
    }
  } else s = dayLabel(day, locale);
  return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
}

/** "il y a 2 minutes", for a time in ms. */
export function ago(ms: number, locale: string): string {
  const s = Math.round((ms - Date.now()) / 1000);
  const abs = Math.abs(s);
  const [n, unit]: [number, Intl.RelativeTimeFormatUnit] =
    abs < 60
      ? [s, "second"]
      : abs < 3600
        ? [Math.round(s / 60), "minute"]
        : abs < 86_400
          ? [Math.round(s / 3600), "hour"]
          : [Math.round(s / 86_400), "day"];
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(n, unit);
  } catch {
    return new Date(ms).toLocaleString(locale);
  }
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";
}

/** `${key}One` when the locale says `n` is singular (fr: 0 and 1; en: 1),
 *  else `key`. Every locale file carries both, zh with the same text. */
export function plural(tr: Tr, locale: string, key: string, n: number, vars?: Record<string, string | number>): string {
  let one = false;
  try {
    one = new Intl.PluralRules(locale).select(n) === "one";
  } catch {
    one = n === 1;
  }
  return tr(one ? `${key}One` : key, { n, ...vars });
}

/** The next streak bonus still ahead of a run of `run` days, and where the
 *  bar starts (the previous milestone, or 0). Null past the last one. */
export function nextMilestone(run: number): { from: number; at: number; bonus: number } | null {
  const steps = Object.keys(STREAK_MILESTONES)
    .map(Number)
    .sort((a, b) => a - b);
  const at = steps.find((m) => m > run);
  if (at === undefined) return null;
  const from = steps.filter((m) => m <= run).pop() ?? 0;
  return { from, at, bonus: STREAK_MILESTONES[at] };
}

export function itemName(ref: string, tr: (k: string) => string): string {
  const id = ref.split("#")[0];
  if (id === STREAK_FREEZE.id) return tr("shop.freezeName");
  const item = ITEMS.find((i) => i.id === id);
  return item ? tr(`avatar.items.${item.name}`) : id;
}

export function prettyRef(ref: string): string {
  const last = ref.split("/").pop() ?? ref;
  let s = last;
  try {
    s = decodeURIComponent(last);
  } catch {
    /* kept as is */
  }
  return s.replace(/-/g, " ");
}

/** What a ledger row was about: the note read or the item bought. */
export function ledgerRef(e: Ledger, tr: (k: string) => string): string {
  if (!e.ref) return "";
  if (e.kind === "purchase") return itemName(e.ref, tr);
  if (e.kind === "read") return prettyRef(e.ref);
  return "";
}
