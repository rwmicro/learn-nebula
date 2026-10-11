// Refreshes lib/data/world-110m.json: one SVG path per country, already
// projected (Equal Earth, 1000 units wide), for the /carte/ page. Run by hand
// (`node scripts/update-world.mjs`); borders change about once a decade, so the
// result is committed and the build never fetches it.
//
// Source: world-atlas 2.0.2 (Natural Earth 1:110m, public domain), TopoJSON.
// Countries are keyed by their ISO 3166-1 numeric code, the same key as
// lib/countries.ts; the three without one (Kosovo, Somaliland, N. Cyprus) get
// an ad-hoc key and no data. Antarctica is left out.
import fs from "node:fs";
import path from "node:path";

const URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json";
const OUT = path.join(import.meta.dirname, "..", "lib", "data", "world-110m.json");
const WIDTH = 1000;

// Equal Earth (Šavrič, Patterson, Jenny 2018).
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796;
const M = Math.sqrt(3) / 2;
function equalEarth(lon, lat) {
  const l = (lon * Math.PI) / 180, p = (lat * Math.PI) / 180;
  const t = Math.asin(M * Math.sin(p));
  const t2 = t * t, t6 = t2 * t2 * t2;
  const x = (l * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [x, y];
}
const [XMAX] = equalEarth(180, 0);
const [, YMAX] = equalEarth(0, 90);
const K = WIDTH / 2 / XMAX;
// Crop the empty Antarctic band: the map stops at 60° S.
const [, YSOUTH] = equalEarth(0, -60);
const HEIGHT = Math.round(K * (YMAX - YSOUTH));
const project = (lon, lat) => {
  const [x, y] = equalEarth(lon, lat);
  return [WIDTH / 2 + x * K, K * (YMAX - y)];
};

const res = await fetch(URL);
if (!res.ok) throw new Error(`${URL}: HTTP ${res.status}`);
const topo = await res.json();
const { scale, translate } = topo.transform;

// Delta-decoded arcs, in degrees.
const arcs = topo.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
  });
});

function ring(indices) {
  const pts = [];
  for (const i of indices) {
    const a = i < 0 ? [...arcs[~i]].reverse() : arcs[i];
    // Consecutive arcs share their joining point.
    pts.push(...(pts.length ? a.slice(1) : a));
  }
  return pts;
}

function pathOf(polygons) {
  let d = "";
  for (const poly of polygons) {
    for (const r of poly) {
      // A ring that crosses the antimeridian (Chukotka, Fiji) jumps from +180
      // to -180: unwrap it into continuous longitudes, then draw it once more
      // shifted by a full turn so both edges of the map get their half. What
      // falls outside the map is cut by the SVG's viewBox.
      const raw = ring(r);
      let shift = 0;
      const unwrapped = raw.map(([lon, lat], i) => {
        if (i) {
          const prev = raw[i - 1][0];
          if (lon - prev > 180) shift -= 360;
          else if (prev - lon > 180) shift += 360;
        }
        return [lon + shift, lat];
      });
      const lons = unwrapped.map((p) => p[0]);
      const copies = [0];
      if (Math.max(...lons) > 180) copies.push(-360);
      if (Math.min(...lons) < -180) copies.push(360);
      for (const off of copies) d += ringPath(unwrapped.map(([lon, lat]) => project(lon + off, lat)));
    }
  }
  return d;
}

function ringPath(pts) {
  let prev = "";
  let seg = "";
  for (const [x, y] of pts) {
    const p = `${x.toFixed(1)},${y.toFixed(1)}`;
    if (p === prev) continue;
    seg += (seg ? "L" : "M") + p;
    prev = p;
  }
  return seg + "Z";
}

const ADHOC = { Kosovo: "XKX", Somaliland: "SOL", "N. Cyprus": "CYN" };
const countries = [];
for (const g of topo.objects.countries.geometries) {
  if (g.id === "010") continue; // Antarctica
  const polys = g.type === "Polygon" ? [g.arcs] : g.type === "MultiPolygon" ? g.arcs : [];
  if (!polys.length) continue;
  countries.push({ id: g.id ?? ADHOC[g.properties.name] ?? g.properties.name, d: pathOf(polys) });
}
countries.sort((a, b) => a.id.localeCompare(b.id));

fs.writeFileSync(
  OUT,
  JSON.stringify({
    source: "Natural Earth 1:110m via world-atlas 2.0.2 (domaine public)",
    projection: "Equal Earth",
    width: WIDTH,
    height: HEIGHT,
    countries,
  }) + "\n",
);
console.log(`world-110m: ${countries.length} countries, ${WIDTH}×${HEIGHT}, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
