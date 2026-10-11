// Build-time data for the data-pack widgets (lib/widgets-extra.ts).
//
// rehypeWidgets (lib/markdown.ts) hands each data widget's `key: value` props
// here; what comes back is what the browser receives in data-props, plus an
// optional no-JS fallback (a table of the same numbers). The reader's browser
// never calls a third party: OWID and Wikidata are read during the build and
// cached on disk, the Insee price index and the Lichess counts are committed
// snapshots refreshed by scripts/update-ipc.mjs and scripts/update-lichess.py.
import { loadOwid, pickSeries, sig, type Series } from "./owid";
import { resolveCountry } from "./countries";
import { IPC, IPC_FIRST, IPC_LAST, IPC_SOURCE } from "./prix";
import lichess from "./data/lichess-openings.json";
import { loadLanguage } from "./wikidata";

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
  const data = await loadOwid(slug);
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
    return {
      props: {
        type,
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

const ENRICH: Record<string, (p: Record<string, string>) => Promise<Enriched>> = {
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
export async function enrichWidget(name: string, props: Record<string, string>): Promise<Enriched | null> {
  const f = ENRICH[name];
  return f ? f(props) : null;
}

export { sig };
