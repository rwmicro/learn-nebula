// Old French prices in today's euros, from the Insee consumer price index
// (lib/data/ipc-france.json, refreshed by scripts/update-ipc.mjs).
//
// In a note, an inline code span `prix: 300 francs 1950` becomes the amount as
// written ("300 francs"), underlined; tapping it shows what it is worth in
// euros of the index's last full year, at equal purchasing power. The sum is
// done at build time, so the page carries the answer, not the index.
import ipc from "./data/ipc-france.json";

export const IPC: Record<string, number> = ipc.index;
export const IPC_YEARS = Object.keys(IPC).map(Number);
export const IPC_FIRST = Math.min(...IPC_YEARS);
export const IPC_LAST = Math.max(...IPC_YEARS);
export const IPC_SOURCE = ipc.source;

/** 1 € = 6,55957 francs (fixed 31 Dec 1998); 1 nouveau franc = 100 anciens (1960). */
export const FRANCS_PER_EURO = 6.55957;

export type Monnaie = "AF" | "NF" | "EUR";

export interface Prix {
  amount: number;
  unit: Monnaie;
  year: number;
  /** The amount as the note writes it, shown in place of the code span. */
  label: string;
}

const UNITS: [RegExp, Monnaie | "F"][] = [
  [/^(?:af|anciens?\s+francs?)$/i, "AF"],
  [/^(?:nf|nouveaux?\s+francs?)$/i, "NF"],
  [/^(?:€|eur|euros?)$/i, "EUR"],
  [/^(?:f|frs?|francs?)$/i, "F"],
];

/**
 * Parses `prix: <montant> <monnaie> <année>`. The amount takes spaces or
 * thin spaces as thousand separators and a comma as decimal mark. A bare
 * "francs" means old francs before 1960 and new francs from 1960, as people
 * wrote them at the time.
 */
export function parsePrix(code: string): Prix | null {
  const m = /^\s*prix\s*:\s*(\d[\d\s  .,]*?)\s+([^\d\s].*?)\s+(\d{4})\s*$/i.exec(code);
  if (!m) return null;
  const amount = Number(m[1].replace(/[\s  ]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  const year = Number(m[3]);
  const word = m[2].trim();
  const hit = UNITS.find(([re]) => re.test(word));
  if (!hit || !Number.isFinite(amount)) return null;
  let unit = hit[1];
  if (unit === "F") unit = year < 1960 ? "AF" : "NF";
  if (unit === "AF" && year >= 1960) return null;
  if (unit === "EUR" && year < 1999) return null;
  if (unit === "NF" && year > 2001) return null;
  if (year < IPC_FIRST || year > IPC_LAST) return null;
  return { amount, unit, year, label: `${m[1].trim()} ${word}` };
}

/** Worth of `amount` (in `unit`, spent in `year`) in euros of `to`. */
export function toEuros(amount: number, unit: Monnaie, year: number, to = IPC_LAST): number {
  const euros = unit === "EUR" ? amount : (unit === "AF" ? amount / 100 : amount) / FRANCS_PER_EURO;
  return (euros * IPC[String(to)]) / IPC[String(year)];
}

/** "9,47 €" under 100 €, "33 713 €" above (French grouping, no false precision). */
export function formatEuros(v: number): string {
  const nf =
    v >= 100
      ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
      : new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${nf.format(v)} €`;
}
