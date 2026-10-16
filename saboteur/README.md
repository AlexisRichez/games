# Saboteur en ligne

Version navigateur du jeu Saboteur (Frédéric Moyersoen / Amigo), de 3 à 10 joueurs, plus une variante non officielle à 2 joueurs.

## Lancer le serveur

Il faut Node.js (18 ou plus). Aucune dépendance à installer :

```
node server.js
# puis http://localhost:8000  (port modifiable : PORT=3000 node server.js)
```

Pour jouer à distance, le serveur doit être joignable par les joueurs : un VPS, un Raspberry Pi, ou votre PC avec une redirection de port sur la box.
Derrière un reverse proxy (nginx, Caddy…), pensez à transmettre les WebSocket sur le chemin `/ws`.

## Avec Docker (Raspberry Pi, NAS, VPS…)

Une image Docker permet de lancer le jeu en une commande, sans installer Node.js. Elle repose sur `node:22-alpine`, publiée pour toutes les architectures courantes : PC (amd64), Raspberry Pi 3/4/5 en 64 bits (arm64), Pi 2/3/4 en 32 bits (arm/v7) et Pi Zero/1 (arm/v6). Docker choisit automatiquement la bonne variante, il suffit de construire l'image **sur le Pi lui-même**.

Fichiers fournis :

| Fichier | Rôle |
|---|---|
| `Dockerfile` | Image légère basée sur Alpine : seuls les fichiers du jeu sont copiés, le serveur tourne en utilisateur non-root, avec un contrôle de santé. |
| `compose.yaml` | Lancement avec redémarrage automatique, limites mémoire/CPU, système de fichiers en lecture seule, logs plafonnés. |
| `.dockerignore` | N'envoie à la construction que ce dont l'image a besoin. |

### 1. Installer Docker sur le Raspberry Pi

Sur Raspberry Pi OS (ou toute Debian/Ubuntu) :

```
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # pour utiliser docker sans sudo
# se déconnecter / reconnecter pour que le groupe soit pris en compte
docker compose version          # vérifie que le plugin compose est présent
```

### 2. Copier le jeu sur le Pi

Avec `git clone`, une clé USB ou depuis le PC :

```
scp -r saboteur/ pi@raspberrypi.local:~/saboteur
```

### 3. Lancer

```
cd ~/saboteur
docker compose up -d --build
```

Le jeu est accessible sur `http://<ip-du-pi>:8000` (l'IP s'obtient avec `hostname -I`). Le conteneur redémarre tout seul après un plantage ou un reboot du Pi.

Pour utiliser un autre port côté Pi (par exemple 80) :

```
SABOTEUR_PORT=80 docker compose up -d
```

(ou mettre `SABOTEUR_PORT=80` dans un fichier `.env` à côté de `compose.yaml`).

### Sans Docker Compose

```
docker build -t saboteur .
docker run -d --name saboteur --restart unless-stopped --init -p 8000:8000 saboteur
```

### Commandes utiles

| Action | Commande |
|---|---|
| Voir l'état (dont le contrôle de santé) | `docker compose ps` |
| Suivre les logs | `docker compose logs -f` |
| Arrêter | `docker compose down` |
| Mettre à jour après modification du code | `docker compose up -d --build` |
| Faire le ménage des anciennes images | `docker image prune` |

Rappel : les parties sont en mémoire, donc un arrêt, une mise à jour ou un redémarrage du conteneur termine les parties en cours.

### Construire depuis un PC pour le Pi

Construire sur le Pi est le plus simple. Pour préparer l'image ailleurs (Pi Zero lent, pas d'accès réseau…), utiliser `buildx` puis transférer l'archive :

```
# sur le PC : linux/arm64 pour un Pi OS 64 bits, linux/arm/v7 pour 32 bits, linux/arm/v6 pour un Pi Zero/1
docker buildx build --platform linux/arm64 -t saboteur --output type=docker,dest=saboteur.tar .
scp saboteur.tar pi@raspberrypi.local:~

# sur le Pi
docker load -i saboteur.tar
docker run -d --name saboteur --restart unless-stopped --init -p 8000:8000 saboteur
```

### Jouer depuis l'extérieur

Par défaut, seuls les appareils du réseau local voient le Pi. Pour inviter des amis à distance :

- **Redirection de port** sur la box : port externe au choix vers `<ip-du-pi>:8000` (TCP). Donner aux joueurs `http://<ip-publique>:<port>`. Penser à fixer l'IP du Pi dans la box.
- **Reverse proxy avec HTTPS** (Caddy, nginx, Traefik…) : le WebSocket passe par le chemin `/ws`, il doit être transmis. Exemple Caddy, qui gère le certificat et les WebSocket tout seul :
  ```
  saboteur.mon-domaine.fr {
      reverse_proxy 127.0.0.1:8000
  }
  ```
- **Tunnel** sans ouvrir de port (Tailscale, Cloudflare Tunnel…) : pointer le tunnel sur `http://localhost:8000`.

### Dépannage

- **`WARNING: Your kernel does not support memory limit capabilities`** : Raspberry Pi OS désactive parfois le contrôle mémoire. Sans gravité (la limite est juste ignorée). Pour l'activer, ajouter `cgroup_enable=memory cgroup_memory=1` à la fin de la ligne de `/boot/firmware/cmdline.txt` (ou `/boot/cmdline.txt` sur les anciennes versions) puis redémarrer.
- **`exec format error`** : l'image a été construite pour une autre architecture. La reconstruire sur le Pi, ou avec le bon `--platform`.
- **La page s'affiche mais la partie ne se lance pas / « déconnecté »** : le WebSocket est bloqué, en général par un reverse proxy qui ne transmet pas `/ws`.
- **Le port 8000 est déjà pris** : changer `SABOTEUR_PORT`.
- **Conteneur `unhealthy`** : `docker compose logs` pour voir l'erreur du serveur.

## Jouer

1. Ouvrir l'adresse du serveur, saisir son nom puis cliquer « Créer une partie ».
2. Envoyer le lien affiché (`…?room=saboteur-xxxxxx`) aux amis.
3. Quand tout le monde est dans le salon, l'hôte (le créateur) lance la partie.

Si un joueur recharge sa page, il reprend sa place automatiquement (même onglet). Personne n'a besoin de garder sa page ouverte pour que la partie continue.
Les parties sont gardées en mémoire : un redémarrage du serveur les efface.

## Technique

- `game.js` : moteur de règles (sans DOM), utilisé côté serveur et côté navigateur (affichage des coups possibles).
- `server.js` : sert les fichiers et fait tourner les parties. Il détient l'état complet et envoie à chaque joueur une vue filtrée (pas de mains adverses ni de rôles cachés côté client). WebSocket implémenté à la main, sans bibliothèque.
- `app.js` : interface ; n'envoie que des actions au serveur.
- `pixel.js` : images des cartes en pixel art, dessinées au vol dans un canvas (aucun fichier image). Toutes les cartes sont visibles sur `/cartes.html`.
- `fonts/` : polices pixel Press Start 2P et VT323 (licence SIL OFL, textes dans `fonts/OFL-*.txt`), servies localement.
- Aucun service tiers : ni serveur de mise en relation, ni CDN.
- `Dockerfile`, `compose.yaml`, `.dockerignore` : image Docker multi-architecture (voir plus haut).
