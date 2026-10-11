// RC circuit maths for the "circuit-rc" widget (public/js/sci/circuit-rc.js).
// Capacitor charging through R from a source E: u_C(t) = E·(1 − e^{−t/τ});
// discharging into R: u_C(t) = E·e^{−t/τ}; τ = R·C.

export type ModeRC = "charge" | "decharge";

/** Time constant in seconds, R in ohms, C in microfarads. */
export function tau(rOhm: number, cMicroF: number): number {
  return rOhm * cMicroF * 1e-6;
}

/** Capacitor voltage at time t (s). */
export function uC(mode: ModeRC, e: number, t: number, tauS: number): number {
  const x = Math.exp(-t / tauS);
  return mode === "charge" ? e * (1 - x) : e * x;
}

/** Current through R (A): E/R·e^{−t/τ}, positive while charging, negative
 *  (flowing out of the capacitor) while discharging. */
export function courant(
  mode: ModeRC,
  e: number,
  rOhm: number,
  t: number,
  tauS: number,
): number {
  const i = (e / rOhm) * Math.exp(-t / tauS);
  return mode === "charge" ? i : -i;
}

/** Time to reach a fraction f of the way to the final value: −τ·ln(1 − f).
 *  f = 0.99 → τ·ln 100 ≈ 4,6 τ. */
export function tempsFraction(f: number, tauS: number): number {
  return -tauS * Math.log(1 - f);
}

/** "0,25 ms", "1,5 s", "2 min 30 s"… for a duration in seconds. */
export function formatDuree(s: number): string {
  const nf = (v: number, d: number) =>
    new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: d,
      minimumFractionDigits: 0,
    }).format(v);
  const digits = (v: number) => (v >= 100 ? 0 : v >= 10 ? 1 : 2);
  if (s < 1e-3) return nf(s * 1e6, digits(s * 1e6)) + " µs";
  if (s < 1) return nf(s * 1e3, digits(s * 1e3)) + " ms";
  if (s < 120) return nf(s, digits(s)) + " s";
  const m = Math.floor(s / 60);
  return m + " min " + Math.round(s - m * 60) + " s";
}

/** Unit to label a time axis that runs from 0 to tMax seconds. */
export function uniteTemps(tMax: number): { unite: string; facteur: number } {
  if (tMax < 2e-3) return { unite: "µs", facteur: 1e6 };
  if (tMax < 2) return { unite: "ms", facteur: 1e3 };
  return { unite: "s", facteur: 1 };
}
