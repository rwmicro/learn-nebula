# Mise en production — checklist

Ce qu'il reste à faire pour un déploiement complet sur Cloudflare Pages
(projet `the-gardener`). L'app statique se déploie sans rien ; les points
ci-dessous concernent les **Functions** `/api/*` (assistant RAG, commentaires,
traduction) et la sécurité.

## 🔴 Bloquants

1. **Merger `branche-B` → `main`.** Rien n'est actif avant : la CI et le déploiement
   ne se déclenchent que sur `main`. Le merge supprime aussi le `package-lock.json`
   npm périmé → les alertes Dependabot (23) tombent (lockfile pnpm à jour + override postcss).

2. **Secrets Pages** (`wrangler pages secret put <NAME>` ou dashboard) :
   - `ANTHROPIC_API_KEY` — assistant `/api/ask` **et** traduction `/api/translate`.
   - `TURNSTILE_SECRET_KEY` — siteverify des commentaires.
   - `COMMENTS_ADMIN_TOKEN` — Bearer pour la modération (GET pending / PATCH).

3. **Variables de build Pages** (Settings → Environment variables, *Production*) :
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — **sans elle, le widget Turnstile n'est pas rendu**,
     et comme un token valide est désormais requis dès que `TURNSTILE_SECRET_KEY` est posé,
     **tous les commentaires seraient rejetés (403)**. Poser les deux ensemble.
   - `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (scopes *Workers AI: Run* + *Vectorize: Edit*)
     — pour que `scripts/index-notes.mjs` peuple l'index au build. Sans elles, le build
     réussit mais l'assistant n'a rien à récupérer.

4. **D1 — commentaires :**
   ```bash
   wrangler d1 create garden-comments        # copier le database_id retourné
   # → remplacer REPLACE_WITH_DATABASE_ID dans wrangler.toml
   wrangler d1 execute garden-comments --remote --file=./schema/comments.sql
   ```

5. **Vectorize + Workers AI — assistant RAG :**
   ```bash
   wrangler vectorize create garden-notes --dimensions=1024 --metric=cosine
   ```
   Les bindings `AI` et `VECTORIZE` sont déjà déclarés dans `wrangler.toml`.
   L'index est peuplé au build (voir point 3).

6. **Choisir le chemin de déploiement :**
   - Build Git natif Cloudflare Pages (le plus simple), **ou**
   - GitHub Actions `deploy.yml` : repo variable `ENABLE_CF_DEPLOY=true` + secrets
     `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` (+ `NOTES_REPO_TOKEN` si le repo
     de notes devient privé). Il ne se déclenche qu'après le succès de la CI sur `main`.

## 🟠 Recommandé avant ouverture publique

7. **Règle WAF rate-limit** sur `/api/ask` et `/api/translate`. Le cooldown Cache-API
   en code est best-effort (par datacentre) — le plafond **dur** contre l'abus de tokens
   doit venir d'une règle Cloudflare.

8. **Vérifier le bundle de `/api/translate`.** Il embarque le pipeline de rendu
   (shiki + katex + parse5) → faire un premier déploiement et confirmer qu'il passe la
   limite Pages Functions (3 MiB compressé en gratuit, 10 MiB sinon). Sinon : déplacer
   le rendu hors de la Function (retour Markdown + rendu client).

9. **`LLM_BASE_URL` doit rester non défini en prod** (variable *dev-only* pour LM Studio ;
   si posée, elle route la génération vers un serveur local inexistant). Voir `.dev.vars.example`.

## 🟡 À vérifier

- **Headers de sécurité** : `public/_headers` sert la CSP en vrais headers (voir `SECURITY.md`) —
  confirmer qu'ils sont bien appliqués après déploiement.
- **Turnstile** : widget rendu, challenge OK, commentaire approuvé vs pending conforme.
- **Tests e2e Playwright** (`scripts/test.sh`) : lancés localement, pas dans la CI.

## ✅ Déjà en place

- **CI** : typecheck (app + Functions), lint, **61 tests unitaires**, build statique complet.
- **Sécurité API** : SQL paramétré, entrées plafonnées, rate-limit best-effort, Turnstile
  requis, compare admin à temps constant, `pnpm audit` propre, dégradation gracieuse si
  secrets/bindings absents.
- **Diagrammes** : fallback Mermaid côté client (rend les flowcharts même si le pré-rendu
  build sans Chromium a été sauté).
- **Dev** : mode LM Studio (`wrangler pages dev out` + `.dev.vars`) pour le chat + la
  traduction sans clé Anthropic ni bindings.
