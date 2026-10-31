import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/design.css";

// The design system at a glance: every shared token (assets/css/global.css)
// drawn with its name, and the shared pieces built from them. Owner-only like
// the rest of /admin/ (not linked, not indexed); static, no data.

export const metadata: Metadata = {
  title: `Design system · ${SITE_TITLE}`,
  robots: { index: false, follow: false },
};

const COLORS: [string, string][] = [
  ["--paper", "Fond de page"],
  ["--paper-raised", "Surface levée"],
  ["--wash", "Remplissage léger"],
  ["--wash-2", "Survol, pastilles"],
  ["--ink", "Texte"],
  ["--ink-2", "Texte secondaire"],
  ["--muted", "Discret"],
  ["--faint", "Très discret"],
  ["--rule", "Filet"],
  ["--rule-strong", "Filet appuyé"],
  ["--link", "Lien"],
  ["--garden", "Action (vert du jardin)"],
  ["--garden-wash", "Fond d'action"],
  ["--danger", "Erreur"],
  ["--warn", "Avertissement"],
  ["--mark", "Surlignage"],
];

const FAMILIES = ["sciences", "informatique", "vivant", "pensee", "societe", "arts", "langues", "jeux"];

const FONTS: [string, string, string][] = [
  ["--font-text", "Texte des notes, titres", "Le jardin pousse une note à la fois."],
  ["--font-ui", "Interface : boutons, menus, métadonnées", "Commencer un parcours · 12 min"],
  ["--font-caps", "Petites capitales, surtitres", "Sciences › Mathématiques"],
];

const MEASURES: [string, string][] = [
  ["--measure-narrow", "Duel"],
  ["--measure-text", "Frise, Jardin, Données, Progression, Thèmes"],
  ["--measure-page", "Carte, Échecs, pages d'app, index des parcours"],
  ["--measure-wide", "Index des thèmes"],
];

const SIZES: [string, string][] = [
  ["--btn-h", "Bouton principal"],
  ["--btn-h-sm", "Bouton dans une carte, le chat"],
  ["--chip-h", "Pastille de filtre"],
  ["--sheet-radius", "Coins d'une feuille du bas"],
  ["--sheet-max-h", "Hauteur maximale d'une feuille"],
];

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="ds-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {note && <p className="ds-note">{note}</p>}
      {children}
    </section>
  );
}

export default function DesignPage() {
  return (
    <main className="ds">
      <PageHeader
        name="ds"
        kicker="Administration"
        title="Design system"
        intro="Les jetons partagés (assets/css/global.css) et les pièces construites avec. Une valeur se change là, une seule fois."
      />

      <Section id="ds-colors" title="Couleurs" note="Elles suivent le thème : bascule clair / sombre pour comparer.">
        <ul className="ds-swatches">
          {COLORS.map(([v, label]) => (
            <li key={v}>
              <span className="ds-swatch" style={{ background: `var(${v})` }} />
              <code>{v}</code>
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="ds-families" title="Familles" note="[data-family] donne --fam (et --on-fam) à tout ce qu'il contient.">
        <ul className="ds-families">
          {FAMILIES.map((f) => (
            <li key={f} data-family={f}>
              <span className="ds-fam" />
              <code>{f}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="ds-type" title="Typographie">
        <dl className="ds-fonts">
          {FONTS.map(([v, label, sample]) => (
            <div key={v}>
              <dt>
                <code>{v}</code> {label}
              </dt>
              <dd style={{ fontFamily: `var(${v})` }}>{sample}</dd>
            </div>
          ))}
        </dl>
        <p className="ds-title-sample">Titre de page</p>
        <p className="ds-note">
          <code>--title-page</code> et <code>--title-page-tracking</code>, via <code>.page-title</code> (composant{" "}
          <code>PageHeader</code>).
        </p>
      </Section>

      <Section id="ds-measures" title="Largeurs" note="La colonne d'une page : choisir une des quatre, jamais une valeur en dur.">
        <ul className="ds-measures">
          {MEASURES.map(([v, label]) => (
            <li key={v}>
              <span className="ds-bar" style={{ width: `min(100%, var(${v}))` }} />
              <code>{v}</code> {label}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="ds-pieces" title="Pièces partagées" note="Seuil téléphone : max-width 639.98px / min-width 640px.">
        <h3>Boutons</h3>
        <div className="ds-row">
          <span className="ds-btn">Commencer un parcours</span>
          <span className="ds-btn ds-btn--sm">Réviser</span>
        </div>
        <h3>Pastilles</h3>
        <div className="ds-row">
          <span className="ds-chip is-on">Tous 4</span>
          <span className="ds-chip">Sciences 1</span>
          <span className="ds-chip">Informatique 1</span>
        </div>
        <h3>Feuille du bas</h3>
        <div className="ds-sheet-stage">
          <div className="ds-sheet">
            <div className="na-grab" aria-hidden="true" />
            <strong>Affichage</strong>
            <p>Poignée, coins, ombre et voile : --sheet-*.</p>
          </div>
        </div>
        <h3>Dimensions</h3>
        <ul className="ds-sizes">
          {SIZES.map(([v, label]) => (
            <li key={v}>
              <code>{v}</code> {label}
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
