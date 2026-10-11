// Build-time data for the data-pack widgets (lib/widgets-extra.ts).
//
// rehypeWidgets (lib/markdown.ts) hands each data widget's `key: value` props
// here; what comes back is what the browser receives in data-props, plus an
// optional no-JS fallback (a table of the same numbers). The reader's browser
// never calls a third party: OWID and Wikidata are read during the build and
// cached on disk, the Insee price index and the Lichess counts are committed
// snapshots refreshed by scripts/update-ipc.mjs and scripts/update-lichess.py.
import { loadOwid, loadOwidRegions, pickSeries, sig, type Series } from "./owid";
import { resolveCountry } from "./countries";
import { IPC, IPC_FIRST, IPC_LAST, IPC_SOURCE } from "./prix";
import lichess from "./data/lichess-openings.json";
import { loadLanguage } from "./wikidata";
import { resolveVaultAsset } from "./vault-assets";
import { getLanguageScopes, tagHref } from "./content";

/** Where the block sits: the note's folder, for note-relative paths. */
export interface WidgetContext {
  dir: string;
}

export interface Enriched {
  props: Record<string, unknown>;
  /** Plain rows for the fallback table: [header, ...rows]. */
  table?: string[][];
  /** Shown instead of the generic fallback line when the data is missing. */
  error?: string;
}

const list = (s: string | undefined) =>
  (s ?? "")
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
const num = (s: string | undefined) => (s == null || s === "" ? undefined : Number(s));

/** OWID's units are English; the common ones, in French. Others are left
 *  out: the block's `unite:` says it better than a guess. */
const UNIT_FR: Record<string, string> = {
  years: "ans",
  "%": "%",
  people: "habitants",
  "deaths per 1,000 live births": "pour 1 000 naissances",
  "°C": "°C",
  tonnes: "tonnes",
  "international-$ in 2011 prices": "$ de 2011",
  "international-$ in 2021 prices": "$ de 2021",
};

function source(meta: { title: string; citation: string; url: string }) {
  return { title: meta.title, citation: meta.citation, url: meta.url, licence: "CC BY 4.0" };
}

/** Year × series table for the no-JS fallback (and the "Tableau" tab). */
function seriesTable(series: Series[], unit: string): string[][] {
  const years = [...new Set(series.flatMap((s) => s.points.map((p) => p[0])))].sort((a, b) => a - b);
  // A fallback of 200 rows helps nobody: keep about one row per decade.
  const step = Math.max(1, Math.ceil(years.length / 25));
  const keep = years.filter((_, i) => i % step === 0 || i === years.length - 1);
  const head = ["Année", ...series.map((s) => s.name + (unit ? ` (${unit})` : ""))];
  return [
    head,
    ...keep.map((y) => [
      String(y),
      ...series.map((s) => {
        const p = s.points.find((q) => q[0] === y);
        return p ? p[1].toLocaleString("fr-FR") : "–";
      }),
    ]),
  ];
}

async function owidChart(p: Record<string, string>): Promise<Enriched> {
  const slug = p.graphe ?? "";
  const type = p.type ?? "courbe";
  if (type === "bulles") return bulles(p);
  if (type === "multiples" && p.panneaux) return multiplesPanels(p);
  const data = await loadOwid(slug, p.vue ?? "");
  if (!data) return { props: {}, error: `Données Our World in Data indisponibles (${slug}).` };
  const { table, meta } = data;

  if (type === "pyramide") {
    const who = list(p.pays)[0] ?? "France";
    const r = resolveCountry(who);
    const rows = table.rows.filter((row) => (r?.owid ? row.entity === r.owid : row.code === r?.code));
    if (!rows.length) return { props: {}, error: `Pas de données pour ${who}.` };
    // Age columns look like population__sex_all__age_0_4__variant_estimates.
    const ages = table.columns.map((c) => {
      const m = /__age_(\d+)_(\d+|plus)/.exec(c) ?? /__age_(\d+)plus/.exec(c);
      if (!m) return c;
      return m[2] && m[2] !== "plus" ? `${m[1]}–${m[2]}` : `${m[1]}+`;
    });
    const years: Record<string, number[]> = {};
    for (const row of rows) {
      if (p.depuis && row.year < Number(p.depuis)) continue;
      if (p.jusqua && row.year > Number(p.jusqua)) continue;
      years[row.year] = row.values.map((v) => (v == null ? 0 : Math.round(v)));
    }
    const projection = p.projection && p.projection !== "non" ? await agesProjection(who) : null;
    return {
      props: {
        type,
        projection,
        title: p.titre ?? `${r?.fr ?? who} : population par tranche d'âge`,
        subtitle: p["sous-titre"] ?? "Population par tranche d'âge de 5 ans",
        country: r?.fr ?? who,
        ages,
        years,
        compare: num(p.comparer),
        source: source(meta),
      },
    };
  }

  const colName = p.colonne;
  const col = colName ? Math.max(0, table.columns.indexOf(colName)) : 0;
  const { series, missing } = pickSeries(table, list(p.pays ?? "Monde"), {
    col,
    from: num(p.depuis),
    to: num(p.jusqua),
  });
  if (missing.length) console.warn(`owid ${slug}: pas de données pour ${missing.join(", ")}`);
  if (!series.length) return { props: {}, error: `Pas de données pour ${p.pays ?? "Monde"}.` };
  const unit = p.unite ?? UNIT_FR[meta.unit] ?? "";
  if (type === "pente") return pente(p, series, unit, meta);
  if (type === "multiples") {
    const ref = p.reference ? pickSeries(table, [p.reference], { col, from: num(p.depuis), to: num(p.jusqua) }).series[0] : undefined;
    return {
      props: {
        type,
        title: p.titre ?? meta.title,
        subtitle: p["sous-titre"] ?? "",
        unit,
        panels: series.map((s) => ({ title: s.name, unit, points: s.points })),
        reference: ref ?? null,
        source: source(meta),
      },
      table: seriesTable(series, unit),
    };
  }
  const props: Record<string, unknown> = {
    type,
    title: p.titre ?? meta.title,
    subtitle: p["sous-titre"] ?? "",
    unit,
    series,
    log: p.echelle === "log",
    zero: p.zero !== "non",
    source: source(meta),
  };
  // A second dataset behind a toggle: `graphe2:` (same countries), labelled
  // by `onglet:` / `onglet2:` — total vs per head, say.
  if (p.graphe2) {
    const d2 = await loadOwid(p.graphe2);
    if (d2) {
      const s2 = pickSeries(d2.table, list(p.pays ?? "Monde"), { from: num(p.depuis), to: num(p.jusqua) }).series;
      if (s2.length)
        props.alt = {
          label: p.onglet2 ?? d2.meta.title,
          title: p.titre2 ?? "",
          subtitle: p["sous-titre2"] ?? "",
          unit: p.unite2 ?? UNIT_FR[d2.meta.unit] ?? "",
          series: s2,
          source: source(d2.meta),
        };
    }
    props.tab = p.onglet ?? meta.title;
  }
  // A dashed "doubling every N years" line from the first point (Moore).
  if (p.doublement) props.doubling = num(p.doublement);
  if (type === "devine") props.reveal = num(p.devine) ?? series[0].points[Math.floor(series[0].points.length / 2)][0];
  if (type === "recit") {
    // etapes: one per line "debut-fin | pays mis en avant | texte"
    props.steps = Object.entries(p)
      .filter(([k]) => /^etape\d*$/.test(k))
      .map(([, v]) => {
        const [range, focus, ...text] = v.split("|").map((x) => x.trim());
        const [a, b] = range.split(/[-–]/).map(Number);
        const f = focus ? resolveCountry(focus) : null;
        return { from: a, to: b || a, focus: f?.fr ?? focus ?? "", text: text.join(" | ") };
      });
  }
  return { props, table: seriesTable(series, unit) };
}

/** Two years side by side, one line per country (a slope chart). */
function pente(p: Record<string, string>, series: Series[], unit: string, meta: Parameters<typeof source>[0]): Enriched {
  const [ya, yb] = list(p.annees).map(Number);
  if (!ya || !yb) return { props: {}, error: "Il faut deux années : annees: 1990, 2023." };
  const at = (s: Series, y: number) => s.points.find((q) => q[0] === y)?.[1];
  const rows = series
    .map((s) => ({ name: s.name, a: at(s, ya), b: at(s, yb) }))
    .filter((r): r is { name: string; a: number; b: number } => r.a != null && r.b != null);
  if (rows.length < 2) return { props: {}, error: `Pas assez de pays avec des données en ${ya} et ${yb}.` };
  const hi = list(p["mettre-en-avant"]).map((n) => series.find((s) => s.name === n || s.code === n)?.name ?? n);
  return {
    props: { type: "pente", title: p.titre ?? meta.title, subtitle: p["sous-titre"] ?? "", unit, years: [ya, yb], rows, highlight: hi, source: source(meta) },
    table: [["Pays", String(ya), String(yb), "Écart"], ...rows.map((r) => [r.name, fmtFr(r.a), fmtFr(r.b), fmtFr(sig(r.b - r.a))])],
  };
}
const fmtFr = (v: number) => v.toLocaleString("fr-FR");

/** Several datasets for one country, one small panel each:
 *  `panneaux: slug | titre | unité ; slug | titre | unité`. */
async function multiplesPanels(p: Record<string, string>): Promise<Enriched> {
  const who = list(p.pays)[0] ?? "France";
  const panels = [];
  const cites = [];
  for (const spec of p.panneaux.split(";")) {
    const [slug, title, unit] = spec.split("|").map((x) => x.trim());
    const d = await loadOwid(slug);
    if (!d) continue;
    const s = pickSeries(d.table, [who], { from: num(p.depuis), to: num(p.jusqua) ?? new Date().getFullYear() }).series[0];
    if (!s) continue;
    panels.push({ title: title || d.meta.title, unit: unit ?? UNIT_FR[d.meta.unit] ?? "", points: s.points, url: d.meta.url });
    cites.push(d.meta.citation);
  }
  if (!panels.length) return { props: {}, error: `Pas de données pour ${who}.` };
  return {
    props: {
      type: "multiples",
      title: p.titre ?? "",
      subtitle: p["sous-titre"] ?? "",
      panels,
      reference: null,
      source: { citation: cites.join(" ; "), url: "https://ourworldindata.org/", licence: "CC BY 4.0" },
    },
  };
}

/** GDP per head against life expectancy (or any x/y pair), bubbles sized by
 *  population, one frame every `pas` years: Gapminder's chart. */
async function bulles(p: Record<string, string>): Promise<Enriched> {
  const xs = p.x ?? "gdp-per-capita-maddison-project-database";
  const ys = p.y ?? "life-expectancy";
  const zs = p.taille ?? "population";
  const [dx, dy, dz] = await Promise.all([loadOwid(xs), loadOwid(ys), loadOwid(zs)]);
  if (!dx || !dy || !dz) return { props: {}, error: "Données Our World in Data indisponibles." };
  const names = list(p.pays);
  if (names.length < 2) return { props: {}, error: "Il faut au moins deux pays." };
  const from = num(p.depuis) ?? 1820;
  const to = num(p.jusqua) ?? new Date().getFullYear();
  const step = num(p.pas) ?? 10;
  const regionOf = await loadOwidRegions();
  const countries: { name: string; region: string; points: [number, number, number, number][] }[] = [];
  const years = new Set<number>();
  for (const n of names) {
    const [sx] = pickSeries(dx.table, [n], { from, to }).series;
    const [sy] = pickSeries(dy.table, [n], { from, to }).series;
    const [sz] = pickSeries(dz.table, [n], { from, to }).series;
    if (!sx || !sy || !sz) continue;
    const my = new Map(sy.points);
    const mz = new Map(sz.points);
    const pts: [number, number, number, number][] = [];
    for (const [yr, vx] of sx.points) {
      // One frame every `step` years, plus the last year with all three.
      if ((yr - from) % step !== 0 && yr !== sx.points.at(-1)?.[0]) continue;
      const vy = my.get(yr);
      const vz = mz.get(yr);
      if (vy == null || vz == null) continue;
      pts.push([yr, vx, vy, vz]);
      years.add(yr);
    }
    if (pts.length) countries.push({ name: sx.name, region: regionOf.get(sx.code) ?? "", points: pts });
  }
  if (countries.length < 2) return { props: {}, error: "Pas assez de pays avec les trois séries." };
  const yrs = [...years].sort((a, b) => a - b);
  // A year only some countries reach (2022 for one, 2020 for the rest) makes a
  // frame that loses half the bubbles: keep the years most countries have.
  const keep = yrs.filter((y) => countries.filter((c) => c.points.some((q) => q[0] === y)).length >= countries.length / 2);
  return {
    props: {
      type: "bulles",
      title: p.titre ?? `${dy.meta.title} et ${dx.meta.title}`,
      subtitle: p["sous-titre"] ?? "",
      xLabel: p["x-titre"] ?? dx.meta.title,
      yLabel: p["y-titre"] ?? dy.meta.title,
      xUnit: p["x-unite"] ?? UNIT_FR[dx.meta.unit] ?? "",
      yUnit: p["y-unite"] ?? UNIT_FR[dy.meta.unit] ?? "",
      xLog: p["x-echelle"] !== "lineaire",
      trace: p.trace ? (pickSeries(dx.table, [p.trace]).series[0]?.name ?? p.trace) : null,
      years: keep,
      countries,
      source: {
        citation: [dx.meta.citation, dy.meta.citation, dz.meta.citation].filter(Boolean).join(" ; "),
        url: dx.meta.url,
        licence: "CC BY 4.0",
      },
    },
    table: [
      ["Pays", "Année", p["x-titre"] ?? "x", p["y-titre"] ?? "y"],
      ...countries.map((c) => {
        const last = c.points.at(-1)!;
        return [c.name, String(last[0]), fmtFr(last[1]), fmtFr(last[2])];
      }),
    ],
  };
}

/** Share of the 65+ in a country's population, estimates then the UN's
 *  medium projection, for the bar panel next to an age pyramid. */
async function agesProjection(who: string) {
  const d = await loadOwid("population-by-age-group-with-projections");
  if (!d) return null;
  const c = (name: string) => d.table.columns.indexOf(name);
  const est = { all: c("population__sex_all__age_all__variant_estimates"), old: c("population__sex_all__age_65plus__variant_estimates") };
  const proj = { all: c("population__sex_all__age_all__variant_medium__projected"), old: c("population__sex_all__age_65plus__variant_medium__projected") };
  if ([est.all, est.old, proj.all, proj.old].some((i) => i < 0)) return null;
  const r = resolveCountry(who);
  const rows = d.table.rows.filter((row) => (r?.owid ? row.entity === r.owid : row.code === r?.code));
  const share = new Map<number, { v: number; projected: boolean }>();
  let lastEst = 0;
  for (const row of rows) {
    const ea = row.values[est.all], eo = row.values[est.old];
    const pa = row.values[proj.all], po = row.values[proj.old];
    if (ea && eo != null) {
      share.set(row.year, { v: sig((100 * eo) / ea), projected: false });
      lastEst = Math.max(lastEst, row.year);
    } else if (pa && po != null) share.set(row.year, { v: sig((100 * po) / pa), projected: true });
  }
  const want = [1950, 1975, 2000, lastEst, 2050, 2075, 2100];
  const bars = want.filter((y, i) => share.has(y) && want.indexOf(y) === i).map((y) => ({ year: y, ...share.get(y)! }));
  return bars.length ? { bars, lastEstimate: lastEst } : null;
}

/** Three small series for a country: population, life expectancy, GDP per head. */
async function fichePays(p: Record<string, string>): Promise<Enriched> {
  const who = p.pays ?? "";
  const r = resolveCountry(who);
  if (!r) return { props: {}, error: `Pays inconnu : ${who}.` };
  const specs = [
    { slug: "population", label: "Population", unit: "habitants" },
    { slug: "life-expectancy", label: "Espérance de vie", unit: "ans" },
    { slug: "gdp-per-capita-maddison-project-database", label: "PIB par habitant", unit: "$ de 2011" },
  ];
  const from = num(p.depuis) ?? 1950;
  const out = [];
  const cites = [];
  for (const s of specs) {
    const d = await loadOwid(s.slug);
    if (!d) continue;
    const { series } = pickSeries(d.table, [who], { from, to: new Date().getFullYear() });
    // OWID's "population" includes UN projections to 2100; a fact sheet shows
    // what happened, so it stops at the current year above.
    if (!series.length) continue;
    out.push({ ...s, points: series[0].points, url: d.meta.url });
    cites.push(d.meta.citation);
  }
  if (!out.length) return { props: {}, error: `Pas de données pour ${who}.` };
  return {
    props: {
      country: r.fr,
      metrics: out,
      source: { citation: cites.join(" ; "), url: "https://ourworldindata.org/", licence: "CC BY 4.0" },
    },
    table: [
      ["Indicateur", "Valeur", "Année"],
      ...out.map((m) => {
        const last = m.points[m.points.length - 1];
        return [m.label, `${last[1].toLocaleString("fr-FR")} ${m.unit}`, String(last[0])];
      }),
    ],
  };
}

async function vraiFaux(p: Record<string, string>): Promise<Enriched> {
  const props: Record<string, unknown> = {
    claim: p.affirmation ?? "",
    answer: (p.reponse ?? "").toLowerCase().startsWith("v") ? "vrai" : "faux",
    explanation: p.explication ?? "",
  };
  if (p.graphe) {
    const chart = await owidChart({ ...p, type: "courbe" });
    if (chart.props.series) props.chart = chart.props;
  }
  return { props };
}

async function classer(p: Record<string, string>): Promise<Enriched> {
  let items: { label: string; value: number }[] = [];
  let src: unknown = null;
  if (p.graphe) {
    const d = await loadOwid(p.graphe);
    if (!d) return { props: {}, error: `Données Our World in Data indisponibles (${p.graphe}).` };
    const year = num(p.annee);
    for (const name of list(p.pays)) {
      const { series } = pickSeries(d.table, [name], { to: year });
      const last = series[0]?.points.at(-1);
      if (last && (year == null || last[0] === year)) items.push({ label: series[0].name, value: last[1] });
    }
    src = source(d.meta);
  } else {
    // elements: Libellé = valeur ; Libellé = valeur
    items = list(p.elements).map((e) => {
      const [label, v] = e.split("=").map((x) => x.trim());
      return { label, value: Number((v ?? "").replace(/\s/g, "").replace(",", ".")) };
    });
  }
  items = items.filter((i) => i.label && Number.isFinite(i.value));
  if (items.length < 2) return { props: {}, error: "Pas assez d'éléments à classer." };
  return {
    props: {
      prompt: p.consigne ?? "Classe ces éléments dans l'ordre",
      order: p.ordre === "croissant" ? "asc" : "desc",
      unit: p.unite ?? "",
      year: num(p.annee),
      items,
      source: src,
    },
  };
}

function ipcProps() {
  return { ipc: IPC, first: IPC_FIRST, last: IPC_LAST, source: IPC_SOURCE };
}

async function ouverture(p: Record<string, string>): Promise<Enriched> {
  // Same UCI notation as the echiquier widget's `moves:` (e2e4 e7e5 …).
  const uci = (p.coups ?? p.moves ?? "").trim().split(/\s+/).filter(Boolean).join(" ");
  const pos = (
    lichess.positions as unknown as Record<string, { san: string; bands: Record<string, number[]>; next: [string, number][] }>
  )[uci];
  if (!pos) return { props: {}, error: `Pas de statistiques Lichess pour ${uci || "cette position"}.` };
  return {
    props: {
      title: p.titre ?? "",
      san: pos.san,
      bands: lichess.bands,
      stats: pos.bands,
      next: pos.next,
      source: { citation: lichess.source, url: "https://database.lichess.org/", licence: "CC0" },
    },
  };
}

async function ficheLangue(p: Record<string, string>): Promise<Enriched> {
  const lang = await loadLanguage(p.wikidata ?? "");
  if (!lang) return { props: {}, error: "Données Wikidata indisponibles." };
  return { props: { ...lang, title: p.titre ?? lang.label } };
}

/** Values of `key1:`, `key2:`… in number order (widgetProps keeps one value
 *  per key, so repeated rows are numbered in the vault). */
export function numbered(p: Record<string, string>, key: string): string[] {
  const re = new RegExp(`^${key}(\\d+)$`);
  return Object.entries(p)
    .map(([k, v]) => [re.exec(k)?.[1], v] as const)
    .filter((e): e is readonly [string, string] => e[0] != null && !!e[1])
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map((e) => e[1]);
}

/** Minimal pairs: `paireN: clip.mp3 = 买 mǎi · acheter | clip.mp3 = 卖 mài · vendre`.
 *  Clips are the note's own (note-relative or vault-relative paths), served
 *  from /vault like the inline pronunciation players. */
async function paires(p: Record<string, string>, ctx: WidgetContext): Promise<Enriched> {
  const pairs: { src: string; label: string }[][] = [];
  const missing: string[] = [];
  for (const row of numbered(p, "paire")) {
    const sides = row.split("|").map((side) => {
      const [path, ...label] = side.split("=");
      const src = resolveVaultAsset(path.trim(), ctx.dir);
      if (!src) missing.push(path.trim());
      return src ? { src, label: label.join("=").trim() } : null;
    });
    if (sides.length >= 2 && sides.every(Boolean)) pairs.push(sides as { src: string; label: string }[]);
  }
  if (missing.length) console.warn(`paires: clips introuvables (${ctx.dir}): ${missing.join(", ")}`);
  if (!pairs.length) return { props: {}, error: "Aucun clip audio trouvé pour ces paires." };
  return {
    props: { title: p.titre ?? "Quel mot entends-tu ?", hint: p.consigne ?? "", pairs },
    table: [["Paire", ""], ...pairs.map((q, i) => [String(i + 1), q.map((s) => s.label).join(" / ")])],
  };
}

/** The family tree of the languages, with the vault's language folders marked
 *  and linked: which ones the garden has is read from the folders at build. */
async function arbreLangues(): Promise<Enriched> {
  const have = getLanguageScopes().map((s) => ({ label: s.label, href: tagHref(s.label) }));
  return { props: { have } };
}

const ENRICH: Record<string, (p: Record<string, string>, ctx: WidgetContext) => Promise<Enriched>> = {
  paires,
  "arbre-langues": arbreLangues,
  owid: owidChart,
  "fiche-pays": fichePays,
  "vrai-faux": vraiFaux,
  classer,
  convertisseur: async (p) => ({
    props: { amount: num(p.montant) ?? 100, unit: p.monnaie ?? "AF", year: num(p.annee) ?? 1950, ...ipcProps() },
  }),
  interets: async (p) => ({
    props: { capital: num(p.capital) ?? 100, rate: num(p.taux) ?? 3, years: num(p.duree) ?? 30, ...ipcProps() },
  }),
  ouverture,
  "fiche-langue": ficheLangue,
};

/** Data for a data-pack widget, or null for a widget that needs none. */
export async function enrichWidget(
  name: string,
  props: Record<string, string>,
  ctx: WidgetContext = { dir: "" },
): Promise<Enriched | null> {
  const f = ENRICH[name];
  return f ? f(props, ctx) : null;
}

export { sig };
