export const LENGTH_KM = 24;
export const WELL_KM = 9;
export const SHALLOW_KM = 16;
export const PIEZO_KM = 5.6;
export const OUTLET_HEAD = 60;
export const RECHARGE = { low: 108, high: 134, start: 132 };
export const AQUIFER = { thick: 30, K: 5e-5, porosity: 0.2 };
export const THIEM = { radius: 500, bore: 0.1 };
export const WATER_TABLE_DEPTH = 3.5;
export const BOTTOM = 0;

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const sandTop = (s) => 68 + 1.2 * (9 - s) + 58 / (1 + Math.exp((s - 3.4) / 1.0));
export const sandBottom = (s) => sandTop(s) - AQUIFER.thick;
export const clayThick = (s) => 22 * smooth(0.8, 3.0, s);
export const alluvThick = (s) => 10 * smooth(4.0, 6.2, s);
export const clayTop = (s) => sandTop(s) + clayThick(s);
export const ground = (s) => clayTop(s) + alluvThick(s);
export const waterTable = (s) => Math.max(clayTop(s), ground(s) - WATER_TABLE_DEPTH);

export const headAt = (s, recharge) => recharge - ((recharge - OUTLET_HEAD) * s) / LENGTH_KM;

export function state(recharge) {
  const head = headAt(WELL_KM, recharge);
  const soil = ground(WELL_KM);
  const over = head - soil;
  const gradient = (recharge - OUTLET_HEAD) / (LENGTH_KM * 1000);
  const darcy = AQUIFER.K * gradient;
  const flow = over >= 0.05 ? (2 * Math.PI * AQUIFER.K * AQUIFER.thick * over) / Math.log(THIEM.radius / THIEM.bore) : 0;
  return {
    recharge,
    head,
    soil,
    over,
    gradient,
    darcy,
    metresPerYear: (darcy / AQUIFER.porosity) * 3.156e7,
    flowing: over >= 0.05,
    litres: flow * 1000,
  };
}

const comma = (value, digits = 1) => value.toFixed(digits).replace(".", ",").replace("-", "−");
const signed = (value) => (value >= 0 ? "+" : "−") + comma(Math.abs(value));

export function readout(s) {
  if (s.flowing) return `puits profond ${signed(s.over)} m / sol · jaillit ${comma(s.litres)} L/s`;
  return `puits profond ${signed(s.over)} m / sol · ne jaillit pas`;
}

export function spoken(s) {
  const level = `recharge à ${Math.round(s.recharge)} m d'altitude ; niveau piézométrique au puits profond ${comma(s.head)} m pour un sol à ${comma(s.soil)} m`;
  return s.flowing ? `${level} : puits artésien jaillissant, ${comma(s.litres)} litres par seconde` : `${level} : l'eau reste sous le sol, le puits ne jaillit pas`;
}
