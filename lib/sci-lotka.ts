// Lotka-Volterra predator-prey model for the "lotka-volterra" widget
// (public/js/sci/lotka-volterra.js):
//   dx/dt = αx − βxy   (prey: grow, get eaten)
//   dy/dt = δxy − γy   (predators: grow by eating, die off)
// integrated with classical fourth-order Runge-Kutta.

export interface LVParams {
  alpha: number;
  beta: number;
  delta: number;
  gamma: number;
}

export function derivee(p: LVParams, x: number, y: number): [number, number] {
  return [p.alpha * x - p.beta * x * y, p.delta * x * y - p.gamma * y];
}

/** One RK4 step of size h. */
export function pasRK4(
  p: LVParams,
  x: number,
  y: number,
  h: number,
): [number, number] {
  const [a1, b1] = derivee(p, x, y);
  const [a2, b2] = derivee(p, x + (h / 2) * a1, y + (h / 2) * b1);
  const [a3, b3] = derivee(p, x + (h / 2) * a2, y + (h / 2) * b2);
  const [a4, b4] = derivee(p, x + h * a3, y + h * b3);
  return [
    x + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4),
    y + (h / 6) * (b1 + 2 * b2 + 2 * b3 + b4),
  ];
}

/** Trajectory from (x0, y0) over [0, duree], one point every `h`. */
export function integrer(
  p: LVParams,
  x0: number,
  y0: number,
  duree: number,
  h = 0.01,
) {
  const n = Math.round(duree / h);
  const t = new Float64Array(n + 1);
  const x = new Float64Array(n + 1);
  const y = new Float64Array(n + 1);
  x[0] = x0;
  y[0] = y0;
  for (let i = 1; i <= n; i++) {
    [x[i], y[i]] = pasRK4(p, x[i - 1], y[i - 1], h);
    t[i] = i * h;
  }
  return { t, x, y };
}

/** Non-trivial equilibrium: x* = γ/δ prey, y* = α/β predators. */
export function equilibre(p: LVParams): { x: number; y: number } {
  return { x: p.gamma / p.delta, y: p.alpha / p.beta };
}

/** Quantity conserved along every orbit (why the orbits close):
 *  V = δx − γ ln x + βy − α ln y. */
export function invariant(p: LVParams, x: number, y: number): number {
  return (
    p.delta * x - p.gamma * Math.log(x) + p.beta * y - p.alpha * Math.log(y)
  );
}

/** Mean time between successive prey peaks, or null with fewer than two. */
export function periode(
  t: ArrayLike<number>,
  x: ArrayLike<number>,
): number | null {
  const pics: number[] = [];
  for (let i = 1; i < x.length - 1; i++)
    if (x[i] > x[i - 1] && x[i] >= x[i + 1]) pics.push(t[i]);
  if (pics.length < 2) return null;
  return (pics[pics.length - 1] - pics[0]) / (pics.length - 1);
}

/** Period of small oscillations around the equilibrium: 2π/√(αγ). */
export function periodeLineaire(p: LVParams): number {
  return (2 * Math.PI) / Math.sqrt(p.alpha * p.gamma);
}
