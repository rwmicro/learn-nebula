// Alternateur de démonstration : un aimant tourne entre deux bobines.
// Chiffres d'un petit modèle de paillasse (hypothèses, pas une fiche technique) :
// deux bobines de 250 spires en série (N = 500), champ moyen B = 0,1 T dans
// les noyaux, section S = 10 cm², démultiplication manivelle → aimant 1:4.
export const TURNS = 500;
export const FIELD = 0.1;
export const AREA = 10e-4;
export const GEAR = 4;
export const RPM_MAX = 480;
export const LAMP_V = 2.5;
export const SCALE_V = 3;

export const omegaOf = (rpm) => (rpm * 2 * Math.PI) / 60;
export const peakOf = (rpm) => TURNS * FIELD * AREA * omegaOf(rpm);
export const emfAt = (rpm, angle) => peakOf(rpm) * Math.sin(angle);
export const hertzOf = (rpm) => rpm / 60;
export const crankOf = (rpm) => rpm / GEAR;

const comma = (value, digits) => value.toFixed(digits).replace(".", ",");

export function readout(rpm) {
  if (rpm < 0.5) return "aimant à l'arrêt · 0 V";
  return `${Math.round(rpm)} tr/min · ${comma(hertzOf(rpm), 1)} Hz · crête ${comma(peakOf(rpm), 2)} V`;
}
