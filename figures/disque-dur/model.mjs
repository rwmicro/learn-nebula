// Disque dur 3,5" à 7200 tr/min contre SSD M.2 : temps d'une lecture.
// Ordres de grandeur d'un disque de bureau courant (fiches techniques des
// disques 7200 tr/min : recherche moyenne 8,5 ms, débit soutenu ~200 Mo/s)
// et d'un SSD SATA M.2 (~0,1 ms par lecture, ~550 Mo/s).
export const RPM = 7200;
export const TURN_MS = 60000 / RPM;
export const SEEK = { settle: 0.8, full: 15.2 };
export const HDD_MBPS = 200;
export const SSD = { latency: 0.1, mbps: 550 };
export const BYTES = { random: 4096, sequential: 1048576 };

export function seekMs(from, to) {
  const x = Math.abs(to - from);
  return x < 1e-6 ? 0 : SEEK.settle + (SEEK.full - SEEK.settle) * Math.sqrt(x);
}
export const meanSeekMs = () => SEEK.settle + ((SEEK.full - SEEK.settle) * 8) / 15;
export const meanRotationMs = () => TURN_MS / 2;
export const rotationMs = (angle) => (angle / (2 * Math.PI)) * TURN_MS;
export const hddTransferMs = (bytes) => (bytes / (HDD_MBPS * 1e6)) * 1000;
export const ssdMs = (bytes) => SSD.latency + (bytes / (SSD.mbps * 1e6)) * 1000;

export function plan(kind, from, to, gap) {
  const bytes = BYTES[kind];
  const seek = kind === "random" ? seekMs(from, to) : 0;
  const rotation = kind === "random" ? rotationMs(gap) : 0;
  const transfer = hddTransferMs(bytes);
  return { kind, bytes, seek, rotation, transfer, total: seek + rotation + transfer, ssd: ssdMs(bytes) };
}

export const msText = (value) => (value < 1 && value > 0 ? value.toFixed(2) : value.toFixed(1)).replace(".", ",");

export function readout(p, elapsed) {
  const seek = Math.min(elapsed, p.seek);
  const rotation = Math.min(Math.max(elapsed - p.seek, 0), p.rotation);
  const total = Math.min(elapsed, p.total);
  const ssd = Math.min(elapsed, p.ssd);
  return `rech. ${msText(seek)} · rot. ${msText(rotation)} · total ${msText(total)} ms · SSD ${msText(ssd)}`;
}
