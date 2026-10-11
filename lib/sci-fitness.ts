// Fitness-fatigue model behind the "supercompensation" widget
// (public/js/sci/supercompensation.js).
//
// Banister's impulse-response model (1975): each session adds a "fitness"
// impulse that fades slowly (time constant tauForme) and a larger "fatigue"
// impulse that fades fast (tauFatigue); performance = base + fitness − fatigue.
// The plain model is linear, so it can never show overreaching (more sessions
// always add more fitness than fatigue in the long run). Busso (2003) made the
// fatigue gain grow with the recent training load; that variable-dose term is
// what turns sessions packed too close into a lasting dip. The time constants
// here are chosen so one session draws the textbook curve over a few days;
// they are illustrative, not fitted to anyone.

export type Intensite = "legere" | "moderee" | "intense";

/** Training load of one session, arbitrary units. */
export const CHARGE: Record<Intensite, number> = {
  legere: 1,
  moderee: 2,
  intense: 3,
};

export const INTENSITE_LABEL: Record<Intensite, string> = {
  legere: "légère",
  moderee: "modérée",
  intense: "intense",
};

export interface Seance {
  /** Day number, 1-based: the session happens at the start of that day. */
  jour: number;
  intensite: Intensite;
}

export const PARAMS = {
  /** Fitness fades with this time constant (days). */
  tauForme: 3.9,
  /** Fatigue fades with this time constant (days). */
  tauFatigue: 1.15,
  /** Memory of the recent load that raises the fatigue gain (days). */
  tauCharge: 3,
  kForme: 1,
  /** Fatigue gain of a session done fresh. */
  kFatigue: 2.5,
  /** How much each unit of recent load raises the fatigue gain (Busso). */
  kSensibilite: 0.08,
  /** How much each unit of recent load slows the fading of that session's
   *  fatigue (recovery after a heavy block takes longer). */
  kLenteur: 0.1,
  /** Index points per model unit (performance is 100 + echelle·(forme − fatigue)). */
  echelle: 3,
};
export type Params = typeof PARAMS;

/** "légère", "legere", "leger", "light"… → Intensite; unknown → fallback. */
export function parseIntensite(
  s: unknown,
  fallback: Intensite = "moderee",
): Intensite {
  const k = String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  if (k.startsWith("leg") || k === "light" || k === "faible") return "legere";
  if (k.startsWith("mod")) return "moderee";
  if (k.startsWith("int") || k === "forte" || k === "hard") return "intense";
  return fallback;
}

/** "1,4,7" → sessions on those days (deduplicated, sorted, within 1..jours). */
export function parseSeances(
  s: unknown,
  jours: number,
  intensite: Intensite,
): Seance[] {
  const days = String(s ?? "")
    .split(/[\s,;]+/)
    .map((x) => Math.round(Number(x)))
    .filter((d) => Number.isFinite(d) && d >= 1 && d <= jours);
  return [...new Set(days)]
    .sort((a, b) => a - b)
    .map((jour) => ({ jour, intensite }));
}

/** Recent load at each session (sorted by day): earlier sessions' loads,
 *  fading with tauCharge. */
function chargesRecentes(s: Seance[], p: Params): number[] {
  return s.map((cur, i) => {
    let recent = 0;
    for (let j = 0; j < i; j++)
      recent +=
        CHARGE[s[j].intensite] *
        Math.exp(-(cur.jour - s[j].jour) / p.tauCharge);
    return recent;
  });
}

/** Fatigue gain of each session (same order as `seances`, sorted by day). */
export function fatigueGains(seances: Seance[], p: Params = PARAMS): number[] {
  const s = [...seances].sort((a, b) => a.jour - b.jour);
  return chargesRecentes(s, p).map(
    (r) => p.kFatigue * (1 + p.kSensibilite * r),
  );
}

/** Fatigue time constant of each session (days). */
export function fatigueTaus(seances: Seance[], p: Params = PARAMS): number[] {
  const s = [...seances].sort((a, b) => a.jour - b.jour);
  return chargesRecentes(s, p).map((r) => p.tauFatigue * (1 + p.kLenteur * r));
}

export interface Etat {
  forme: number;
  fatigue: number;
  /** Performance index, 100 = untrained baseline. */
  perf: number;
}

/** Model state at time t (days, same scale as Seance.jour). */
export function etat(seances: Seance[], t: number, p: Params = PARAMS): Etat {
  const s = [...seances].sort((a, b) => a.jour - b.jour);
  const g = fatigueGains(s, p);
  const tg = fatigueTaus(s, p);
  let forme = 0;
  let fatigue = 0;
  s.forEach((x, i) => {
    const dt = t - x.jour;
    if (dt < 0) return;
    const w = CHARGE[x.intensite];
    forme += p.kForme * w * Math.exp(-dt / p.tauForme);
    fatigue += g[i] * w * Math.exp(-dt / tg[i]);
  });
  return { forme, fatigue, perf: 100 + p.echelle * (forme - fatigue) };
}

/** Samples of the performance index from t0 to t1 every `pas` days. */
export function courbe(
  seances: Seance[],
  t0: number,
  t1: number,
  pas = 0.1,
  p: Params = PARAMS,
) {
  const out: { t: number; perf: number; forme: number; fatigue: number }[] = [];
  const n = Math.round((t1 - t0) / pas);
  for (let i = 0; i <= n; i++) {
    const t = t0 + i * pas;
    out.push({ t, ...etat(seances, t, p) });
  }
  return out;
}

/** Gain of an isolated session: time of the peak after it (days) and the
 *  peak height, from d/dt(kF·e^{-t/τF} − kG·e^{-t/τG}) = 0. */
export function picIsole(p: Params = PARAMS) {
  const a = 1 / p.tauForme;
  const b = 1 / p.tauFatigue;
  const tPic = Math.log((p.kFatigue * b) / (p.kForme * a)) / (b - a);
  const hauteur =
    p.kForme * Math.exp(-a * tPic) - p.kFatigue * Math.exp(-b * tPic);
  const tZero = Math.log(p.kFatigue / p.kForme) / (b - a);
  return { tPic, hauteur, tZero };
}

export type Timing = "trop-tot" | "fenetre" | "trop-tard";

/**
 * Where each session after the first lands on the curve left by the previous
 * ones: below the baseline (still tired), in the supercompensation window
 * (above the baseline by at least a third of what a lone session of the same
 * load would give), or after the gain has mostly faded.
 */
export function timings(
  seances: Seance[],
  p: Params = PARAMS,
): { jour: number; timing: Timing; perf: number }[] {
  const s = [...seances].sort((a, b) => a.jour - b.jour);
  const { hauteur } = picIsole(p);
  const out: { jour: number; timing: Timing; perf: number }[] = [];
  for (let i = 1; i < s.length; i++) {
    const before = s.slice(0, i);
    const { perf } = etat(before, s[i].jour - 1e-6, p);
    const prev = CHARGE[s[i - 1].intensite];
    const seuil = (p.echelle * hauteur * prev) / 3;
    const timing: Timing =
      perf < 100 ? "trop-tot" : perf - 100 >= seuil ? "fenetre" : "trop-tard";
    out.push({ jour: s[i].jour, timing, perf });
  }
  return out;
}
