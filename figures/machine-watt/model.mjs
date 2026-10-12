export const G_ACC = 9.81;
export const CH = 735.5;
export const RPM = 60 / (2 * Math.PI);

export const GOV = { arm: 0.3, ratio: 1.39, open: 24, shut: 46, low: 18, high: 52, damping: 4 };
export const FLY = { inertia: 6000, friction: 20 };
export const TORQUE = { full: 1672, max: 2200 };
export const LOAD = { low: 0.2, high: 1 };

const RAD = Math.PI / 180;

export const valve = (phi) => Math.min(1, Math.max(0, (GOV.shut - phi / RAD) / (GOV.shut - GOV.open)));

export function settled(load) {
  let w = 4.4;
  for (let i = 0; i < 80; i++) {
    const need = (load * TORQUE.full + FLY.friction * w) / TORQUE.max;
    const phi = (GOV.shut - need * (GOV.shut - GOV.open)) * RAD;
    const wg = Math.sqrt(G_ACC / (GOV.arm * Math.cos(phi)));
    w = wg / GOV.ratio;
  }
  const phi = Math.acos(G_ACC / (GOV.arm * (w * GOV.ratio) ** 2));
  return { omega: w, phi, rate: 0, theta: 0, psi: 0 };
}

export function step(s, load, dt) {
  const n = Math.max(1, Math.ceil(dt / 0.004));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const wg = s.omega * GOV.ratio;
    const pull = Math.sin(s.phi) * (wg * wg * Math.cos(s.phi) - G_ACC / GOV.arm);
    s.rate += (pull - GOV.damping * s.rate) * h;
    s.phi += s.rate * h;
    if (s.phi < GOV.low * RAD) { s.phi = GOV.low * RAD; s.rate = Math.max(0, s.rate); }
    if (s.phi > GOV.high * RAD) { s.phi = GOV.high * RAD; s.rate = Math.min(0, s.rate); }
    const drive = TORQUE.max * valve(s.phi) - load * TORQUE.full - FLY.friction * s.omega;
    s.omega = Math.max(0, s.omega + (drive / FLY.inertia) * h);
    s.theta += s.omega * h;
    s.psi += s.omega * GOV.ratio * h;
  }
  return s;
}

export const power = (s, load) => (load * TORQUE.full * s.omega) / CH;

const comma = (value, digits) => value.toFixed(digits).replace(".", ",");
export function readout(s, load) {
  return `${comma(s.omega * RPM, 1)} tr/min · vanne ${Math.round(valve(s.phi) * 100)} % · ${comma(power(s, load), 1)} ch`;
}

export const BEAM = { pivot: [-10, 150], arm: 95, axle: [85, 70], orbit: 18, rod: 80 };

export function linkage(theta) {
  const alpha = theta / 2;
  const q = [BEAM.axle[0] + BEAM.orbit * Math.sin(alpha), BEAM.axle[1] + BEAM.orbit * Math.cos(alpha)];
  let beta = 0;
  for (let i = 0; i < 8; i++) {
    const e = [BEAM.pivot[0] + BEAM.arm * Math.cos(beta), BEAM.pivot[1] + BEAM.arm * Math.sin(beta)];
    const dx = e[0] - q[0], dz = e[1] - q[1];
    const f = dx * dx + dz * dz - BEAM.rod * BEAM.rod;
    const df = 2 * dx * -BEAM.arm * Math.sin(beta) + 2 * dz * BEAM.arm * Math.cos(beta);
    beta -= f / df;
  }
  const e = [BEAM.pivot[0] + BEAM.arm * Math.cos(beta), BEAM.pivot[1] + BEAM.arm * Math.sin(beta)];
  return { alpha, beta, q, e };
}
