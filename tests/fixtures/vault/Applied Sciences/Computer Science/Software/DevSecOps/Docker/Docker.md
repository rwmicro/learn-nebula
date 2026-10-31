---
title: "Docker"
domain: "Applied Sciences"
subdomain: "Computer Science > DevSecOps > Docker"
tags: [sciences-appliquées, informatique, devsecops, docker]
date: "2026-02-04"
parcours: "DevSecOps : conteneurs, CI/CD et sécurité"
parcours-description: "De Docker à Kubernetes et à leur sécurisation, puis GitLab CI/CD et le pipeline DevSecOps."
---

# Docker

## Vue d'ensemble

Docker est une plateforme de conteneurisation qui permet d'empaqueter des applications et leurs dépendances dans des conteneurs isolés, portables et légers.

> [!important] Idée clé
> Un conteneur n'est pas une VM allégée : il ne virtualise pas le matériel, il **partage le kernel de l'hôte** et isole le processus par des mécanismes du kernel Linux (namespaces, cgroups). C'est ce qui explique à la fois sa légèreté (pas d'OS à démarrer) et sa limite (un conteneur Linux ne peut pas faire tourner un kernel Windows).

## Concepts fondamentaux

### Conteneurs vs Machines Virtuelles

**Conteneurs**
- Partagent le kernel de l'OS hôte
- Légers (MB)
- Démarrage en secondes
- Isolation au niveau processus

**VMs**
- OS complet pour chaque VM
- Lourds (GB)
- Démarrage en minutes
- Isolation au niveau hardware

### Composants principaux

**Docker Engine**
- Daemon (dockerd)
- REST API
- CLI (docker)

**Images**
- Template en lecture seule
- Layers empilés
- Réutilisables

**Conteneurs**
- Instance exécutable d'une image
- Layer en écriture
- Éphémères

**Registry**
- Docker Hub (public)
- Registries privés
- Stockage d'images

## Commandes essentielles

### Images

```bash
# Télécharger une image
docker pull nginx:latest

# Lister les images
docker images

# Construire une image
docker build -t mon-app:v1 .

# Supprimer une image
docker rmi image-name

# Nettoyer images inutilisées
docker image prune
```

### Conteneurs

```bash
# Lancer un conteneur
docker run -d -p 80:80 --name webserver nginx

# Lister conteneurs actifs
docker ps

# Lister tous les conteneurs
docker ps -a

# Arrêter un conteneur
docker stop webserver

# Démarrer un conteneur
docker start webserver

# Supprimer un conteneur
docker rm webserver

# Logs d'un conteneur
docker logs webserver

# Shell interactif
docker exec -it webserver /bin/bash
```

### Réseau

```bash
# Lister les réseaux
docker network ls

# Créer un réseau
docker network create mon-reseau

# Connecter un conteneur
docker network connect mon-reseau conteneur
```

### Volumes

```bash
# Créer un volume
docker volume create mon-volume

# Lister les volumes
docker volume ls

# Utiliser un volume
docker run -v mon-volume:/data nginx
```

## Dockerfile

### Exemple de base

```dockerfile
# Image de base
FROM node:18-alpine

# Répertoire de travail
WORKDIR /app

# Copier package.json
COPY package*.json ./

# Installer dépendances
RUN npm ci --only=production

# Copier le code source
COPY . .

# Exposer le port
EXPOSE 3000

# Utilisateur non-root
USER node

# Commande de démarrage
CMD ["node", "server.js"]
```

### Instructions principales

**FROM** - Image de base
**WORKDIR** - Définir le répertoire de travail
**COPY** - Copier fichiers de l'hôte vers l'image
**ADD** - Comme COPY mais avec extraction archives
**RUN** - Exécuter commande pendant build
**CMD** - Commande par défaut au démarrage
**ENTRYPOINT** - Point d'entrée principal
**EXPOSE** - Déclarer les ports
**ENV** - Variables d'environnement
**ARG** - Arguments de build
**VOLUME** - Point de montage

### Multi-stage builds

```dockerfile
# Stage de build
FROM node:18 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage de production
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN npm ci --only=production
CMD ["node", "dist/server.js"]
```

## Docker Compose

### docker-compose.yml

```yaml
version: '3.8'

services:
  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    depends_on:
      - db
    volumes:
      - ./src:/app/src
    networks:
      - app-network

  db:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: mydb
    volumes:
      - db-data:/var/lib/postgresql/data
    networks:
      - app-network

volumes:
  db-data:

networks:
  app-network:
```

### Commandes Compose

```bash
# Démarrer tous les services
docker-compose up -d

# Arrêter tous les services
docker-compose down

# Voir les logs
docker-compose logs -f

# Rebuild les images
docker-compose build

# Lister les services
docker-compose ps
```

## Best Practices

### Sécurité

1. **Ne pas utiliser root**
   ```dockerfile
   USER node
   ```

> [!warning] Pourquoi c'est important
> Un processus root dans le conteneur n'est isolé du root de l'hôte que par les namespaces — une faille de conteneur à hôte (container breakout) donne alors directement les pleins pouvoirs sur la machine hôte. Avec un utilisateur non-root, la même faille limite l'attaquant aux droits de cet utilisateur, même après l'évasion.

2. **Scanner les vulnérabilités**
   ```bash
   docker scan mon-image
   ```

3. **Images minimales**
   - Utiliser Alpine Linux
   - Multi-stage builds
   - .dockerignore

4. **Secrets**
   - Ne jamais hardcoder
   - Utiliser Docker secrets
   - Variables d'environnement

### Performance

1. **Optimiser les layers**
   - Mettre commandes qui changent rarement en premier
   - Combiner RUN quand possible
   - .dockerignore pour exclure fichiers

2. **Cache de build**
   ```dockerfile
   # Copier package.json séparément
   COPY package*.json ./
   RUN npm ci
   # Puis copier le reste
   COPY . .
   ```

> [!tip] Pourquoi cet ordre précis
> Docker invalide le cache d'une layer dès que son contenu change, **et toutes les layers suivantes avec elle**. Copier `package.json` avant le reste du code fait que modifier un fichier source ne réinvalide pas `npm ci` (layer coûteuse) — seule la dernière `COPY . .` est refaite. Inverser l'ordre ferait réinstaller toutes les dépendances à chaque changement de code.

3. **Images légères**
   - Alpine plutôt que Ubuntu
   - Nettoyer après installation
   - Multi-stage builds

### .dockerignore

```
node_modules
npm-debug.log
.git
.env
*.md
.vscode
```

## Networking

### Types de réseaux

**bridge** (défaut)
- Communication entre conteneurs sur même hôte

**host**
- Utilise directement le réseau de l'hôte

**none**
- Pas de réseau

**overlay**
- Communication entre hôtes (Swarm)

## Volumes et persistance

### Types de volumes

**Named volumes**
```bash
docker volume create mydata
docker run -v mydata:/data nginx
```

**Bind mounts**
```bash
docker run -v /host/path:/container/path nginx
```

**tmpfs** (en mémoire)
```bash
docker run --tmpfs /tmp nginx
```

## Debugging

```bash
# Inspecter un conteneur
docker inspect conteneur

# Statistiques en temps réel
docker stats

# Événements
docker events

# Processes dans conteneur
docker top conteneur

# Copier fichiers
docker cp conteneur:/path/file /local/path
```

## Orchestration

Voir aussi:
- [[Kubernetes]] - Orchestration avancée
- Docker Swarm - Orchestration native Docker

## Ressources

- [Documentation officielle](https://docs.docker.com)
- Docker Hub
- Play with Docker
- Best practices guide

## Sujets à approfondir

- [ ] Docker Swarm
- [ ] BuildKit
- [ ] Docker Registry privé
- [ ] Health checks
- [ ] Resource limits


*Dernière mise à jour: 2026-01-01*
