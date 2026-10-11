// Refreshes lib/data/ipc-france.json: the French consumer price index, one
// value per year since 1949, from the Insee's open series database (BDM, SDMX
// web service). Run by hand once a year (`node scripts/update-ipc.mjs`) after
// the Insee publishes the December index; the build never calls the network
// for it, so a price conversion in a note always gives the same euros.
//
// Two series chained in 1990, the year they overlap:
//   000008965  « Indice des prix des 295 postes, base 100 en 1980, annuel,
//              ensemble » (1949-1992, série arrêtée)
//   001763852  « IPC base 2015, ensemble des ménages, France, hors tabac »
//              (monthly from 1990; averaged over complete years)
// The Insee's own franc-euro converter uses the same chaining principle.
import fs from "node:fs";
import path from "node:path";

const SDMX = "https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/";

async function series(idbank) {
  const res = await fetch(SDMX + idbank);
  if (!res.ok) throw new Error(`${idbank}: HTTP ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/TIME_PERIOD="([^"]+)" OBS_VALUE="([^"]+)"/g)].map((m) => [m[1], Number(m[2])]);
}

const old = new Map((await series("000008965")).map(([p, v]) => [Number(p), v]));
const months = await series("001763852");
const byYear = new Map();
for (const [p, v] of months) {
  const y = Number(p.slice(0, 4));
  (byYear.get(y) ?? byYear.set(y, []).get(y)).push(v);
}
const recent = new Map([...byYear].filter(([, vs]) => vs.length === 12).map(([y, vs]) => [y, vs.reduce((a, b) => a + b, 0) / 12]));

const k = recent.get(1990) / old.get(1990);
const index = {};
for (const [y, v] of [...old].sort((a, b) => a[0] - b[0])) if (y < 1990) index[y] = Number((v * k).toFixed(3));
for (const [y, v] of [...recent].sort((a, b) => a[0] - b[0])) index[y] = Number(v.toFixed(3));

const out = {
  source: "Insee, BDM : séries 000008965 (base 1980) et 001763852 (base 2015 hors tabac), chaînées en 1990",
  updated: new Date().toISOString().slice(0, 10),
  base: "2015 = 100",
  index,
};
const file = path.join(process.cwd(), "lib", "data", "ipc-france.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
const years = Object.keys(index);
console.log(`ipc: ${years[0]}–${years.at(-1)} → ${path.relative(process.cwd(), file)}`);
