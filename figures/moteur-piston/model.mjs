// Cycle d'Otto idéal (air, gaz parfait) dans un monocylindre quatre temps.
// Cotes inspirées du moteur d'essai CFR : alésage 82,55 mm, course 114,3 mm,
// rapport volumétrique réglable. Bielle supposée 3,5 fois le rayon de manivelle.
export const GAMMA = 1.4;
export const BORE_MM = 82.55;
export const STROKE_MM = 114.3;
export const ROD_RATIO = 3.5;
export const P_IN = 1.0;
export const T_IN = 300;
export const Q_HEAT = 1500;
export const CV_AIR = 0.718;
export const R_LOW = 5;
export const R_HIGH = 14;
export const R_START = 10;

export const SWEPT_CM3 = (Math.PI / 4) * (BORE_MM / 10) ** 2 * (STROKE_MM / 10);
export const crankMm = () => STROKE_MM / 2;
export const rodMm = () => ROD_RATIO * crankMm();

export function travelMm(theta) {
  const a = crankMm();
  const l = rodMm();
  const s = Math.sin(theta);
  return a * (1 - Math.cos(theta)) + l - Math.sqrt(l * l - a * a * s * s);
}

export const clearanceCm3 = (r) => SWEPT_CM3 / (r - 1);
export const clearanceMm = (r) => STROKE_MM / (r - 1);
export const volumeCm3 = (theta, r) => clearanceCm3(r) + (SWEPT_CM3 * travelMm(theta)) / STROKE_MM;

export const ottoEfficiency = (r) => 1 - Math.pow(r, 1 - GAMMA);
export const peakKelvin = (r) => T_IN * Math.pow(r, GAMMA - 1) + Q_HEAT / CV_AIR;
export const carnotEfficiency = (r) => 1 - T_IN / peakKelvin(r);

export const STROKES = ["admission", "compression", "détente", "échappement"];

export function strokeOf(cycle) {
  const t = ((cycle % (4 * Math.PI)) + 4 * Math.PI) % (4 * Math.PI);
  return Math.min(3, Math.floor(t / Math.PI));
}

export function gasState(cycle, r) {
  const t = ((cycle % (4 * Math.PI)) + 4 * Math.PI) % (4 * Math.PI);
  const stroke = Math.min(3, Math.floor(t / Math.PI));
  const v = volumeCm3(t, r);
  const v1 = clearanceCm3(r) + SWEPT_CM3;
  const v2 = clearanceCm3(r);
  const t2 = T_IN * Math.pow(r, GAMMA - 1);
  const t3 = peakKelvin(r);
  const p3 = P_IN * Math.pow(r, GAMMA) * (t3 / t2);
  let p = P_IN;
  let temp = T_IN;
  if (stroke === 1) {
    p = P_IN * Math.pow(v1 / v, GAMMA);
    temp = T_IN * Math.pow(v1 / v, GAMMA - 1);
  } else if (stroke === 2) {
    p = p3 * Math.pow(v2 / v, GAMMA);
    temp = t3 * Math.pow(v2 / v, GAMMA - 1);
  } else if (stroke === 3) {
    temp = t3 * Math.pow(1 / r, GAMMA - 1);
  }
  return { stroke, name: STROKES[stroke], volume: v, pressure: p, kelvin: temp, otto: ottoEfficiency(r), carnot: carnotEfficiency(r), peak: t3, ratio: r };
}

// Levée de soupape (0..1) : une bosse sinusoïdale sur la course concernée.
export function valveLift(cycle, which) {
  const t = ((cycle % (4 * Math.PI)) + 4 * Math.PI) % (4 * Math.PI);
  const from = which === "in" ? 0 : 3 * Math.PI;
  const u = (t - from) / Math.PI;
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(Math.PI * u) ** 2;
}

const comma = (value, digits) => value.toFixed(digits).replace(".", ",");
const percent = (value) => Math.round(value * 100) + " %";

export function readoutOf(s, short = false) {
  const bar = s.pressure >= 10 ? comma(s.pressure, 0) : comma(s.pressure, 1);
  return `${s.name} · ${bar} bar · ${Math.round(s.volume)} cm³ · ${short ? "" : "Otto "}${percent(s.otto)} < ${short ? "" : "Carnot "}${percent(s.carnot)}`;
}
