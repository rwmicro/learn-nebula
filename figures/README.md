# Figures isométriques

Des figures « machine » interactives qu'une note embarque avec un bloc :

````
```iso:voute-gothique
```
````

Chaque figure explique une idée en construisant l'objet qui la fait (une voûte et son arc-boutant, une machine à vapeur, une nappe captive), dessiné en isométrique, avec une lecture en direct qui vient du même modèle que le mouvement.

## Provenance

`kit/` est le kit de dessin d'[Anatomy](https://github.com/wheresryan22/anatomy) (licence MIT, © 2026 Ryan, `kit/LICENSE`), copié tel quel au commit `689dcf9` : `iso-kit.mjs` (caméra, solides, carte), `lathe.mjs` (pièces tournées, prismes sur tout axe), `tube.mjs` (tuyaux et câbles) et `iso.css`. On ne le modifie pas ici : une mise à jour, c'est une nouvelle copie.

Les règles de dessin (une seule pièce accentuée, des traits qui finissent sur quelque chose, pas de texte dans le dessin, une lecture vraie) sont celles du `SKILL.md` d'Anatomy et de ses `references/craft.md` et `verify.md`.

## Contrat d'une figure

`figures/<nom>/figure.mjs` exporte :

- `title` : le titre court de la figure ;
- `render()` qui renvoie `{ plate, live }` :
  - `plate` : le HTML de la carte, fait avec `k.plateHtml({ fig, title, hint, readout, keys, caption, body })`, où `body` contient `<div class="iso-stage" tabindex="0" …>${svg}</div>` ;
  - `live` : le **corps** d'une fonction `mount(root)`, en texte. `root` est l'élément qui contient la carte : on y cherche tout avec `root.querySelector(…)`, jamais `document.querySelector`. Toutes les fonctions du kit (`translateAlong`, `lineOnTop`, `iso`…) y sont en portée.

Un `model.mjs` pur à côté porte les chiffres vrais ; `figure.mjs` l'importe pour l'image de départ et injecte son source dans `live` (voir `voute-gothique/`).

Le texte affiché (titre, consigne, lecture, légende, `label` de l'SVG) est en **français**. La légende dit d'où viennent les chiffres et ce que le modèle simplifie.

## Construire, prévisualiser, vérifier

```bash
node scripts/build-figures.mjs                      # toutes → public/figures/ (fait au build)
node scripts/build-figures.mjs --preview <nom>      # + figures/<nom>/preview.html et preview-light.html
```

Les pages de prévisualisation sont autonomes : on les vérifie avec les scripts d'Anatomy (`scripts/capture.mjs`, `scripts/lines.mjs`, `scripts/drive.mjs` de son dépôt). Le contrôle des traits doit finir sur `line ends: 0`, en clair et en sombre.

## Sur le site

`rehypeIsoFigures` (`lib/markdown.ts`) remplace le bloc par la carte de `public/figures/<nom>.html`, dans un `<div class="iso iso-mount">` : le dessin est dans la page dès le premier affichage. `public/js/iso-figures.js` (dans le bundle des notes) aligne le thème de la figure sur celui du site, puis importe `/figures/<nom>.js` et appelle `mount`. Un nom inconnu ou une figure qui n'a pas pu être construite laisse une ligne de repli.
