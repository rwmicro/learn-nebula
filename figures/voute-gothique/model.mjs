export const G_ACC = 9.81;
export const STONE = 22;
export const SLICE = 3;

export const WALL = { thick: 1.2, high: 24, vault: 300 };
export const PIER = { wide: 4, high: 24, pinnacle: 30 };
export const THRUST = { force: 130, atWall: 22, atPier: 20 };

export const wallWeight = () => WALL.thick * SLICE * WALL.high * STONE + WALL.vault;
export const pierWeight = () => PIER.wide * SLICE * PIER.high * STONE + PIER.pinnacle * G_ACC;

export function state(flyer) {
  const onWall = (1 - flyer) * THRUST.force;
  const onPier = flyer * THRUST.force;
  const wallOffset = (onWall * THRUST.atWall) / wallWeight();
  const pierOffset = (onPier * THRUST.atPier) / pierWeight();
  const wallHalf = WALL.thick / 2;
  const pierThird = PIER.wide / 6;
  return {
    flyer,
    wallOffset,
    pierOffset,
    wallHalf,
    pierThird,
    wallStands: wallOffset <= wallHalf,
    pierInThird: pierOffset <= pierThird,
  };
}

export const metres = (value) => value.toFixed(2).replace(".", ",") + " m";

export function readout(s) {
  if (s.flyer > 0.98) return `mur ${metres(s.wallOffset)} · culée ${metres(s.pierOffset)} ✓ tiers central`;
  if (s.wallStands) return `mur ${metres(s.wallOffset)} · culée ${metres(s.pierOffset)}`;
  return `mur ${metres(s.wallOffset)} hors de sa base · il bascule`;
}
