# Setup R2 pour les assets binaires

Les fichiers binaires (PDF, images, .apkg, vidéos…) de `public/articles/pensine`
sont servis depuis Cloudflare R2 (`https://assets.nebula.li`), pas depuis le bundle
Cloudflare Pages (limite 25 MiB par asset).

## Pipeline

```
local repo (toutes les sources)
    │
    ├── git push ────────────────────► GitHub ──► Cloudflare Pages
    │                                              └─ strip-binaries-for-build.mjs supprime les binaires avant `next build`
    │
    └── ./scripts/sync-r2.sh ────────► R2 bucket pensine-assets
                                       └─ servi via assets.nebula.li
```

## Setup initial (à faire une fois)

### 1. Bucket R2

Dans Cloudflare Dashboard :
1. **R2** → **Create bucket** → nom `pensine-assets` → location `EEUR`
2. Ouvrir le bucket → **Settings** → **Custom Domains** → **Connect Domain** → `assets.nebula.li`
3. Attendre que le statut passe à `Active` (~1 min)

### 2. Token API R2

1. **R2** → **Manage R2 API Tokens** → **Create API Token**
2. Permissions : `Object Read & Write`
3. Bucket scope : `pensine-assets`
4. Copier l'**Access Key ID**, le **Secret Access Key** et l'**Endpoint S3** (forme : `https://<account_id>.r2.cloudflarestorage.com`)

### 3. Configurer rclone

```bash
sudo dnf install rclone
rclone config
```

Réponses :
- `n` (new remote)
- name : `r2`
- storage : `s3`
- provider : `Cloudflare`
- env_auth : `false`
- access_key_id : *coller*
- secret_access_key : *coller*
- region : `auto`
- endpoint : *coller l'endpoint S3*
- (laisser les autres champs par défaut)

Test :
```bash
rclone lsf r2-pensine:pensine-assets
```

### 4. Premier upload

```bash
cd /home/micro/Documents/projects/learn-nebula
./scripts/sync-r2.sh --dry-run    # vérifie ce qui va monter
./scripts/sync-r2.sh              # upload réel
```

### 5. Env var Cloudflare Pages

Dashboard Pages → projet `learn-nebula` → **Settings** → **Environment variables** :
- `NEXT_PUBLIC_R2_ASSETS_URL` = `https://assets.nebula.li`

(Si non défini, le code utilise déjà `https://assets.nebula.li` par défaut.)

## Workflow quotidien

Quand tu ajoutes un PDF/image au dossier `pensine` :

```bash
./scripts/sync-r2.sh    # upload sur R2
git add . && git commit -m "..."
git push                # déclenche le build Pages (qui strip les binaires)
```

## Cache & invalidation

Cloudflare CDN cache R2 par défaut. Si tu remplaces un fichier existant par un autre
contenu sous le même nom, l'ancien peut rester en cache jusqu'à 24h. Solutions :
- versionner le nom (`map-v2.jpg`)
- purger via Dashboard → Caching → Configuration → Purge by URL
