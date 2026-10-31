---
title: "Sécurité Docker"
domain: "Applied Sciences"
subdomain: "Computer Science > DevSecOps > Docker"
tags: [sciences-appliquées, informatique, devsecops, docker]
date: "2026-02-25"
prerequis: ["[[Docker]]"]
---

# Sécurité Docker

Un container Docker mal configuré peut compromettre l'hôte entier. La sécurité Docker s'articule autour de quatre axes : les images, la configuration runtime, les secrets, et le réseau.

## Sécurité des images

### Images de base minimales

```dockerfile
# Mauvais : image complète avec shell, outils, surfaces d'attaque
FROM python:3.12

# Mieux : image slim (sans outils inutiles)
FROM python:3.12-slim

# Optimal : distroless (pas de shell, pas de package manager)
FROM gcr.io/distroless/python3-debian12

# Alpine (très petit, mais musl libc — attention aux incompatibilités)
FROM python:3.12-alpine
```

> [!warning] Piège Alpine
> Alpine utilise musl libc au lieu de glibc — certains paquets Python/Node avec des dépendances natives compilées échouent à l'installation ou se comportent différemment (résolution DNS notamment). Distroless évite ce piège tout en gardant une surface d'attaque minimale, au prix d'un débogage plus difficile (pas de shell).

### Dockerfile sécurisé

```dockerfile
# Épingler par digest SHA256 (tag mutable peut être modifié)
FROM python:3.12-slim@sha256:abc123def456...

# Métadonnées de traçabilité
LABEL maintainer="team@company.com" \
      version="1.0" \
      org.opencontainers.image.source="https://github.com/org/repo"

# Mettre à jour les paquets et supprimer le cache en une seule couche
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
       libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Créer un utilisateur non-root
RUN groupadd -r appuser && useradd -r -g appuser -u 1000 appuser

WORKDIR /app

# Copier d'abord les dépendances (meilleure utilisation du cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copier le code source
COPY --chown=appuser:appuser . .

# Passer à l'utilisateur non-root
USER appuser

# Ne pas exposer de port root (<1024)
EXPOSE 8080

# Utiliser exec form pour les signaux Unix
ENTRYPOINT ["python", "-m", "uvicorn"]
CMD ["main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### Analyse avec hadolint

```bash
# Linter de Dockerfile
hadolint Dockerfile

# Dans CI (GitLab)
hadolint_check:
  image: hadolint/hadolint
  script:
    - hadolint Dockerfile
```

Règles importantes :
- `DL3008` : épingler les versions de paquets apt
- `DL3025` : utiliser exec form pour CMD
- `DL4006` : utiliser `set -o pipefail` dans les RUN

## Scan de vulnérabilités

```bash
# Trivy — scanner de CVEs le plus utilisé
trivy image python:3.12-slim
trivy image --severity CRITICAL,HIGH monapp:latest

# Format JSON pour intégration CI
trivy image --format json --output trivy.json monapp:latest

# Scan du Dockerfile (mauvaises configurations)
trivy config Dockerfile

# Grype (Anchore)
grype monapp:latest
grype --fail-on high monapp:latest   # retourne exit code 1 si HIGH+
```

## Configuration runtime sécurisée

### docker run sécurisé

```bash
# Mauvais : container avec trop de privilèges
docker run -it --privileged -v /:/host ubuntu bash

# Bon : limiter au strict nécessaire
docker run \
  --read-only \                          # filesystem en lecture seule
  --tmpfs /tmp:rw,noexec,nosuid \       # /tmp en mémoire (rw mais pas exec)
  --user 1000:1000 \                     # user non-root
  --cap-drop ALL \                       # supprimer toutes les capabilities
  --cap-add NET_BIND_SERVICE \           # n'ajouter que ce qui est nécessaire
  --security-opt no-new-privileges \    # empêcher escalade de privilèges
  --security-opt seccomp=seccomp.json \ # profil seccomp personnalisé
  --pids-limit 100 \                     # limiter le fork bombing
  --memory 512m \                        # limiter la mémoire
  --cpu-shares 512 \                     # limiter le CPU
  --network app-network \               # réseau dédié, pas de réseau host
  monapp:latest
```

### Linux Capabilities

Les capabilities décomposent les privilèges root en unités granulaires.

| Capability | Risque | Usage légitime |
|---|---|---|
| `SYS_ADMIN` | Critique (quasi-root) | Très rare |
| `NET_ADMIN` | Élevé | Outils réseau |
| `SYS_PTRACE` | Élevé | Débogage |
| `NET_BIND_SERVICE` | Faible | Écouter sur un port < 1024 |
| `CHOWN` | Moyen | Changer les propriétaires de fichiers |

```bash
# Vérifier les capabilities d'un container en cours
docker inspect <id> | jq '.[0].HostConfig.CapAdd, .[0].HostConfig.CapDrop'
```

> [!tip] Méthode
> Partir de `--cap-drop ALL` puis n'ajouter que les capabilities réellement nécessaires (`--cap-add`), plutôt que de partir des capabilities par défaut de Docker (déjà restreintes par rapport à root, mais encore trop larges pour la plupart des applications).

### Profils seccomp

Seccomp filtre les appels système disponibles pour le container.

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "syscalls": [
    {
      "names": ["read", "write", "open", "close", "stat", "fstat",
                "mmap", "mprotect", "munmap", "brk", "rt_sigaction",
                "rt_sigprocmask", "ioctl", "access", "pipe", "select",
                "sched_yield", "mremap", "msync", "mincore", "madvise",
                "dup", "dup2", "pause", "nanosleep", "getitimer",
                "alarm", "setitimer", "getpid", "socket", "connect",
                "accept", "sendto", "recvfrom", "sendmsg", "recvmsg",
                "shutdown", "bind", "listen", "getsockname",
                "getpeername", "socketpair", "setsockopt", "getsockopt",
                "clone", "fork", "vfork", "execve", "exit", "wait4",
                "kill", "uname", "getuid", "getgid", "setuid", "setgid",
                "exit_group", "futex", "set_tid_address"],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
```

```bash
docker run --security-opt seccomp=seccomp.json monapp:latest
```

## Gestion des secrets

### Ce qu'il ne faut pas faire

> [!warning] Pourquoi ENV/ARG ne protègent rien
> Une valeur passée par `ENV` ou `ARG` reste lisible en clair par `docker history` ou `docker inspect`, même après le build — elle fait partie des métadonnées de l'image, pas seulement de son exécution. Ce n'est pas une question de "où on regarde" mais un principe : ces mécanismes n'ont jamais été conçus pour des secrets.

```dockerfile
# NE JAMAIS mettre des secrets dans le Dockerfile
ENV DB_PASSWORD=motdepasse123           # visible dans les layers
ARG API_KEY=secret                       # visible dans l'historique de build

# NE JAMAIS mettre des secrets dans les variables d'env docker-compose
environment:
  - DB_PASSWORD=motdepasse123           # visible dans docker inspect
```

### Docker Secrets (Swarm)

```bash
# Créer un secret
echo "motdepasse123" | docker secret create db_password -

# Utiliser dans un service Swarm
docker service create \
  --secret db_password \
  monapp:latest
# Monté à /run/secrets/db_password (fichier, non en env)
```

### BuildKit et secrets de build

```dockerfile
# Monter un secret au moment du build sans le laisser dans les layers
RUN --mount=type=secret,id=pip_token \
    pip install --index-url https://$(cat /run/secrets/pip_token)@pypi.company.com/simple/ monpaquetprive
```

```bash
docker build --secret id=pip_token,src=./token.txt .
```

### Approche recommandée en production

```yaml
# Docker Compose — injecter depuis les variables d'environnement de l'hôte
# (peuplées depuis un vault comme HashiCorp Vault ou AWS Secrets Manager)
services:
  app:
    image: monapp:latest
    environment:
      DB_PASSWORD: ${DB_PASSWORD}   # depuis le shell, pas dans le fichier
    secrets:
      - db_password

secrets:
  db_password:
    external: true
```

## Réseau Docker sécurisé

```bash
# Isoler les services dans des réseaux dédiés
docker network create --driver bridge frontend-net
docker network create --driver bridge backend-net

# Le frontend accède uniquement au réseau frontend
docker run --network frontend-net nginx

# L'app accède aux deux réseaux
docker run --network frontend-net --network backend-net app

# La DB n'est accessible que depuis le réseau backend
docker run --network backend-net postgres

# Ne jamais utiliser --network host en production
# (expose tous les ports de l'hôte au container)
```

```yaml
# docker-compose.yml avec isolation réseau
services:
  nginx:
    networks: [frontend]
  app:
    networks: [frontend, backend]
  db:
    networks: [backend]

networks:
  frontend:
  backend:
    internal: true   # pas d'accès internet pour le réseau backend
```

## Audit et monitoring

```bash
# Docker Bench for Security — audit CIS Docker Benchmark
docker run --rm --net host --pid host --userns host --cap-add audit_control \
    -v /etc:/etc:ro -v /lib/systemd:/lib/systemd:ro \
    -v /usr/bin/containerd:/usr/bin/containerd:ro \
    -v /usr/bin/runc:/usr/bin/runc:ro \
    -v /usr/lib/systemd:/usr/lib/systemd:ro \
    -v /var/lib:/var/lib:ro -v /var/run/docker.sock:/var/run/docker.sock:ro \
    docker/docker-bench-security

# Falco — détection comportementale en temps réel
# Règle Falco : détecter un shell dans un container
# (un container de prod ne devrait jamais ouvrir un shell interactif)
- rule: Terminal Shell in Container
  desc: A shell was used as the entrypoint/exec point into a container
  condition: >
    spawned_process and container
    and shell_procs and proc.tty != 0
    and container_entrypoint
  output: >
    A shell was spawned in a container with an attached terminal
    (user=%user.name container=%container.name image=%container.image.repository)
  priority: NOTICE
```

## Checklist sécurité Docker

| Domaine | Vérification |
|---|---|
| Image | Image de base minimale, paquets à jour, pas de credentials |
| Utilisateur | Processus non-root (USER != root) |
| Filesystem | `--read-only`, tmpfs pour /tmp |
| Capabilities | `--cap-drop ALL`, add uniquement le strict nécessaire |
| Réseau | Réseaux dédiés, pas de `--network host` |
| Ressources | Limites mémoire/CPU/pids |
| Secrets | Pas d'env vars, utiliser secrets ou volumes |
| Image registry | Images signées (Cosign), registre privé authentifié |
| Scan | Trivy ou Grype dans le pipeline CI |
| Runtime | Falco pour la détection comportementale |
