---
title: "Docker — Fiche technique"
domain: "Applied Sciences"
subdomain: "Computer Science > DevSecOps > Docker"
tags: [sciences-appliquées, informatique, devsecops, docker]
date: "2025-05-04"
prerequis: ["[[Docker]]"]
---

# Docker — Fiche technique

Docker est un logiciel de virtualisation par conteneur, cela veut dire qu’il virtualise chaque application et non pas un système d’exploitation.
## Vocabulaire

### Démon Docker

Le démon Docker est l'élément invisible de Docker. Il permet la mise en place du processus de virtualisation par conteneur.

### Client Docker

Le client Docker est l'outil utilisé par les utilisateurs pour contrôler les conteneurs via le démon.

## Commandes client

|Commande|Action|
|---|---|
|docker help|Aide|
|docker image|Gestion des images|
|docker container|Gestion des conteneurs|
|docker ps|Alias vers docker container ls|
|docker run|Créer un conteneur à partir d’une image|
|docker stop [container]|Arrêt d’un conteneur|
|docker start [container]|Démarrage d’un conteneur arrêté|
|docker exec|Execution d’une commande dans le conteneur|
|docker build|Construction d’une image|

## Options commandes

|Option|Action|
|---|---|
|—rm|Supprimer le conteneur dès qu’il s’arrête|
|-i|Conserver l’entrée standard ouverte|
|-t|Alloue un pseudo terminal pour les entrées/sorties. Fréquemment|
|utilisé en combinaison avec -i||
|-d|Lancer le conteneur en arrière plan|
|—name|Donne un nom au conteneur|
|-p entré:sortie|Expose un port réseau|
|—env|Configure une variable d’environnement dans le conteneur|
|—entrypoint|Commande à partir duquel va s’éxecuter l’option passé à l’image|
|-v nomvolume:chemindansleconteneur|Spécifier un volume à utiliser|
|-v cheminverslerepertoire:chemindansleconteneur|Spécifier un bind mount|
|—hostname|Change le nom d’hôte du conteneur|

> [!warning] Piège
> Sans `--rm`, chaque `docker run` laisse un conteneur arrêté sur le disque même après usage — `docker ps -a` finit par lister des dizaines de conteneurs morts. Utile de garder `--rm` par défaut pour les conteneurs jetables (tests, débogage ponctuel), et de le retirer seulement quand on veut inspecter les logs/l'état après coup.

## Persistance des données

La persistance des données sert à conserver des données entre les différents conteneurs. Il existe deux moyens de conserver des données sur docker : les **volumes** et les **bind mounts**.

## Les Volumes

Les volumes est le moyen le plus utilisé pour stocker des données à ce jour. Par défaut, les volumes sont stockés sur la machine physique dans le répertoire `/var/lib/docker/volumes`.

|Commande|Action|
|---|---|
|docker volume ls|Lister les volume|
|docker volume create|Créer un volume|
|docker volume prune|Supprimer les volumes utilisés par aucun conteneur|
|docker volume rm|Supprimer un volume|
|docker volume inspect|Inspecter un volume|

## Les Bind mounts

Nous rendons ici disponible un repertoire de la machine hôte vers le conteneur.

> [!tip] Volume ou bind mount ?
> Un volume est géré par Docker (portable, indépendant de la structure de l'hôte) — à préférer pour les données persistantes d'une application (base de données, uploads). Un bind mount pointe vers un chemin précis de l'hôte — utile en développement pour monter le code source et voir les changements en direct, mais couple le conteneur à la structure de fichiers de cette machine précise.

## Création d’une image docker

Une image docker est un fichier dockerfile utilisé afin d’executer une liste d’action à son execution.

Options utiles pour la commande `docker build`

|Option|Action|
|---|---|
|-t|Spécifier un nom et une version de sortie|

## Syntaxe

```docker
FROM image_dorigine
RUN ligne de commande
# Créer si besoin et se placer dans un répertoire
WORKDIR /chemin/vers/ailleurs

# Copie fichier.txt depuis le contexte vers l'image dans
# le répertoire /destination/
COPY fichier.txt /destination/

# Lancer des commandes
RUN ["apt-get", "install", "python3"]
CMD ["/bin/echo", "Hello world"]
ENTRYPOINT ["/bin/echo", "Hello world"]

# Déclarer des variables d'environnement
ENV name John Dow
ENTRYPOINT echo "Hello, $name"

# Informer docker que le conteneur écoute sur un port
EXPOSE numero_de_port

# indique les chemins qui correspondront à des volumes
VOLUME ["/liste/des", "/chemin"]
```
