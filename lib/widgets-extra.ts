// The widget packs added after public/js/widgets.js: data figures (Our World
// in Data, Insee, Lichess, Wikidata), sciences, languages and security. Same vault
// syntax as the older widgets (```widget:<name> + `key: value` lines), same
// mount point (rehypeWidgets in lib/markdown.ts), but each pack is its own
// bundle, fetched by public/js/widgets-loader.js only when the page has one
// of its widgets.

export type WidgetPack = "data" | "sci" | "lang" | "cyber" | "calcul";

export const EXTRA_WIDGETS: Record<string, { pack: WidgetPack; fallback: string }> = {
  // --- data: build-time data from OWID / Insee / Lichess / Wikidata
  owid: { pack: "data", fallback: "Graphique Our World in Data (nécessite JavaScript)." },
  "fiche-pays": { pack: "data", fallback: "Fiche du pays en chiffres (nécessite JavaScript)." },
  "vrai-faux": { pack: "data", fallback: "Vrai ou faux, corrigé par les données (nécessite JavaScript)." },
  classer: { pack: "data", fallback: "Classer des éléments dans l'ordre (nécessite JavaScript)." },
  convertisseur: { pack: "data", fallback: "Convertisseur franc-euro à pouvoir d'achat égal (nécessite JavaScript)." },
  interets: { pack: "data", fallback: "Intérêts composés face à l'inflation (nécessite JavaScript)." },
  ouverture: { pack: "data", fallback: "Statistiques de l'ouverture sur Lichess (nécessite JavaScript)." },
  "fiche-langue": { pack: "data", fallback: "Fiche de la langue d'après Wikidata (nécessite JavaScript)." },
  partie: { pack: "data", fallback: "Partie d'échecs à rejouer coup par coup (nécessite JavaScript)." },
  durees: { pack: "data", fallback: "Durées comparées sur une frise (nécessite JavaScript)." },

  // --- sciences
  supercompensation: { pack: "sci", fallback: "Charge d'entraînement et supercompensation (nécessite JavaScript)." },
  "circuit-rc": { pack: "sci", fallback: "Charge et décharge d'un circuit RC (nécessite JavaScript)." },
  "lotka-volterra": { pack: "sci", fallback: "Modèle proies-prédateurs de Lotka-Volterra (nécessite JavaScript)." },
  datation: { pack: "sci", fallback: "Désintégration radioactive et datation (nécessite JavaScript)." },
  ancrage: { pack: "sci", fallback: "Expérience sur le biais d'ancrage (nécessite JavaScript)." },
  syllogisme: { pack: "sci", fallback: "Validité d'un syllogisme en diagrammes de Venn (nécessite JavaScript)." },
  "xss-dom": { pack: "sci", fallback: "innerHTML face à textContent, démonstration XSS sans risque (nécessite JavaScript)." },
  "rotation-cultures": { pack: "sci", fallback: "Rotation des cultures et azote du sol (nécessite JavaScript)." },
  "tableau-periodique": { pack: "sci", fallback: "Tableau périodique interactif (nécessite JavaScript)." },
  "descente-gradient": { pack: "sci", fallback: "Descente de gradient sur une régression linéaire (nécessite JavaScript)." },
  frontiere: { pack: "sci", fallback: "Frontière de décision d'un perceptron ou d'une régression logistique (nécessite JavaScript)." },
  tri: { pack: "sci", fallback: "Algorithme de tri pas à pas (nécessite JavaScript)." },
  "graphe-parcours": { pack: "sci", fallback: "Parcours en largeur, en profondeur et Dijkstra sur un graphe (nécessite JavaScript)." },
  "jointures-sql": { pack: "sci", fallback: "Jointures SQL sur deux petites tables (nécessite JavaScript)." },
  "cercle-trigo": { pack: "sci", fallback: "Cercle trigonométrique interactif (nécessite JavaScript)." },
  ordonner: { pack: "sci", fallback: "Exercice : remettre une liste dans l'ordre (nécessite JavaScript)." },
  associer: { pack: "sci", fallback: "Exercice : associer deux colonnes (nécessite JavaScript)." },

  // --- langues
  "affixes-indonesiens": { pack: "lang", fallback: "Affixes de l'indonésien et du malais (nécessite JavaScript)." },
  "trois-arabes": { pack: "lang", fallback: "Une phrase en arabe littéraire, libanais et darija (nécessite JavaScript)." },
  agglutination: { pack: "lang", fallback: "Construction d'un mot turc ou azéri, suffixe par suffixe (nécessite JavaScript)." },
  "lettres-arabes": { pack: "lang", fallback: "Formes des lettres arabes selon leur position (nécessite JavaScript)." },
  ecritures: { pack: "lang", fallback: "Un mot dans plusieurs écritures (nécessite JavaScript)." },
  "meme-mot": { pack: "lang", fallback: "Un même mot dans les langues du jardin (nécessite JavaScript)." },
  "cas-allemands": { pack: "lang", fallback: "Déclinaison de l'article allemand (nécessite JavaScript)." },
  "etymologie-tok-pisin": { pack: "lang", fallback: "Origine des mots du tok pisin (nécessite JavaScript)." },
  "couverture-mots": { pack: "lang", fallback: "Part d'un texte couverte par les mots les plus fréquents (nécessite JavaScript)." },
  paires: { pack: "lang", fallback: "Paires minimales à écouter (nécessite JavaScript)." },
  "arbre-langues": { pack: "lang", fallback: "Arbre des familles de langues du jardin (nécessite JavaScript)." },
  conjugaison: { pack: "lang", fallback: "Conjugaison d'un verbe, terminaisons en couleur (nécessite JavaScript)." },
  "faux-amis": { pack: "lang", fallback: "Quiz de faux amis (nécessite JavaScript)." },
  // --- cyber: networks, web and Active Directory security (models in lib/cyber.ts)
  echange: { pack: "cyber", fallback: "Échange d'un protocole, message par message (nécessite JavaScript)." },
  "pare-feu": { pack: "cyber", fallback: "Un paquet face à une chaîne de règles de pare-feu (nécessite JavaScript)." },
  cors: { pack: "cyber", fallback: "Simulateur CORS : en-têtes échangés et réponse lisible ou non (nécessite JavaScript)." },
  nat: { pack: "cyber", fallback: "Table de traduction NAT/PAT d'un routeur (nécessite JavaScript)." },
  "tunnel-ssh": { pack: "cyber", fallback: "Tunnels SSH -L, -R et -D sur un même réseau (nécessite JavaScript)." },
  jwt: { pack: "cyber", fallback: "Atelier JWT : signature, alg none et secret faible (nécessite JavaScript)." },
  "chemin-ad": { pack: "cyber", fallback: "Chemin d'attaque Active Directory, à la BloodHound (nécessite JavaScript)." },
  "kill-chain": { pack: "cyber", fallback: "Chaîne d'une attaque et défenses qui la bloquent ou la voient (nécessite JavaScript)." },
  cassage: { pack: "cyber", fallback: "Temps de cassage d'un mot de passe selon le hachage (nécessite JavaScript)." },
  // --- calcul: arithmetic of public-key crypto and of LLMs (models in lib/calcul.ts)
  "puissances-mod": { pack: "calcul", fallback: "Puissances modulaires sur une horloge, ordre et logarithme discret (nécessite JavaScript)." },
  rsa: { pack: "calcul", fallback: "RSA pas à pas sur de petits nombres premiers (nécessite JavaScript)." },
  "courbe-elliptique": { pack: "calcul", fallback: "Addition de points sur une courbe elliptique, réelle ou sur un corps fini (nécessite JavaScript)." },
  anniversaire: { pack: "calcul", fallback: "Paradoxe des anniversaires et collisions de hachage (nécessite JavaScript)." },
  "moe-routeur": { pack: "calcul", fallback: "Routage d'un mélange d'experts et équilibrage de la charge (nécessite JavaScript)." },
  "memoire-llm": { pack: "calcul", fallback: "Mémoire d'un LLM : poids, cache KV et fine-tuning (nécessite JavaScript)." },
};

/** Bundle file a pack ships in (scripts/bundle-js.mjs builds them). */
export const PACK_BUNDLE: Record<WidgetPack, string> = {
  data: "/js/widgets-data.bundle.js",
  sci: "/js/widgets-sci.bundle.js",
  lang: "/js/widgets-lang.bundle.js",
  cyber: "/js/widgets-cyber.bundle.js",
  calcul: "/js/widgets-calcul.bundle.js",
};
